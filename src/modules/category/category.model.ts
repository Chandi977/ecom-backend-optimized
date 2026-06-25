import mongoose, { Schema, Document } from 'mongoose';
import { ICategory } from '../../types';

export interface ICategoryDocument extends Omit<ICategory, '_id'>, Document {}

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
}, {
  timestamps: true,
});

// `slug` already has a unique index from its path definition.
categorySchema.index({ name: 1 });

const Category = mongoose.model<ICategoryDocument>('Category', categorySchema);
export default Category;
