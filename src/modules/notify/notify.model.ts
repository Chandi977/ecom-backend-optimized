import mongoose, { Schema, Document } from 'mongoose';

export interface INotifyDocument extends Document {
  email_address: string;
  product_id: string;
  mail_sent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const notifySchema = new Schema<INotifyDocument>({
  email_address: { type: String, required: true },
  product_id: { type: Schema.Types.ObjectId as any, ref: 'Product', required: true },
  mail_sent: { type: Boolean, default: false },
}, {
  timestamps: true,
});

// Back-in-stock lookup: find pending notifications for a product.
notifySchema.index({ product_id: 1, mail_sent: 1 });

const Notify = mongoose.model<INotifyDocument>('Notify', notifySchema);
export default Notify;
