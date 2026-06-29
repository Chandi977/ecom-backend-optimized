import mongoose, { Schema, Document } from 'mongoose';

// Demand signals capture customer intent in-house so the admin "Demand Signals" panel
// can surface what to stock/feature without depending on a third-party analytics API.
// (Mixpanel still receives the same events for deep funnel/cohort analysis.)

const TTL_DAYS = parseInt(process.env.DEMAND_SIGNAL_TTL_DAYS || '180', 10);
const TTL_SECONDS = TTL_DAYS * 24 * 60 * 60;

export interface ISearchQueryLog {
  query: string;
  resultsCount: number;
  zeroResults: boolean;
  source?: string;   // 'web' | 'mobile'
  userId?: string;
  createdAt?: Date;
}
export interface ISearchQueryLogDocument extends ISearchQueryLog, Document {}

const searchQueryLogSchema = new Schema<ISearchQueryLogDocument>({
  query: { type: String, required: true, lowercase: true, trim: true, index: true },
  resultsCount: { type: Number, default: 0 },
  zeroResults: { type: Boolean, default: false, index: true },
  source: { type: String },
  userId: { type: String },
  createdAt: { type: Date, default: Date.now, expires: TTL_SECONDS },
});
searchQueryLogSchema.index({ createdAt: -1 });

export interface IProductViewLog {
  productId: string;
  productName?: string;
  category?: string;
  source?: string;
  userId?: string;
  createdAt?: Date;
}
export interface IProductViewLogDocument extends IProductViewLog, Document {}

const productViewLogSchema = new Schema<IProductViewLogDocument>({
  productId: { type: String, required: true, index: true },
  productName: { type: String },
  category: { type: String, index: true },
  source: { type: String },
  userId: { type: String },
  createdAt: { type: Date, default: Date.now, expires: TTL_SECONDS },
});
productViewLogSchema.index({ createdAt: -1 });

export const SearchQueryLog = mongoose.model<ISearchQueryLogDocument>('SearchQueryLog', searchQueryLogSchema);
export const ProductViewLog = mongoose.model<IProductViewLogDocument>('ProductViewLog', productViewLogSchema);
