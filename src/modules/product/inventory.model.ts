import mongoose, { Document, Schema } from 'mongoose';

export interface IInventoryDocument extends Document {
  product: mongoose.Types.ObjectId;
  availableStock: number;
  reservedStock: number;
  minimumStock: number;
  warehouse?: unknown;
  metadata?: Map<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const inventorySchema = new Schema<IInventoryDocument>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, unique: true },
    availableStock: { type: Number, default: 0, min: 0 },
    reservedStock: { type: Number, default: 0, min: 0 },
    minimumStock: { type: Number, default: 0, min: 0 },
    warehouse: { type: Schema.Types.Mixed },
    metadata: { type: Map, of: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true },
);

inventorySchema.index({ availableStock: 1 });
inventorySchema.index({ warehouse: 1 });

const Inventory = mongoose.model<IInventoryDocument>('Inventory', inventorySchema);
export default Inventory;
