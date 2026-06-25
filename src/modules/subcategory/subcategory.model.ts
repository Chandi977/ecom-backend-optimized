import mongoose, { Schema, Document } from 'mongoose';

export interface ISubCategoryDocument extends Document {
  name: string;
  slug: string;
  category?: string;
  sub_category_id?: string;
  gst?: number;
  createdAt: Date;
  updatedAt: Date;
}

const subCategorySchema = new Schema<ISubCategoryDocument>({
  name: { type: String, required: true },
  slug: { type: String, unique: true },
  category: { type: Schema.Types.ObjectId, ref: 'Category' },
  sub_category_id: { type: String },
  gst: { type: Number, min: 0 },
}, {
  timestamps: true,
});

// `slug` already has a unique index from its path definition.
subCategorySchema.index({ name: 1 });
subCategorySchema.index({ category: 1 });
subCategorySchema.index({ category: 1, slug: 1 });

const SubCategory = mongoose.model<ISubCategoryDocument>('SubCategory', subCategorySchema);
export default SubCategory;
