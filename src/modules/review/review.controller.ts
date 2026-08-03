import { Response } from 'express';
import mongoose from 'mongoose';
import Review, { REVIEW_STATUSES, ReviewStatus, PAID_ORDER_STATUSES } from './review.model';
import Order from '../order/order.model';
import Product from '../product/product.model';
import User from '../auth/auth.model';
import { commonResponse } from '../../utils/response';
import { logger } from '../../utils/logger';
import { IAuthRequest } from '../../types';

const { ObjectId } = mongoose.Types;

const isValidId = (value: unknown): value is string =>
  typeof value === 'string' && ObjectId.isValid(value);

// A qualifying purchase = a paid order owned by this user that contains the
// product. Returns the order id (for provenance) or null. Used both to gate the
// write endpoint and to compute the eligibility badge shown to the client.
const findQualifyingOrder = async (userId: string, productId: string): Promise<string | null> => {
  const order = await Order.findOne({
    user: new ObjectId(userId),
    'items.product': new ObjectId(productId),
    paymentStatus: { $in: PAID_ORDER_STATUSES as unknown as string[] },
  }).select('_id').lean().exec();
  return order ? String(order._id) : null;
};

// Recompute the denormalized rating summary stored on the Product document from
// its APPROVED reviews. Called whenever a review's contribution to the public
// average changes (approve / reject / edit / delete). Kept best-effort — a failed
// recompute must never fail the parent request that already mutated the review.
export const recomputeProductRating = async (productId: string): Promise<void> => {
  try {
    const [agg] = await Review.aggregate<{ avg: number; count: number }>([
      { $match: { product: new ObjectId(productId), status: 'approved' } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    const count = agg?.count || 0;
    // Round the average to one decimal for stable display / storage.
    const average = count > 0 ? Math.round((agg.avg || 0) * 10) / 10 : 0;
    await Product.updateOne(
      { _id: productId },
      { $set: { ratingAverage: average, ratingCount: count } },
    ).exec();
  } catch (err) {
    logger.error('Failed to recompute product rating', {
      productId,
      error: err instanceof Error ? err.message : 'Unknown',
    });
  }
};

// Build the { average, count, distribution } summary from approved reviews.
const buildSummary = async (productId: string): Promise<{
  average: number;
  count: number;
  distribution: Record<number, number>;
}> => {
  const rows = await Review.aggregate<{ _id: number; count: number }>([
    { $match: { product: new ObjectId(productId), status: 'approved' } },
    { $group: { _id: '$rating', count: { $sum: 1 } } },
  ]);
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let weighted = 0;
  rows.forEach(({ _id, count }) => {
    const star = Number(_id);
    if (star >= 1 && star <= 5) {
      distribution[star] = count;
      total += count;
      weighted += star * count;
    }
  });
  const average = total > 0 ? Math.round((weighted / total) * 10) / 10 : 0;
  return { average, count: total, distribution };
};

// Shape a review document for public consumption — never leak the voter list or
// internal moderation fields.
const publicReview = (r: Record<string, unknown>): Record<string, unknown> => ({
  _id: r._id,
  product: r.product,
  rating: r.rating,
  title: r.title || '',
  comment: r.comment,
  reviewerName: r.reviewerName || 'Customer',
  verifiedPurchase: r.verifiedPurchase !== false,
  helpfulCount: r.helpfulCount || 0,
  adminReply: r.adminReply || null,
  images: Array.isArray(r.images) ? r.images : [],
  status: r.status,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

// ---------------------------------------------------------------------------
// Public endpoints
// ---------------------------------------------------------------------------

// GET /review/product/:productId — approved reviews for a product, paginated,
// with sort (recent | helpful | rating_high | rating_low) and optional rating
// filter. Returns the list plus the aggregate summary in one round-trip.
export const getProductReviews = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { productId } = req.params;
  if (!isValidId(productId)) {
    res.status(400).json(commonResponse('Invalid product id', false)); return;
  }
  try {
    const skip = Math.max(0, parseInt(String(req.query.skip ?? '0'), 10) || 0);
    const rawLimit = parseInt(String(req.query.limit ?? '10'), 10) || 10;
    const limit = Math.min(50, Math.max(1, rawLimit));
    const rating = parseInt(String(req.query.rating ?? ''), 10);

    const filter: Record<string, unknown> = { product: new ObjectId(productId), status: 'approved' };
    if (rating >= 1 && rating <= 5) filter.rating = rating;

    const sortMap: Record<string, Record<string, 1 | -1>> = {
      recent: { createdAt: -1 },
      helpful: { helpfulCount: -1, createdAt: -1 },
      rating_high: { rating: -1, createdAt: -1 },
      rating_low: { rating: 1, createdAt: -1 },
    };
    const sort = sortMap[String(req.query.sort || 'recent')] || sortMap.recent;

    const [reviews, total, summary] = await Promise.all([
      Review.find(filter).sort(sort).skip(skip).limit(limit).lean().exec(),
      Review.countDocuments(filter).exec(),
      buildSummary(productId),
    ]);

    res.status(200).json(commonResponse('Reviews fetched', true, {
      reviews: reviews.map(publicReview),
      summary,
    }, {
      total,
      skip,
      limit,
      returned: reviews.length,
      hasMore: skip + reviews.length < total,
    }));
  } catch (err) {
    logger.error('getProductReviews failed', { error: err instanceof Error ? err.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

// GET /review/summary/:productId — just the aggregate (for cards / mobile badges).
export const getProductSummary = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { productId } = req.params;
  if (!isValidId(productId)) {
    res.status(400).json(commonResponse('Invalid product id', false)); return;
  }
  try {
    const summary = await buildSummary(productId);
    res.status(200).json(commonResponse('Summary fetched', true, summary));
  } catch (err) {
    logger.error('getProductSummary failed', { error: err instanceof Error ? err.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

// ---------------------------------------------------------------------------
// Authenticated customer endpoints
// ---------------------------------------------------------------------------

// GET /review/eligibility/:productId — tells the UI whether to render the write
// form: whether this user bought the product and whether they already reviewed it.
export const getEligibility = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { productId } = req.params;
  if (!req.user) { res.status(401).json(commonResponse('Unauthorized', false)); return; }
  if (!isValidId(productId)) {
    res.status(400).json(commonResponse('Invalid product id', false)); return;
  }
  try {
    const [orderId, existing] = await Promise.all([
      findQualifyingOrder(req.user, productId),
      Review.findOne({ user: new ObjectId(req.user), product: new ObjectId(productId) }).lean().exec(),
    ]);
    const verifiedPurchase = !!orderId;
    res.status(200).json(commonResponse('Eligibility resolved', true, {
      verifiedPurchase,
      alreadyReviewed: !!existing,
      canReview: verifiedPurchase && !existing,
      review: existing ? publicReview(existing) : null,
    }));
  } catch (err) {
    logger.error('getEligibility failed', { error: err instanceof Error ? err.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

// GET /review/mine/:productId — the caller's own review (any status), so the UI
// can show its moderation state after submission.
export const getMyReview = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { productId } = req.params;
  if (!req.user) { res.status(401).json(commonResponse('Unauthorized', false)); return; }
  if (!isValidId(productId)) {
    res.status(400).json(commonResponse('Invalid product id', false)); return;
  }
  try {
    const review = await Review.findOne({
      user: new ObjectId(req.user),
      product: new ObjectId(productId),
    }).lean().exec();
    res.status(200).json(commonResponse(review ? 'Review fetched' : 'No review yet', true, review ? publicReview(review) : null));
  } catch (err) {
    logger.error('getMyReview failed', { error: err instanceof Error ? err.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

// POST /review/create — verified purchasers only; saved as pending for moderation.
export const createReview = async (req: IAuthRequest, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json(commonResponse('Unauthorized', false)); return; }
  const { productId, rating, title, comment, images } = req.body;
  if (!isValidId(productId)) {
    res.status(400).json(commonResponse('Invalid product id', false)); return;
  }
  try {
    const orderId = await findQualifyingOrder(req.user, productId);
    if (!orderId) {
      res.status(403).json(commonResponse('Only verified purchasers can review this product.', false)); return;
    }

    const existing = await Review.findOne({ user: new ObjectId(req.user), product: new ObjectId(productId) }).exec();
    if (existing) {
      res.status(409).json(commonResponse('You have already reviewed this product. Edit your existing review instead.', false)); return;
    }

    const user = await User.findById(req.user).select('first_name last_name').lean().exec();
    const reviewerName = user
      ? [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || 'Customer'
      : req.userName || 'Customer';

    const review = await Review.create({
      product: productId,
      user: req.user,
      order: orderId,
      rating,
      title,
      comment,
      reviewerName,
      verifiedPurchase: true,
      images: Array.isArray(images) ? images.slice(0, 6) : [],
      status: 'pending',
    });

    res.status(201).json(commonResponse('Thanks! Your review has been submitted and will appear once approved.', true, publicReview(review.toObject())));
  } catch (err) {
    // Unique (user, product) collision under a race → treat as duplicate.
    if ((err as { code?: number })?.code === 11000) {
      res.status(409).json(commonResponse('You have already reviewed this product.', false)); return;
    }
    logger.error('createReview failed', { error: err instanceof Error ? err.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

// PATCH /review/:id — edit own review. Any edit re-enters moderation (pending).
export const updateMyReview = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!req.user) { res.status(401).json(commonResponse('Unauthorized', false)); return; }
  if (!isValidId(id)) { res.status(400).json(commonResponse('Invalid review id', false)); return; }
  try {
    const review = await Review.findById(id).exec();
    if (!review) { res.status(404).json(commonResponse('Review not found', false)); return; }
    if (String(review.user) !== String(req.user)) {
      res.status(403).json(commonResponse('You can only edit your own review.', false)); return;
    }

    const { rating, title, comment, images } = req.body;
    if (rating !== undefined) review.rating = rating;
    if (title !== undefined) review.title = title;
    if (comment !== undefined) review.comment = comment;
    if (Array.isArray(images)) review.images = images.slice(0, 6);
    // Re-moderate on any edit and clear the stale admin reply.
    review.status = 'pending';
    review.adminReply = undefined;
    review.moderatedBy = undefined;
    review.moderatedAt = undefined;
    await review.save();

    // The edited review is no longer approved — refresh the product aggregate.
    await recomputeProductRating(String(review.product));

    res.status(200).json(commonResponse('Your review was updated and will be re-reviewed before appearing.', true, publicReview(review.toObject())));
  } catch (err) {
    logger.error('updateMyReview failed', { error: err instanceof Error ? err.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

// DELETE /review/:id — delete own review.
export const deleteMyReview = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!req.user) { res.status(401).json(commonResponse('Unauthorized', false)); return; }
  if (!isValidId(id)) { res.status(400).json(commonResponse('Invalid review id', false)); return; }
  try {
    const review = await Review.findById(id).exec();
    if (!review) { res.status(404).json(commonResponse('Review not found', false)); return; }
    if (String(review.user) !== String(req.user)) {
      res.status(403).json(commonResponse('You can only delete your own review.', false)); return;
    }
    const productId = String(review.product);
    await review.deleteOne();
    await recomputeProductRating(productId);
    res.status(200).json(commonResponse('Review deleted', true));
  } catch (err) {
    logger.error('deleteMyReview failed', { error: err instanceof Error ? err.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

// POST /review/:id/helpful — one helpful vote per user (dedupe via helpfulVoters).
export const markHelpful = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!req.user) { res.status(401).json(commonResponse('Unauthorized', false)); return; }
  if (!isValidId(id)) { res.status(400).json(commonResponse('Invalid review id', false)); return; }
  try {
    // Atomic: only add the vote (and bump the count) if this user is not already
    // in the voters set — a repeat vote matches nothing and is a silent no-op.
    const updated = await Review.findOneAndUpdate(
      { _id: id, status: 'approved', helpfulVoters: { $ne: new ObjectId(req.user) } },
      { $addToSet: { helpfulVoters: new ObjectId(req.user) }, $inc: { helpfulCount: 1 } },
      { new: true },
    ).lean().exec();

    if (updated) {
      res.status(200).json(commonResponse('Marked as helpful', true, { helpfulCount: updated.helpfulCount }));
      return;
    }
    // Either already voted or not an approved review — return the current count.
    const current = await Review.findById(id).select('helpfulCount status').lean().exec();
    if (!current || current.status !== 'approved') {
      res.status(404).json(commonResponse('Review not found', false)); return;
    }
    res.status(200).json(commonResponse('Already marked as helpful', true, { helpfulCount: current.helpfulCount }));
  } catch (err) {
    logger.error('markHelpful failed', { error: err instanceof Error ? err.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

// ---------------------------------------------------------------------------
// Admin moderation endpoints
// ---------------------------------------------------------------------------

// GET /review/admin/list — moderation queue with status/product/rating filters.
export const adminListReviews = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const skip = Math.max(0, parseInt(String(req.query.skip ?? '0'), 10) || 0);
    const rawLimit = parseInt(String(req.query.limit ?? '20'), 10) || 20;
    const limit = Math.min(100, Math.max(1, rawLimit));

    const filter: Record<string, unknown> = {};
    const status = String(req.query.status || '');
    if ((REVIEW_STATUSES as readonly string[]).includes(status)) filter.status = status;
    if (isValidId(req.query.product)) filter.product = new ObjectId(String(req.query.product));
    const rating = parseInt(String(req.query.rating ?? ''), 10);
    if (rating >= 1 && rating <= 5) filter.rating = rating;

    const [reviews, total, counts] = await Promise.all([
      Review.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('product', 'name slug images')
        .lean()
        .exec(),
      Review.countDocuments(filter).exec(),
      Review.aggregate<{ _id: ReviewStatus; count: number }>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const statusCounts: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
    counts.forEach(({ _id, count }) => { if (_id) statusCounts[_id] = count; });

    res.status(200).json(commonResponse('Reviews fetched', true, {
      reviews,
      statusCounts,
    }, {
      total,
      skip,
      limit,
      returned: reviews.length,
      hasMore: skip + reviews.length < total,
    }));
  } catch (err) {
    logger.error('adminListReviews failed', { error: err instanceof Error ? err.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

// GET /review/admin/count — pending count for the menu badge.
export const adminCountPending = async (_req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const pending = await Review.countDocuments({ status: 'pending' }).exec();
    res.status(200).json(commonResponse('Pending count', true, { pending }));
  } catch (err) {
    logger.error('adminCountPending failed', { error: err instanceof Error ? err.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

// PATCH /review/admin/:id/status — approve or reject; refresh product aggregate.
export const setReviewStatus = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!isValidId(id)) { res.status(400).json(commonResponse('Invalid review id', false)); return; }
  const status = String(req.body.status) as ReviewStatus;
  if (!(['approved', 'rejected'] as string[]).includes(status)) {
    res.status(400).json(commonResponse('Status must be approved or rejected', false)); return;
  }
  try {
    const review = await Review.findByIdAndUpdate(
      id,
      { $set: { status, moderatedBy: req.userName || 'admin', moderatedAt: new Date() } },
      { new: true },
    ).lean().exec();
    if (!review) { res.status(404).json(commonResponse('Review not found', false)); return; }
    await recomputeProductRating(String(review.product));
    res.status(200).json(commonResponse(`Review ${status}`, true, review));
  } catch (err) {
    logger.error('setReviewStatus failed', { error: err instanceof Error ? err.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

// POST /review/admin/:id/reply — public store reply attached to the review.
export const replyToReview = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!isValidId(id)) { res.status(400).json(commonResponse('Invalid review id', false)); return; }
  const message = String(req.body.message || '').trim();
  if (!message) { res.status(400).json(commonResponse('Reply message is required', false)); return; }
  try {
    const review = await Review.findByIdAndUpdate(
      id,
      { $set: { adminReply: { message, repliedAt: new Date(), repliedBy: req.userName || 'Store' } } },
      { new: true },
    ).lean().exec();
    if (!review) { res.status(404).json(commonResponse('Review not found', false)); return; }
    res.status(200).json(commonResponse('Reply saved', true, review));
  } catch (err) {
    logger.error('replyToReview failed', { error: err instanceof Error ? err.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

// DELETE /review/admin/:id — hard-delete any review; refresh product aggregate.
export const adminDeleteReview = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!isValidId(id)) { res.status(400).json(commonResponse('Invalid review id', false)); return; }
  try {
    const review = await Review.findByIdAndDelete(id).lean().exec();
    if (!review) { res.status(404).json(commonResponse('Review not found', false)); return; }
    await recomputeProductRating(String(review.product));
    res.status(200).json(commonResponse('Review deleted', true));
  } catch (err) {
    logger.error('adminDeleteReview failed', { error: err instanceof Error ? err.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};
