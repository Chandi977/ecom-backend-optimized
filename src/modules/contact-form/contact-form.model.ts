import mongoose, { Schema, Document, Types } from 'mongoose';

export const CONTACT_CATEGORIES = ['Bug', 'Order', 'Payment', 'Feedback', 'Other'] as const;
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

export const CONTACT_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export interface IContactFormDocument extends Document {
  name: string;
  email: string;
  phone?: string;
  category: ContactCategory;
  message: string;
  status: ContactStatus;
  userId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const contactFormSchema = new Schema<IContactFormDocument>({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  category: { type: String, enum: CONTACT_CATEGORIES, default: 'Other' },
  message: { type: String, required: true },
  status: { type: String, enum: CONTACT_STATUSES, default: 'open' },
  // Set when an authenticated user submits the report; absent for guests.
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

// Admin listing reads newest-first, often filtered by status/category.
contactFormSchema.index({ createdAt: -1 });
contactFormSchema.index({ status: 1, category: 1, createdAt: -1 });

const ContactForm = mongoose.model<IContactFormDocument>('ContactForm', contactFormSchema);
export default ContactForm;
