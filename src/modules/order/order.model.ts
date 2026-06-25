import mongoose, { Schema, Document } from 'mongoose';

export interface IOrderItemDocument {
  product: string;
  quantity: number;
  price: number;
  packSize: number;
  gst?: number;
  gstAmount?: number;
  totalPrice?: number;
}

export interface IOrderDocument extends Document {
  orderId: string;
  user?: string;
  items: IOrderItemDocument[];
  name: string;
  phone: string;
  email: string;
  address: string;
  town: string;
  state: string;
  pincode: string;
  landmark?: string;
  gstin?: string;
  total?: number;
  totalPackWeight?: number;
  shippingCost?: number;
  totalOrderValue: number;
  totalCartValue?: number;
  status: string;
  paymentStatus: string;
  paymentProvider?: string;
  paymentReference?: string;
  paymentDate?: Date;
  paymentFailedAt?: Date;
  paymentFailureReason?: string;
  utrNumber?: string;
  couponCode?: string;
  guestToken?: string;
  stockReduced: boolean;
  trackingId?: string;
  deliveryPartner?: string;
  shippingDate?: Date;
  deliveredDate?: Date;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  taxableAmount?: number;
  idempotencyKey?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  packSize: { type: Number, required: true },
  gst: { type: Number },
  gstAmount: { type: Number },
  totalPrice: { type: Number },
}, { _id: false });

const orderSchema = new Schema<IOrderDocument>({
  orderId: { type: String, required: true, unique: true },
  user: { type: Schema.Types.ObjectId as any, ref: 'User' },
  items: { type: [orderItemSchema] as any, required: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true, lowercase: true },
  address: { type: String, required: true },
  town: { type: String, required: true },
  state: { type: String, required: true },
  pincode: { type: String, required: true },
  landmark: { type: String },
  gstin: { type: String },
  total: { type: Number },
  totalPackWeight: { type: Number },
  shippingCost: { type: Number, default: 0 },
  totalOrderValue: { type: Number, required: true },
  totalCartValue: { type: Number },
  status: { type: String, default: 'placed' },
  paymentStatus: { type: String, default: 'Not Paid' },
  paymentProvider: { type: String },
  paymentReference: { type: String },
  paymentDate: { type: Date },
  paymentFailedAt: { type: Date },
  paymentFailureReason: { type: String },
  utrNumber: { type: String },
  couponCode: { type: String },
  guestToken: { type: String, select: false },
  stockReduced: { type: Boolean, default: false },
  trackingId: { type: String },
  deliveryPartner: { type: String },
  shippingDate: { type: Date },
  deliveredDate: { type: Date },
  razorpayOrderId: { type: String, index: true },
  razorpayPaymentId: { type: String, sparse: true, unique: true },
  razorpaySignature: { type: String },
  taxableAmount: { type: Number },
  idempotencyKey: { type: String, sparse: true, unique: true },
  notes: { type: String },
}, {
  timestamps: true,
});

// --- Indexes ---
// `orderId`, `razorpayPaymentId`, `idempotencyKey` already have indexes from their
// path definitions (unique / sparse). `razorpayOrderId` is indexed at the path level too.
//
// Order history for a logged-in user and the admin "by email" lookup both sort by
// createdAt desc — index the equality field together with the sort key.
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ email: 1, createdAt: -1 });
// Admin order list filtered by status, newest first.
orderSchema.index({ status: 1, createdAt: -1 });
// Abandoned-order cleanup scan: paymentStatus $in + status equality + createdAt range.
orderSchema.index({ paymentStatus: 1, status: 1, createdAt: 1 });

const Order = mongoose.model<IOrderDocument>('Order', orderSchema);
export default Order;
