import mongoose, { Schema, Document } from 'mongoose';

export interface ICounterDocument extends Document {
  name: string;
  seq: number;
}

const counterSchema = new Schema<ICounterDocument>({
  name: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model<ICounterDocument>('Counter', counterSchema);
export default Counter;
