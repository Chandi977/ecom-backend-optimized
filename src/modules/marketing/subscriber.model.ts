import mongoose, { Schema, Document } from 'mongoose';

export type SubscriberSource = 'newsletter' | 'import' | 'checkout' | 'manual';
export type SubscriberStatus = 'subscribed' | 'unsubscribed';

/**
 * A marketing email contact. Captures newsletter sign-ups (the storefront footer
 * banner), admin-imported addresses (Excel/CSV) and manually added contacts. Also
 * doubles as the unsubscribe suppression list: a recipient who opts out is stored
 * here with status 'unsubscribed' even if they only ever existed as a registered
 * user / lead, so promotional sends can filter them out uniformly.
 */
export interface ISubscriberDocument extends Document {
  email: string;
  name?: string;
  source: SubscriberSource;
  status: SubscriberStatus;
  unsubscribedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const subscriberSchema = new Schema<ISubscriberDocument>({
  // Stored lowercase so dedupe against User / Lead / Customer emails is reliable.
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, trim: true },
  source: { type: String, enum: ['newsletter', 'import', 'checkout', 'manual'], default: 'newsletter' },
  status: { type: String, enum: ['subscribed', 'unsubscribed'], default: 'subscribed' },
  unsubscribedAt: { type: Date },
}, {
  timestamps: true,
});

// Admin listing reads newest-first; status filter drives audience counts.
subscriberSchema.index({ status: 1, createdAt: -1 });

const Subscriber = mongoose.model<ISubscriberDocument>('Subscriber', subscriberSchema);
export default Subscriber;
