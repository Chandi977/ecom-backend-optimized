import mongoose, { Document, Schema } from 'mongoose';

const overviewFieldSchema = new Schema(
  {
    label: { type: String, required: true },
    value: { type: String },
    key: { type: String },
    visible: { type: Boolean, default: true },
  },
  { _id: false },
);

export interface ISeoDocument extends Document {
  product: mongoose.Types.ObjectId;
  meta_title?: string;
  meta_description?: string;
  overview_fields: unknown[];
  canonical?: string;
  schema_markup?: unknown;
  keywords: string[];
  createdAt: Date;
  updatedAt: Date;
}

const seoSchema = new Schema<ISeoDocument>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, unique: true },
    meta_title: { type: String },
    meta_description: { type: String },
    overview_fields: { type: [overviewFieldSchema], default: [] } as any,
    canonical: { type: String },
    schema_markup: { type: Schema.Types.Mixed },
    keywords: { type: [String], default: [] } as any,
  },
  { timestamps: true },
);

seoSchema.index({ keywords: 1 });

const SEO = mongoose.model<ISeoDocument>('SEO', seoSchema);
export default SEO;
