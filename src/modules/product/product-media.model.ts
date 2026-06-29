import mongoose, { Document, Schema } from 'mongoose';

export interface IProductMediaDocument extends Document {
  product: mongoose.Types.ObjectId;
  thumbnail?: unknown;
  gallery: unknown[];
  videos: unknown[];
  documents: unknown[];
  images360: unknown[];
  createdAt: Date;
  updatedAt: Date;
}

const productMediaSchema = new Schema<IProductMediaDocument>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, unique: true },
    thumbnail: { type: Schema.Types.Mixed },
    gallery: { type: [Schema.Types.Mixed], default: [] } as any,
    videos: { type: [Schema.Types.Mixed], default: [] } as any,
    documents: { type: [Schema.Types.Mixed], default: [] } as any,
    images360: { type: [Schema.Types.Mixed], default: [] } as any,
  },
  { timestamps: true },
);

const ProductMedia = mongoose.model<IProductMediaDocument>('ProductMedia', productMediaSchema);
export default ProductMedia;
