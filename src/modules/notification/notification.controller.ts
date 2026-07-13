import { Response } from 'express';
import mongoose from 'mongoose';
import { commonResponse } from '../../utils/response';
import { IAuthRequest } from '../../types';
import NotificationTemplate from './notification-template.model';
import Notification from './notification.model';
import NotificationCampaign from './notification-campaign.model';
import UserDevice from './user-device.model';
import { TEMPLATE_DEFAULTS, seedTemplates } from './notification-template.service';
import { dispatch } from './custom-notification.service';
import { logger } from '../../utils/logger';

/* ----------------------------- Template management ----------------------------- */

export const listTemplates = async (_req: IAuthRequest, res: Response): Promise<void> => {
  try {
    // Ensure defaults exist (first-run safety) then return all templates.
    await seedTemplates();
    const data = await NotificationTemplate.find().sort({ channel: 1, name: 1 }).lean().exec();
    res.status(200).json(commonResponse('Notification templates fetched successfully', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const getTemplateByKey = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { key } = req.params;
    let data = await NotificationTemplate.findOne({ key }).lean().exec();
    if (!data && TEMPLATE_DEFAULTS[key]) {
      data = { key, ...TEMPLATE_DEFAULTS[key], isActive: true } as any;
    }
    if (!data) {
      res.status(404).json(commonResponse('Template not found', false)); return;
    }
    res.status(200).json(commonResponse('Template fetched successfully', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const updateTemplate = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { key } = req.params;
    const { subject, body, name, description, variables, isActive } = req.body;

    const update: Record<string, unknown> = {};
    if (subject !== undefined) update.subject = subject;
    if (body !== undefined) update.body = body;
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (Array.isArray(variables)) update.variables = variables;
    if (isActive !== undefined) update.isActive = isActive;

    if (Object.keys(update).length === 0) {
      res.status(400).json(commonResponse('At least one field to update is required', false)); return;
    }

    const def = TEMPLATE_DEFAULTS[key];
    const setOnInsert: Record<string, unknown> = {
      key,
      channel: def?.channel || 'inapp',
    };
    if (update.name === undefined) {
      setOnInsert.name = def?.name ?? key;
    }
    const data = await NotificationTemplate.findOneAndUpdate(
      { key },
      {
        $set: update,
        // Backfill required fields if the doc is created here for an unseeded key.
        $setOnInsert: setOnInsert,
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).exec();

    res.status(200).json(commonResponse('Template updated successfully', true, data));
  } catch (error) {
    logger.error('Notification template update failed', {
      key: req.params.key,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

/* ------------------------------ Admin broadcasts ------------------------------ */

export const sendNotification = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { audience = 'all', role, userIds, title, body, data: payload, email } = req.body;
    if (!title) {
      res.status(400).json(commonResponse('title is required', false)); return;
    }

    const result = await dispatch({
      audience,
      role,
      userIds,
      title,
      body: body || '',
      data: payload || {},
      templateKey: 'custom-broadcast',
      source: 'broadcast',
      recordCampaign: true,
      createdBy: req.user,
      createdByName: req.userName,
      email: !!email,
    });

    // Explain a 0 push so the admin isn't left guessing.
    let pushNote = ` · push: ${result.pushSent} delivered`;
    if (result.pushSent === 0) {
      if (!result.pushConfigured) {
        pushNote = ' · push NOT delivered (FCM not configured on server — set FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY and install firebase-admin)';
      } else if (result.deviceCount === 0) {
        pushNote = ' · push NOT delivered (no devices registered yet — open the rebuilt app to register a device)';
      } else {
        pushNote = ` · push NOT delivered (0 of ${result.deviceCount} device tokens accepted)`;
      }
    }
    const emailNote = email ? ` · ${result.emailQueued} email(s) queued` : '';
    res.status(201).json(commonResponse(
      `Notification sent to ${result.recipientCount} recipient(s)${pushNote}${emailNote}`,
      true,
      result,
    ));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const listCampaigns = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const data = await NotificationCampaign.find().sort({ createdAt: -1 }).limit(limit).lean().exec();
    res.status(200).json(commonResponse('Campaigns fetched successfully', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

/* -------------------------------- Mobile feed -------------------------------- */

export const getFeed = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user;
    if (!userId) { res.status(401).json(commonResponse('Unauthorized', false)); return; }

    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const skip = Math.max(Number(req.query.skip) || 0, 0);

    const [data, total] = await Promise.all([
      Notification.find({ user: userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      Notification.countDocuments({ user: userId }).exec(),
    ]);

    res.status(200).json(commonResponse('Notifications fetched successfully', true, data, {
      total,
      skip,
      limit,
      returned: data.length,
      hasMore: skip + data.length < total,
    }));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const getUnreadCount = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user;
    if (!userId) { res.status(401).json(commonResponse('Unauthorized', false)); return; }
    const count = await Notification.countDocuments({ user: userId, isRead: false }).exec();
    res.status(200).json(commonResponse('Unread count fetched successfully', true, { count }));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const markRead = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user;
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) { res.status(400).json(commonResponse('Invalid id', false)); return; }
    const data = await Notification.findOneAndUpdate(
      { _id: id, user: userId },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true },
    ).exec();
    if (!data) { res.status(404).json(commonResponse('Notification not found', false)); return; }
    res.status(200).json(commonResponse('Notification marked as read', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const markAllRead = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user;
    if (!userId) { res.status(401).json(commonResponse('Unauthorized', false)); return; }
    const result = await Notification.updateMany(
      { user: userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } },
    ).exec();
    res.status(200).json(commonResponse('All notifications marked as read', true, { modified: result.modifiedCount }));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

/* ------------------------------ Device registry ------------------------------ */

export const registerDevice = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    // optionalAuth: userId is set when signed in, undefined for guests.
    const userId = req.user;
    const { token, platform } = req.body;
    if (!token || !platform) { res.status(400).json(commonResponse('token and platform are required', false)); return; }

    const data = await UserDevice.findOneAndUpdate(
      { token },
      { $set: { user: userId || null, platform, lastSeenAt: new Date() } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();

    res.status(200).json(commonResponse('Device registered successfully', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const unregisterDevice = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { token } = req.body;
    if (!token) { res.status(400).json(commonResponse('token is required', false)); return; }
    // Token is device-unique, so removing by token alone is sufficient.
    await UserDevice.deleteOne({ token }).exec();
    res.status(200).json(commonResponse('Device unregistered successfully', true));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};
