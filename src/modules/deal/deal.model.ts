import mongoose, { Schema, Document } from 'mongoose';

export interface IDealDocument extends Document {
  title: string;
  description?: string;
  discountPercentage?: number;
  products?: string[];
  isActive: boolean;
  validFrom?: Date;
  validTo?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const dealSchema = new Schema<IDealDocument>({
  title: { type: String, required: true },
  description: { type: String },
  discountPercentage: { type: Number },
  products: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  isActive: { type: Boolean, default: true },
  validFrom: { type: Date },
  validTo: { type: Date },
}, {
  timestamps: true,
});

const Deal = mongoose.model<IDealDocument>('Deal', dealSchema);
export default Deal;
