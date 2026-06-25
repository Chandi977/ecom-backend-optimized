import mongoose, { Schema, Document } from 'mongoose';
import { ICategory } from '../../types';

export interface ICategoryDocument extends Omit<ICategory, '_id'>, Document {}

// One entry in a category's `spec_schema` — defines a spec field's label, input
// type, options, unit and default. Re-used by sub-category overrides too.
export const specSchemaFieldSchema = new Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  type: { type: String, enum: ['number', 'select', 'text'], default: 'text' },
  options: { type: [String], default: undefined },
  required: { type: Boolean, default: false },
  unit: { type: String },
  default_value: { type: Schema.Types.Mixed },
}, { _id: false });

const categorySchema = new Schema<ICategoryDocument>({
  name: { type: String, required: true },
  slug: { type: String, unique: true },
  category_id: { type: String },
  gst: { type: Number, min: 0, default: 18 },
  meta_title: { type: String },
  meta_description: { type: String },
  overview_fields: { type: [{ label: String }], default: [] },
  // Category-level storefront visibility defaults for the "common" product-page
  // fields (sections, About line, GST/delivery notes, trust badges, pricing
  // meta). Stored as a free-form key -> boolean map; a missing/true key shows
  // the field, only `false` hides it. Products inherit this unless they override
  // a key in their own field_visibility map.
  field_visibility: { type: Schema.Types.Mixed, default: {} },
  // Category-wide attribute defaults inherited by every product in the category
  // (key -> value). Stored as a free-form Mixed map like field_visibility, so new
  // attributes need no schema change. A product's own value always wins; this is
  // resolved at response time by flattenProductCatalog. See utils/category-attributes.
  common_attributes: { type: Schema.Types.Mixed, default: {} },
  // Definitions of the spec fields this category uses. Replaces the hard-coded
  // specification schemas; drives the admin spec form and storefront rendering.
  spec_schema: { type: [specSchemaFieldSchema], default: [] },
}, {
  timestamps: true,
});

// `slug` already has a unique index from its path definition.
categorySchema.index({ name: 1 });

const Category = mongoose.model<ICategoryDocument>('Category', categorySchema);
export default Category;
