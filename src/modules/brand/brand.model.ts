import mongoose, { Schema, Document } from 'mongoose';

export interface IBrandDocument extends Document {
  name: string;
  slug: string;
  brand_id?: string;
  image?: string;
  createdAt: Date;
  updatedAt: Date;
}

const brandSchema = new Schema<IBrandDocument>({
  name: { type: String, required: true },
  slug: { type: String, unique: true },
  brand_id: { type: String },
  image: { type: String },
}, {
  timestamps: true,
});

brandSchema.index({ name: 1 });

const Brand = mongoose.model<IBrandDocument>('Brand', brandSchema);
export default Brand;
