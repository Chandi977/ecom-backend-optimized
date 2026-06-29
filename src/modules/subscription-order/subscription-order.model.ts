import mongoose, { Schema, Document } from 'mongoose';

export interface ISubscriptionOrderDocument extends Document {
  email: string;
  product: string;
  quantity: number;
  frequency: string;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionOrderSchema = new Schema<ISubscriptionOrderDocument>({
  email: { type: String, required: true },
  product: { type: String, required: true },
  quantity: { type: Number, required: true },
  frequency: { type: String, required: true },
}, {
  timestamps: true,
});

const SubscriptionOrder = mongoose.model<ISubscriptionOrderDocument>('SubscriptionOrder', subscriptionOrderSchema);
export default SubscriptionOrder;
