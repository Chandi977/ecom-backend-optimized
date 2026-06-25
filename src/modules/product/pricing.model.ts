import mongoose, { Document, Schema } from 'mongoose';

export interface IPricingTier {
  number: number;
  price: number;
  original_price?: number;
  stock_quantity?: number;
  discount?: number;
  pack_weight?: number;
}

export interface IPricingDocument extends Document {
  product: mongoose.Types.ObjectId;
  basePrice?: number;
  priceList: IPricingTier[];
  discount?: number;
  stockQuantity?: number;
  packWeight?: number;
  createdAt: Date;
  updatedAt: Date;
}

const pricingTierSchema = new Schema<IPricingTier>(
  {
    number: { type: Number, required: true },
    price: { type: Number, required: true },
    original_price: { type: Number },
    stock_quantity: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    pack_weight: { type: Number },
  },
  { _id: false },
);

const pricingSchema = new Schema<IPricingDocument>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, unique: true },
    basePrice: { type: Number },
    priceList: { type: [pricingTierSchema], default: [] } as any,
    discount: { type: Number, default: 0 },
    stockQuantity: { type: Number, default: 0 },
    packWeight: { type: Number },
  },
  { timestamps: true },
);

pricingSchema.index({ basePrice: 1 });

const Pricing = mongoose.model<IPricingDocument>('Pricing', pricingSchema);
export default Pricing;
