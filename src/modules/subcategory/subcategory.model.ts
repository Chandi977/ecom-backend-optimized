import mongoose, { Schema, Document } from 'mongoose';

export interface ISubCategoryDocument extends Document {
  name: string;
  slug: string;
  category?: string;
  sub_category_id?: string;
  gst?: number;
  hsn_code?: string;
  sac_code?: string;
  tax_category?: string;
  delivery_time?: string;
  common_attributes?: Record<string, unknown>;
  pack_sizes?: number[];
  createdAt: Date;
  updatedAt: Date;
}

const subCategorySchema = new Schema<ISubCategoryDocument>({
  name: { type: String, required: true },
  slug: { type: String, unique: true },
  category: { type: Schema.Types.ObjectId, ref: 'Category' },
  sub_category_id: { type: String },
  gst: { type: Number, min: 0 },
  // Sub-category-level tax/fulfillment defaults; override the parent category and
  // are inherited by products (the product's own value still wins).
  hsn_code: { type: String },
  sac_code: { type: String },
  tax_category: { type: String },
  delivery_time: { type: String },
  // Optional sub-category-level attribute overrides. Resolved ahead of the parent
  // category's common_attributes during product attribute inheritance.
  common_attributes: { type: Schema.Types.Mixed, default: {} },
  pack_sizes: { type: [Number], default: [1, 5, 10] },
}, {
  timestamps: true,
});

// `slug` already has a unique index from its path definition.
subCategorySchema.index({ name: 1 });
subCategorySchema.index({ category: 1 });
subCategorySchema.index({ category: 1, slug: 1 });

const SubCategory = mongoose.model<ISubCategoryDocument>('SubCategory', subCategorySchema);
export default SubCategory;
