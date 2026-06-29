import mongoose, { Schema, Document } from 'mongoose';

export interface ICartItemDocument {
  product: string;
  quantity: number;
  price: number;
  packSize: number;
  discountPrice?: number;
  totalPackWeight?: number;
}

export interface ICartDocument extends Document {
  user: string;
  products: ICartItemDocument[];
  total_amount: number;
  tax_amount?: number;
  discount_amount: number;
  totalPackWeight: number;
  packSize: number;
  appliedCoupon?: boolean;
  appliedCouponName?: string;
  couponType?: string;
  maxCapDiscount?: number;
  couponUse?: string;
  totalDiscountPrice?: number;
  totalDiscountPercentage?: number;
  shippingDiscountPrice?: number;
  shippingDiscountPercentage?: number;
  allDiscountPercentage?: number;
  allDiscountPrice?: number;
  createdAt: Date;
  updatedAt: Date;
}

const cartItemSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true },
  packSize: { type: Number, required: true },
  discountPrice: { type: Number, default: 0 },
  totalPackWeight: { type: Number, default: 0 },
}, { _id: false });

const cartSchema = new Schema<ICartDocument>({
  user: { type: Schema.Types.ObjectId as any, ref: 'User', required: true, unique: true },
  products: { type: [cartItemSchema] as any, default: [] },
  total_amount: { type: Number, default: 0 },
  tax_amount: { type: Number, default: 0 },
  discount_amount: { type: Number, default: 0 },
  totalPackWeight: { type: Number, default: 0 },
  packSize: { type: Number, default: 0 },
  appliedCoupon: { type: Boolean, default: false },
  appliedCouponName: { type: String },
  couponType: { type: String },
  maxCapDiscount: { type: Number },
  couponUse: { type: String },
  totalDiscountPrice: { type: Number },
  totalDiscountPercentage: { type: Number },
  shippingDiscountPrice: { type: Number },
  shippingDiscountPercentage: { type: Number },
  allDiscountPercentage: { type: Number },
  allDiscountPrice: { type: Number },
}, {
  timestamps: true,
});

// `user` already has a unique index from its path definition — no duplicate needed.

const Cart = mongoose.model<ICartDocument>('Cart', cartSchema);
export default Cart;
