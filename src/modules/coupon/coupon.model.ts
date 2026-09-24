import mongoose, { Schema, Document } from 'mongoose';

export interface ICouponDocument extends Document {
  couponCode: string;
  description?: string;
  discountType: string;
  discountValue: number;
  maxDiscount?: number;
  minOrderValue?: number;
  validFrom: Date;
  validTo: Date;
  usageLimit?: number;
  usedCount: number;
  isActive: boolean;
  appliesTo?: string;
  scopeValue?: string;
  couponUse?: string;
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new Schema<ICouponDocument>({
  couponCode: { type: String, required: true, unique: true, uppercase: true },
  description: { type: String },
  discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
  discountValue: { type: Number, required: true },
  maxDiscount: { type: Number },
  minOrderValue: { type: Number },
  validFrom: { type: Date, required: true },
  validTo: { type: Date, required: true },
  usageLimit: { type: Number },
  usedCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  appliesTo: { type: String },
  scopeValue: { type: String },
  couponUse: { type: String, enum: ['single', 'multiple'], default: 'single' },
}, {
  timestamps: true,
});

// `couponCode` already has a unique index from its path definition — no duplicate needed.

const Coupon = mongoose.model<ICouponDocument>('Coupon', couponSchema);
export default Coupon;
