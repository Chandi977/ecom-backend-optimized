import mongoose, { Schema, Document } from 'mongoose';

export interface ICustomerDocument extends Document {
  name: string;
  email: string;
  phone?: string;
  message?: string;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<ICustomerDocument>({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  message: { type: String },
}, {
  timestamps: true,
});

// Admin listing reads newest-first.
customerSchema.index({ createdAt: -1 });

const Customer = mongoose.model<ICustomerDocument>('Customer', customerSchema);
export default Customer;
