import { Router } from 'express';
import {
  getProductReviews,
  getProductSummary,
  getEligibility,
  getMyReview,
  createReview,
  updateMyReview,
  deleteMyReview,
  markHelpful,
  adminListReviews,
  adminCountPending,
  setReviewStatus,
  replyToReview,
  adminDeleteReview,
} from './review.controller';
import { userMiddleware, adminMiddleware, authorize, validate } from '../../middleware';
import { createReviewSchema, updateReviewSchema, reviewStatusSchema, reviewReplySchema } from '../../utils/validators/zod-schemas';

const router = Router();

// --- Public (no auth): read approved reviews / rating summary ---
router.get('/review/product/:productId', getProductReviews);
router.get('/review/summary/:productId', getProductSummary);

// --- Admin moderation (registered before the generic /review/:id routes so
//     "admin" is never captured as an :id) ---
router.get('/review/admin/list', adminMiddleware, authorize('review:moderate'), adminListReviews);
router.get('/review/admin/count', adminMiddleware, authorize('review:moderate'), adminCountPending);
router.patch('/review/admin/:id/status', adminMiddleware, authorize('review:moderate'), validate(reviewStatusSchema), setReviewStatus);
router.post('/review/admin/:id/reply', adminMiddleware, authorize('review:moderate'), validate(reviewReplySchema), replyToReview);
router.delete('/review/admin/:id', adminMiddleware, authorize('review:moderate'), adminDeleteReview);

// --- Authenticated customer ---
router.get('/review/eligibility/:productId', userMiddleware, getEligibility);
router.get('/review/mine/:productId', userMiddleware, getMyReview);
router.post('/review/create', userMiddleware, validate(createReviewSchema), createReview);
router.post('/review/:id/helpful', userMiddleware, markHelpful);
router.patch('/review/:id', userMiddleware, validate(updateReviewSchema), updateMyReview);
router.delete('/review/:id', userMiddleware, deleteMyReview);

export default router;
