import { inlineSocialIconsForPreview } from '../../utils/email-social-icons';
import { buildPromotionalHtml } from '../../workers/email-worker';
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { commonResponse } from '../../utils/response';
import { IAuthRequest } from '../../types';
import { logger } from '../../utils/logger';
import { dispatchEmail } from '../../queue/email-dispatch';
import { Subscriber, EmailCampaign, User } from '../../models';
import { MarketingAudience } from './email-campaign.model';
import {
  AUDIENCE_KEYS,
  audienceCounts,
  collectRecipients,
  isValidEmail,
  normalizeEmail,
  syncMarketingSubscription,
  verifyUnsubscribeToken,
} from './marketing.service';

// How many recipients each queued email job handles. Keeps a single job's
// runtime bounded and lets sending progress stream in across chunks.
const CHUNK_SIZE = 40;

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const sanitizeAudiences = (input: unknown): MarketingAudience[] => {
  if (!Array.isArray(input)) return [];
  return input.filter((a): a is MarketingAudience => AUDIENCE_KEYS.includes(a as MarketingAudience));
};

// Turn arbitrary request content into the exact shape stored on a campaign.
// Shared by "send" and "save draft" so a saved email reloads identically.
const normalizeCampaignContent = (content?: Record<string, unknown>) => ({
  mode: content?.mode === 'custom' ? ('custom' as const) : ('branded' as const),
  html: content?.html ? String(content.html) : '',
  blocks: Array.isArray(content?.blocks) ? content.blocks.slice(0, 200) : undefined,
  editorProject: content?.editorProject && typeof content.editorProject === 'object' && !Array.isArray(content.editorProject) ? content.editorProject : undefined,
  heading: content?.heading ? String(content.heading) : '',
  body: content?.body ? String(content.body) : '',
  imageUrl: content?.imageUrl ? String(content.imageUrl) : '',
  ctaLabel: content?.ctaLabel ? String(content.ctaLabel) : '',
  ctaUrl: content?.ctaUrl ? String(content.ctaUrl) : '',
});

// A draft is worth saving if the author has typed anything at all. Subject and
// content may both be incomplete — this is a work-in-progress save.
const hasDraftContent = (subject: string, content: ReturnType<typeof normalizeCampaignContent>): boolean =>
  Boolean(subject || content.heading || content.body || content.imageUrl || content.html);


/* --------------------------- Public: newsletter opt-in --------------------------- */

export const subscribeNewsletter = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = normalizeEmail(String(req.body.email || ''));
    const name = req.body.name ? String(req.body.name).trim().slice(0, 120) : undefined;
    if (!isValidEmail(email)) {
      res.status(400).json(commonResponse('Please enter a valid email address', false));
      return;
    }

    // Re-subscribes anyone who previously opted out; first-time sign-ups are created.
    // The helper also re-enables the profile toggle for registered customers.
    await syncMarketingSubscription(email, true, 'newsletter', name);

    res.status(200).json(commonResponse("You're on the list! Thanks for subscribing.", true));
  } catch (error) {
    // A duplicate-key race just means they are already subscribed — treat as success.
    if ((error as { code?: number })?.code === 11000) {
      res.status(200).json(commonResponse("You're already on the list.", true));
      return;
    }
    logger.error('Newsletter subscribe failed', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json(commonResponse('Something went wrong. Please try again.', false));
  }
};

export const unsubscribeNewsletter = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = normalizeEmail(String(req.body.email || req.query.e || ''));
    const token = String(req.body.token || req.query.t || '');
    if (!isValidEmail(email) || !verifyUnsubscribeToken(email, token)) {
      res.status(400).json(commonResponse('This unsubscribe link is invalid or has expired.', false));
      return;
    }

    // Upsert so we suppress future sends even for people who only ever existed as
    // registered users / leads (no prior Subscriber row). Registered customers
    // also get their profile toggle switched off so both views agree.
    await syncMarketingSubscription(email, false, 'newsletter');

    res.status(200).json(commonResponse('You have been unsubscribed from promotional emails.', true));
  } catch (error) {
    logger.error('Newsletter unsubscribe failed', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json(commonResponse('Something went wrong. Please try again.', false));
  }
};

