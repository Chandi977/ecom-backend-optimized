import mongoose, { Schema, Document } from 'mongoose';

export interface IWishlistDocument extends Document {
  user: string;
  products: string[];
  createdAt: Date;
  updatedAt: Date;
}

const wishlistSchema = new Schema<IWishlistDocument>({
  user: { type: Schema.Types.ObjectId as any, ref: 'User', required: true, unique: true },
  products: [{ type: Schema.Types.ObjectId as any, ref: 'Product' }],
}, {
  timestamps: true,
});

// `user` already has a unique index from its path definition — no duplicate needed.

const Wishlist = mongoose.model<IWishlistDocument>('Wishlist', wishlistSchema);
export default Wishlist;
