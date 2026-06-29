import mongoose, { Schema, Document } from 'mongoose';
import { IProductVariant } from '../../types';

export interface IProductVariantDocument
  extends Omit<IProductVariant, '_id' | 'product'>, Document {
  product: mongoose.Types.ObjectId;
}

// Per-SKU variant of a product (e.g. a specific pack size / colour). Optional and
// opt-in: products with no variants behave exactly as before. Self-contained
// price/stock/dimension fields keep this additive without disturbing the existing
// per-product Pricing/Inventory sidecars. The distinguishing spec values live in
// `attributes` (same dynamic-attribute pattern as ProductSpecification).
const variantDimensionsSchema = new Schema(
  {
    length: { type: Number },
    width: { type: Number },
    height: { type: Number },
    unit: { type: String },
  },
  { _id: false },
);

const productVariantSchema = new Schema<IProductVariantDocument>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    sku: { type: String, unique: true, sparse: true, trim: true },
    barcode: { type: String },
    name: { type: String },
    attributes: { type: Map, of: Schema.Types.Mixed, default: undefined },
    weight: { type: Number },
    pack_size: { type: Number },
    dimensions: { type: variantDimensionsSchema, default: undefined },
    price: { type: Number },
    original_price: { type: Number },
    discount: { type: Number, default: 0 },
    stock_quantity: { type: Number, default: 0 },
    pack_weight: { type: Number },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// `sku` already has a unique+sparse index from its path definition.
productVariantSchema.index({ product: 1, order: 1 });
productVariantSchema.index({ barcode: 1 });
productVariantSchema.index({ 'attributes.$**': 1 });

const ProductVariant = mongoose.model<IProductVariantDocument>('ProductVariant', productVariantSchema);
export default ProductVariant;
