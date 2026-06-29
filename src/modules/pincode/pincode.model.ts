import mongoose, { Schema, Document } from 'mongoose';

export interface IPincodeDocument extends Document {
  pincode: string;
  deliveryAvailable: boolean;
  codAvailable: boolean;
  estimatedDays?: number;
  freight?: number;
  createdAt: Date;
  updatedAt: Date;
}

const pincodeSchema = new Schema<IPincodeDocument>({
  pincode: { type: String, required: true, unique: true },
  deliveryAvailable: { type: Boolean, default: true },
  codAvailable: { type: Boolean, default: false },
  estimatedDays: { type: Number },
  freight: { type: Number },
}, {
  timestamps: true,
});

// `pincode` already has a unique index from its path definition — no duplicate needed.

const Pincode = mongoose.model<IPincodeDocument>('Pincode', pincodeSchema);
export default Pincode;
