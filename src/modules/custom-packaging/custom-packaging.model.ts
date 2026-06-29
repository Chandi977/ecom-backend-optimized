import mongoose, { Schema, Document } from 'mongoose';

export interface ICustomPackagingDocument extends Document {
  name: string;
  email: string;
  phone: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const customPackagingSchema = new Schema<ICustomPackagingDocument>({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  description: { type: String, required: true },
}, {
  timestamps: true,
});

// Admin listing reads newest-first.
customPackagingSchema.index({ createdAt: -1 });

const CustomPackaging = mongoose.model<ICustomPackagingDocument>('CustomPackaging', customPackagingSchema);
export default CustomPackaging;
