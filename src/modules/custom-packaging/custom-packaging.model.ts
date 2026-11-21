import mongoose, { Schema, Document } from 'mongoose';

export interface ICustomPackagingDocument extends Document {
  // Canonical fields. Older submissions only carry these four; the controller
  // keeps them in sync with the structured fields below so existing consumers
  // and historical records keep working.
  name: string;
  email: string;
  phone: string;
  description: string;
  // Structured fields captured by the storefront custom-packaging form.
  company_name?: string;
  product_category?: string;
  moq?: string;
  rich_text?: string;
  contact_person_name?: string;
  contact_person_email?: string;
  contact_person_mobile_number?: string;
  createdAt: Date;
  updatedAt: Date;
}

const customPackagingSchema = new Schema<ICustomPackagingDocument>({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  description: { type: String, required: true },
  company_name: { type: String },
  product_category: { type: String },
  moq: { type: String },
  rich_text: { type: String },
  contact_person_name: { type: String },
  contact_person_email: { type: String },
  contact_person_mobile_number: { type: String },
}, {
  timestamps: true,
});

// Admin listing reads newest-first.
customPackagingSchema.index({ createdAt: -1 });

const CustomPackaging = mongoose.model<ICustomPackagingDocument>('CustomPackaging', customPackagingSchema);
export default CustomPackaging;