/* ------------------------------- Admin: audience -------------------------------- */

export const getAudienceCounts = async (_req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const result = await audienceCounts();
    res.status(200).json(commonResponse('Audience counts fetched successfully', true, result));
  } catch (error) {
    logger.error('Audience count failed', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

// Resolve the exact recipient count for a given audience selection (shown live in
// the composer before sending).
export const previewAudience = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const audiences = sanitizeAudiences(req.body.audiences);
    const recipients = await collectRecipients(audiences);
    res.status(200).json(commonResponse('Recipient count computed', true, { count: recipients.length }));
  } catch (error) {
    logger.error('Audience preview failed', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

/* ------------------------------- Admin: campaigns ------------------------------- */

// Preview uses the same renderer as queued and inline delivery.
export const previewCampaign = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const html = buildPromotionalHtml({
      ...normalizeCampaignContent(req.body.content),
      subject: String(req.body.subject || ''),
      previewText: String(req.body.previewText || ''),
    }, '#unsubscribe-preview');
    res.status(200).json(commonResponse('Email preview', true, { html: inlineSocialIconsForPreview(html) }));
  } catch {
    res.status(400).json(commonResponse('Could not render email content', false));
  }
};

// Send a single test email to the admin so they can eyeball the real thing.
export const sendTestEmail = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { subject, previewText, content } = req.body;
    const email = normalizeEmail(String(req.body.email || ''));
    if (!isValidEmail(email)) {
      res.status(400).json(commonResponse('Enter a valid test email address', false));
      return;
    }
    if (!subject || !String(subject).trim()) {
      res.status(400).json(commonResponse('Subject is required', false));
      return;
    }
    const sent = await dispatchEmail('promotional-email', {
      recipients: [{ email }],
      subject: String(subject).trim(),
      previewText: previewText ? String(previewText) : '',
      content: normalizeCampaignContent(content),
    });
    if (!sent) {
      res.status(502).json(commonResponse('Could not send the test email (mail service unavailable)', false));
      return;
    }
    res.status(200).json(commonResponse(`Test email sent to ${email}`, true));
  } catch (error) {
    logger.error('Test email failed', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const sendCampaign = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { subject, previewText, content } = req.body;
    const audiences = sanitizeAudiences(req.body.audiences);

    if (!subject || !String(subject).trim()) {
      res.status(400).json(commonResponse('Subject is required', false));
      return;
    }
    if (audiences.length === 0) {
      res.status(400).json(commonResponse('Select at least one audience', false));
      return;
    }

    const recipients = await collectRecipients(audiences);
    if (recipients.length === 0) {
      res.status(400).json(commonResponse('No valid recipients found for the selected audience', false));
      return;
    }

    const mode = content?.mode === 'custom' ? 'custom' : 'branded';
    if (mode === 'custom' && !String(content?.html || '').trim()) {
      res.status(400).json(commonResponse('Add the email HTML for the custom layout', false));
      return;
    }
    const normalizedContent = normalizeCampaignContent(content);

    const campaign = await EmailCampaign.create({
      subject: String(subject).trim(),
      previewText: previewText ? String(previewText) : '',
      content: normalizedContent,
      audiences,
      status: 'sending',
      recipientCount: recipients.length,
      createdBy: req.user && mongoose.isValidObjectId(req.user) ? req.user : undefined,
      createdByName: req.userName,
    });

    // Fan out in chunks. Each queued job sends its slice and folds the result
    // back into the campaign counters (see the promotional-email worker handler).
    let queued = 0;
    let dropped = 0;
    for (let i = 0; i < recipients.length; i += CHUNK_SIZE) {
      const chunk = recipients.slice(i, i + CHUNK_SIZE);
      const ok = await dispatchEmail('promotional-email', {
        campaignId: String(campaign._id),
        recipients: chunk,
        subject: campaign.subject,
        previewText: campaign.previewText,
        content: normalizedContent,
      });
      if (ok) queued += chunk.length;
      else dropped += chunk.length;
    }

    // Chunks we could neither queue nor send inline are already-failed recipients.
    if (dropped > 0) {
      await EmailCampaign.updateOne({ _id: campaign._id }, { $inc: { failedCount: dropped } }).exec();
    }

    res.status(201).json(commonResponse(
      `Campaign started — sending to ${recipients.length} recipient(s).`,
      true,
      { campaignId: String(campaign._id), recipientCount: recipients.length, queued, dropped },
    ));
  } catch (error) {
    logger.error('Send campaign failed', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const listCampaigns = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const status = String(req.query.status || '').trim();

    // The Sent history tab asks for everything except drafts; the Saved tab
    // explicitly asks for drafts. An explicit sending/sent/failed value filters
    // down to that status.
    const filter: Record<string, unknown> = {};
    if (status === 'draft' || status === 'sending' || status === 'sent' || status === 'failed') {
      filter.status = status;
    } else if (status !== 'all') {
      filter.status = { $ne: 'draft' };
    }

    const data = await EmailCampaign.find(filter).sort({ createdAt: -1 }).limit(limit).lean().exec();
    res.status(200).json(commonResponse('Campaigns fetched successfully', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

/**
 * Create or update a saved campaign (a draft) so a composed email can be reused.
 * Pass `id` to update an existing draft, omit it to save a new one. Sending is a
 * separate step, so incomplete emails are allowed as long as something was typed.
 */
export const saveCampaignDraft = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.body;
    const subject = String(req.body.subject || '').trim();
    const previewText = req.body.previewText ? String(req.body.previewText) : '';
    const content = normalizeCampaignContent(req.body.content);
    const audiences = sanitizeAudiences(req.body.audiences);

    if (!hasDraftContent(subject, content)) {
      res.status(400).json(commonResponse('Add a subject or some content before saving', false));
      return;
    }

    const payload = { subject, previewText, content, audiences };

    if (id) {
      if (!mongoose.isValidObjectId(id)) {
        res.status(400).json(commonResponse('Invalid draft id', false));
        return;
      }
      // Only drafts are editable. A sent/sending campaign is a historical record.
      const updated = await EmailCampaign.findOneAndUpdate(
        { _id: id, status: 'draft' },
        { $set: payload },
        { new: true },
      ).lean().exec();
      if (!updated) {
        res.status(404).json(commonResponse('Saved email not found', false));
        return;
      }
      res.status(200).json(commonResponse('Saved email updated', true, updated));
      return;
    }

    const created = await EmailCampaign.create({
      ...payload,
      status: 'draft',
      recipientCount: 0,
      createdBy: req.user && mongoose.isValidObjectId(req.user) ? req.user : undefined,
      createdByName: req.userName,
    });
    res.status(201).json(commonResponse('Email saved for later', true, created.toObject()));
  } catch (error) {
    logger.error('Save campaign draft failed', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

/**
 * Delete a saved email (or a finished campaign from history). Anything currently
 * sending is protected so a live fan-out is not orphaned.
 */
export const deleteCampaign = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json(commonResponse('Invalid campaign id', false));
      return;
    }

    const campaign = await EmailCampaign.findById(id).select('status').lean().exec();
    if (!campaign) {
      res.status(404).json(commonResponse('Campaign not found', false));
      return;
    }
    if (campaign.status === 'sending') {
      res.status(400).json(commonResponse('This campaign is still sending and cannot be deleted', false));
      return;
    }

    await EmailCampaign.findByIdAndDelete(id).exec();
    res.status(200).json(commonResponse('Campaign deleted successfully', true));
  } catch (error) {
    logger.error('Delete campaign failed', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

/* ------------------------------ Admin: subscribers ------------------------------ */

export const listSubscribers = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const skip = Math.max(Number(req.query.skip) || 0, 0);
    const status = String(req.query.status || '').trim();
    const search = String(req.query.q || '').trim();

    const filter: Record<string, unknown> = {};
    if (status === 'subscribed' || status === 'unsubscribed') filter.status = status;
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ email: pattern }, { name: pattern }];
    }

    const [data, total] = await Promise.all([
      Subscriber.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      Subscriber.countDocuments(filter).exec(),
    ]);

    res.status(200).json(commonResponse('Subscribers fetched successfully', true, data, {
      total, skip, limit, returned: data.length, hasMore: skip + data.length < total,
    }));
  } catch (error) {
    logger.error('List subscribers failed', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const addSubscriber = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const email = normalizeEmail(String(req.body.email || ''));
    const name = req.body.name ? String(req.body.name).trim().slice(0, 120) : undefined;
    if (!isValidEmail(email)) {
      res.status(400).json(commonResponse('Please enter a valid email address', false));
      return;
    }
    await syncMarketingSubscription(email, true, 'manual', name);
    const data = await Subscriber.findOne({ email }).lean().exec();
    res.status(200).json(commonResponse('Subscriber saved successfully', true, data));
  } catch (error) {
    logger.error('Add subscriber failed', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

/**
 * Bulk import of manually collected emails (e.g. parsed from an uploaded
 * Excel / CSV in the admin). Accepts an array of { email, name? } and upserts
 * each. Invalid rows are skipped and reported so the admin sees what stuck.
 */
export const importSubscribers = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const rows = Array.isArray(req.body.subscribers) ? req.body.subscribers : [];
    if (rows.length === 0) {
      res.status(400).json(commonResponse('No rows to import', false));
      return;
    }
    if (rows.length > 50000) {
      res.status(400).json(commonResponse('Too many rows — import 50,000 at a time or fewer', false));
      return;
    }

    // De-dupe within the file (last name wins) and drop invalid addresses.
    const map = new Map<string, string | undefined>();
    let invalid = 0;
    for (const row of rows) {
      const email = normalizeEmail(String(row?.email || ''));
      if (!isValidEmail(email)) { invalid += 1; continue; }
      const name = row?.name ? String(row.name).trim().slice(0, 120) : undefined;
      map.set(email, name ?? map.get(email));
    }

    const ops = [...map.entries()].map(([email, name]) => ({
      updateOne: {
        filter: { email },
        update: {
          $set: { status: 'subscribed', ...(name ? { name } : {}) },
          $unset: { unsubscribedAt: '' },
          $setOnInsert: { email, source: 'import' },
        },
        upsert: true,
      },
    }));

    let inserted = 0;
    let updated = 0;
    if (ops.length > 0) {
      const result = await Subscriber.bulkWrite(ops, { ordered: false });
      inserted = result.upsertedCount || 0;
      updated = (result.modifiedCount || 0) + (result.matchedCount || 0);
    }

    // Imported addresses are an explicit opt-in — clear any profile-level opt-out
    // for registered customers in the same batch so they are not suppressed.
    if (map.size > 0) {
      await User.updateMany(
        { role: 'user', email_address: { $in: [...map.keys()] } },
        { $set: { 'privacyPreferences.emailNotifications': true } },
      ).exec();
    }

    res.status(200).json(commonResponse(
      `Imported ${map.size} address(es): ${inserted} new, ${updated} updated${invalid ? `, ${invalid} skipped (invalid)` : ''}.`,
      true,
      { imported: map.size, inserted, updated, invalid },
    ));
  } catch (error) {
    logger.error('Import subscribers failed', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const updateSubscriberStatus = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const status = String(req.body.status || '');
    if (!mongoose.isValidObjectId(id)) { res.status(400).json(commonResponse('Invalid id', false)); return; }
    if (status !== 'subscribed' && status !== 'unsubscribed') {
      res.status(400).json(commonResponse('status must be subscribed or unsubscribed', false)); return;
    }

    const existing = await Subscriber.findById(id).select('email').lean().exec();
    if (!existing) { res.status(404).json(commonResponse('Subscriber not found', false)); return; }

    // Route through the shared helper so a registered customer's profile toggle
    // is updated alongside the suppression list (and unsubscribedAt is cleared
    // when they opt back in).
    await syncMarketingSubscription(existing.email, status === 'subscribed', 'manual');
    const data = await Subscriber.findById(id).lean().exec();
    res.status(200).json(commonResponse('Subscriber updated successfully', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const deleteSubscriber = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) { res.status(400).json(commonResponse('Invalid id', false)); return; }
    const data = await Subscriber.findByIdAndDelete(id).exec();
    if (!data) { res.status(404).json(commonResponse('Subscriber not found', false)); return; }
    res.status(200).json(commonResponse('Subscriber deleted successfully', true));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};
