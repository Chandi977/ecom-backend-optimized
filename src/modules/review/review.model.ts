import mongoose, { Schema, Document, Types } from 'mongoose';

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

// Order paymentStatus values that qualify a purchase as "verified". Only orders
// whose payment has actually cleared let a customer review the product. Kept as a
// list so additional terminal-paid states can be added without touching callers.
export const PAID_ORDER_STATUSES = ['Payment Processed'] as const;

export interface IReviewReply {
  message: string;
  repliedAt: Date;
  // Admin name/email who wrote the public reply.
  repliedBy?: string;
}

export interface IReviewDocument extends Document {
  product: Types.ObjectId;
  user: Types.ObjectId;
  // The qualifying paid order, kept for audit / verified-purchase provenance.
  order?: Types.ObjectId;
  rating: number;
  title?: string;
  comment: string;
  // Snapshot of the reviewer's display name at submit time, so the public list
  // never has to populate the user (and survives later profile edits).
  reviewerName: string;
  status: ReviewStatus;
  // Always true today (only purchasers may review) but stored per-review so the
  // eligibility policy can loosen later without losing the badge on old reviews.
  verifiedPurchase: boolean;
  helpfulCount: number;
  // Users who already marked this review helpful — dedupes repeat votes.
  helpfulVoters: Types.ObjectId[];
  adminReply?: IReviewReply;
  images: string[];
  // Moderation audit trail.
  moderatedBy?: string;
  moderatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const replySchema = new Schema<IReviewReply>({
  message: { type: String, required: true },
  repliedAt: { type: Date, default: Date.now },
  repliedBy: { type: String },
}, { _id: false });

const reviewSchema = new Schema<IReviewDocument>({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  order: { type: Schema.Types.ObjectId, ref: 'Order' },
  rating: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String },
  comment: { type: String, required: true },
  reviewerName: { type: String, default: '' },
  status: { type: String, enum: REVIEW_STATUSES, default: 'pending' },
  verifiedPurchase: { type: Boolean, default: true },
  helpfulCount: { type: Number, default: 0 },
  helpfulVoters: { type: [Schema.Types.ObjectId], default: [] },
  adminReply: { type: replySchema },
  images: { type: [String], default: [] },
  moderatedBy: { type: String },
  moderatedAt: { type: Date },
}, {
  timestamps: true,
});

// --- Indexes ---
// Public product page: approved reviews for one product, newest first.
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });
// Admin moderation queue: filter by status, newest first.
reviewSchema.index({ status: 1, createdAt: -1 });
// One review per customer per product. Editing replaces the existing review
// rather than creating a second one.
reviewSchema.index({ user: 1, product: 1 }, { unique: true });

const Review = mongoose.model<IReviewDocument>('Review', reviewSchema);
export default Review;
