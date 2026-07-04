import mongoose from 'mongoose';
import { User, Notification, NotificationCampaign, UserDevice } from '../../models';
import { logger } from '../../utils/logger';
import { addJob, emailQueue } from '../../queue';
import { sendPush, isPushConfigured } from './push.service';
import { renderPush } from './notification-template.service';
import { CampaignAudience } from './notification-campaign.model';

export interface IDispatchOptions {
  audience: CampaignAudience;
  // For 'role' the role name; for 'users' an array of user ids.
  role?: string;
  userIds?: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  templateKey?: string;
  source?: 'broadcast' | 'event';
  recordCampaign?: boolean;
  createdBy?: string;
  createdByName?: string;
  // Opt-in: also deliver this notification to recipients' email inboxes.
  email?: boolean;
}

export interface IDispatchResult {
  recipientCount: number;
  pushSent: number;
  emailQueued: number;
  // Diagnostics so the admin can see *why* push delivery was 0.
  deviceCount: number;
  pushConfigured: boolean;
  campaignId?: string;
}

/** Resolve the set of recipient user ids for an audience selector. */
const resolveRecipients = async (opts: IDispatchOptions): Promise<string[]> => {
  if (opts.audience === 'users') {
    return (opts.userIds || []).filter((id) => mongoose.isValidObjectId(id));
  }
  // 'all' targets customers (role 'user'); 'role' targets a specific role.
  const filter = opts.audience === 'role' && opts.role ? { role: opts.role } : { role: 'user' };
  const users = await User.find(filter).select('_id').lean().exec();
  return users.map((u) => String(u._id));
};

/**
 * Core fan-out: writes one in-app Notification per recipient, delivers a push to
 * their registered devices, and optionally records a campaign for the admin
 * "sent history". Never throws — failures are logged and reflected in the counts.
 */
export const dispatch = async (opts: IDispatchOptions): Promise<IDispatchResult> => {
  const source = opts.source || 'broadcast';
  const data = opts.data || {};
  let campaignId: string | undefined;

  const recipients = await resolveRecipients(opts);

  if (opts.recordCampaign) {
    const campaign = await NotificationCampaign.create({
      title: opts.title,
      body: opts.body,
      data,
      audience: opts.audience,
      audienceRef: opts.audience === 'role' ? opts.role : (opts.userIds || []).join(','),
      recipientCount: recipients.length,
      pushSent: 0,
      createdBy: opts.createdBy && mongoose.isValidObjectId(opts.createdBy) ? opts.createdBy : undefined,
      createdByName: opts.createdByName,
    });
    campaignId = String(campaign._id);
  }

  // Write the in-app feed items (only for identified users — guests have no feed).
  if (recipients.length > 0) {
    await Notification.insertMany(
      recipients.map((userId) => ({
        user: userId,
        title: opts.title,
        body: opts.body,
        data,
        source,
        templateKey: opts.templateKey,
        campaign: campaignId,
      })),
      { ordered: false },
    ).catch((err) => {
      logger.error('Failed to insert in-app notifications', { error: err instanceof Error ? err.message : 'Unknown' });
    });
  }

  // Deliver pushes. For an 'all' broadcast this targets EVERY registered device
  // (including guests who never logged in); otherwise only the recipients' devices.
  let pushSent = 0;
  let deviceCount = 0;
  try {
    const deviceFilter = opts.audience === 'all' ? {} : { user: { $in: recipients } };
    const devices = await UserDevice.find(deviceFilter).select('token').lean().exec();
    const tokens = devices.map((d) => d.token).filter(Boolean);
    deviceCount = tokens.length;
    if (tokens.length > 0) {
      pushSent = await sendPush(
        tokens,
        { title: opts.title, body: opts.body, image: typeof data.image === 'string' ? data.image : undefined, data },
        // Prune tokens FCM reports as permanently dead so the registry self-cleans.
        async (dead) => {
          const result = await UserDevice.deleteMany({ token: { $in: dead } }).exec();
          logger.info('Pruned dead device tokens', { count: result.deletedCount ?? dead.length });
        },
      );
    }
  } catch (err) {
    logger.error('Push fan-out failed', { error: err instanceof Error ? err.message : 'Unknown' });
  }

  // Optionally fan out to email inboxes via the existing email queue/worker.
  let emailQueued = 0;
  if (opts.email && recipients.length > 0) {
    try {
      const users = await User.find({ _id: { $in: recipients } }).select('email_address').lean().exec();
      const emails = [...new Set(users.map((u) => u.email_address).filter(Boolean))];
      if (emails.length > 0) {
        await addJob(emailQueue, 'custom-broadcast', { emails, subject: opts.title, body: opts.body });
        emailQueued = emails.length;
      }
    } catch (err) {
      logger.error('Email fan-out failed', { error: err instanceof Error ? err.message : 'Unknown' });
    }
  }

  if (campaignId) {
    await NotificationCampaign.updateOne({ _id: campaignId }, { $set: { pushSent, emailSent: emailQueued } }).exec().catch(() => undefined);
  }

  const pushConfigured = isPushConfigured();
  logger.info('Notification dispatched', { recipients: recipients.length, pushSent, deviceCount, pushConfigured, emailQueued, source, templateKey: opts.templateKey });
  return { recipientCount: recipients.length, pushSent, emailQueued, deviceCount, pushConfigured, campaignId };
};

/**
 * Event helper: render a push/in-app template and deliver it to a single user.
 * Used by transactional flows (order placed/shipped/delivered, back-in-stock).
 * No-ops quietly when the user id is missing so callers can fire-and-forget.
 */
export const notifyUserEvent = async (
  userId: string | undefined | null,
  templateKey: string,
  vars: Record<string, unknown> = {},
  data: Record<string, unknown> = {},
): Promise<void> => {
  if (!userId || !mongoose.isValidObjectId(userId)) return;
  const rendered = await renderPush(templateKey, vars);
  if (!rendered) return;
  await dispatch({
    audience: 'users',
    userIds: [String(userId)],
    title: rendered.title,
    body: rendered.body,
    data: { ...data, templateKey },
    templateKey,
    source: 'event',
  });
};
