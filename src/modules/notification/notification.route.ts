import { Router } from 'express';
import {
  listTemplates,
  getTemplateByKey,
  updateTemplate,
  searchNotificationRecipients,
  sendNotification,
  listCampaigns,
  getFeed,
  getUnreadCount,
  markRead,
  markAllRead,
  registerDevice,
  unregisterDevice,
} from './notification.controller';
import { adminMiddleware, authorize, optionalAuth, userMiddleware, validate } from '../../middleware';
import {
  updateNotificationTemplateSchema,
  sendNotificationSchema,
  registerDeviceSchema,
  unregisterDeviceSchema,
} from '../../utils/validators/zod-schemas';

const router = Router();

// ── Template management (admin + catalog-manager) ──
router.get('/notification/templates', adminMiddleware, authorize('notification:read'), listTemplates);
router.get('/notification/templates/:key', adminMiddleware, authorize('notification:read'), getTemplateByKey);
router.put('/notification/templates/:key', adminMiddleware, authorize('notification:write'), validate(updateNotificationTemplateSchema), updateTemplate);

// ── Admin broadcasts ──
router.get('/notification/recipients', adminMiddleware, authorize('notification:write'), searchNotificationRecipients);
router.post('/notification/send', adminMiddleware, authorize('notification:write'), validate(sendNotificationSchema), sendNotification);
router.get('/notification/campaigns', adminMiddleware, authorize('notification:read'), listCampaigns);

// ── Mobile feed (authenticated user) ──
router.get('/notification/feed', userMiddleware, getFeed);
router.get('/notification/feed/unread-count', userMiddleware, getUnreadCount);
router.put('/notification/feed/read-all', userMiddleware, markAllRead);
router.put('/notification/feed/:id/read', userMiddleware, markRead);

// ── Device registry (FCM) ──
// optionalAuth: guests can register too (push without login); the token is linked
// to a user automatically when they sign in and re-register.
router.post('/notification/device/register', optionalAuth, validate(registerDeviceSchema), registerDevice);
router.post('/notification/device/unregister', optionalAuth, validate(unregisterDeviceSchema), unregisterDevice);

export default router;
