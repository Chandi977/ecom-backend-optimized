import mongoose, { Schema, Document } from 'mongoose';

export interface IActivityLog {
  method: string;
  path: string;        // request path without query string
  route: string;       // normalized path with :id placeholders (for grouping)
  statusCode: number;
  durationMs: number;
  success: boolean;
  action?: string;       // human-readable "who did what", e.g. "Updated product"
  resourceType?: string; // entity touched, e.g. "product", "category"
  resourceId?: string;   // target id(s) when present in the request
  detail?: string;       // human-readable summary e.g. "Updated product 'Premium Corrugated Box'"
  userId?: string;       // resolved by route auth middleware (req.user)
  userRole?: string;     // resolved by route auth middleware (req.userRole)
  userName?: string;     // actor display name from the JWT (req.userName)
  ip?: string;
  userAgent?: string;
  createdAt?: Date;
}

export interface IActivityLogDocument extends IActivityLog, Document {}

// Days to retain logs before the TTL index expires them. Keeps the collection bounded.
const TTL_DAYS = parseInt(process.env.ACTIVITY_LOG_TTL_DAYS || '90', 10);

const activityLogSchema = new Schema<IActivityLogDocument>({
  method: { type: String, required: true },
  path: { type: String, required: true },
  route: { type: String, required: true, index: true },
  statusCode: { type: Number, required: true },
  durationMs: { type: Number, required: true },
  success: { type: Boolean, required: true },
  action: { type: String },
  resourceType: { type: String, index: true },
  resourceId: { type: String },
  detail: { type: String },
  userId: { type: String, index: true },
  userRole: { type: String, index: true },
  userName: { type: String },
  ip: { type: String },
  userAgent: { type: String },
  // TTL index: documents auto-expire TTL_DAYS after creation.
  createdAt: { type: Date, default: Date.now, expires: TTL_DAYS * 24 * 60 * 60 },
});

// Common query patterns: recent first, filtered by route / user / status over a window.
activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ route: 1, createdAt: -1 });
activityLogSchema.index({ statusCode: 1, createdAt: -1 });

const ActivityLog = mongoose.model<IActivityLogDocument>('ActivityLog', activityLogSchema);
export default ActivityLog;
