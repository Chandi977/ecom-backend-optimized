import { Router } from 'express';
import {
  subscribeNewsletter,
  unsubscribeNewsletter,
  getAudienceCounts,
  previewAudience,
  sendTestEmail,
  sendCampaign,
  listCampaigns,
  listSubscribers,
  addSubscriber,
  importSubscribers,
  updateSubscriberStatus,
  deleteSubscriber,
} from './marketing.controller';
import { adminMiddleware, authorize } from '../../middleware';

const router = Router();

// ── Public (storefront) ──
// Footer "Join the list" newsletter banner.
router.post('/newsletter/subscribe', subscribeNewsletter);
// One-click unsubscribe link embedded in every promotional email.
router.post('/newsletter/unsubscribe', unsubscribeNewsletter);

// ── Admin: audience + campaigns (admin-only via marketing:* perms) ──
router.get('/marketing/audience', adminMiddleware, authorize('marketing:read'), getAudienceCounts);
router.post('/marketing/audience/preview', adminMiddleware, authorize('marketing:read'), previewAudience);
router.post('/marketing/campaigns/test', adminMiddleware, authorize('marketing:write'), sendTestEmail);
router.post('/marketing/campaigns/send', adminMiddleware, authorize('marketing:write'), sendCampaign);
router.get('/marketing/campaigns', adminMiddleware, authorize('marketing:read'), listCampaigns);

// ── Admin: subscribers ──
// "import" registered before any ":id" routes so it's never treated as an id.
router.get('/marketing/subscribers', adminMiddleware, authorize('marketing:read'), listSubscribers);
router.post('/marketing/subscribers', adminMiddleware, authorize('marketing:write'), addSubscriber);
router.post('/marketing/subscribers/import', adminMiddleware, authorize('marketing:write'), importSubscribers);
router.patch('/marketing/subscribers/:id', adminMiddleware, authorize('marketing:write'), updateSubscriberStatus);
router.delete('/marketing/subscribers/:id', adminMiddleware, authorize('marketing:write'), deleteSubscriber);

export default router;
