import mongoose, { Schema, Document } from 'mongoose';

export type CampaignAudience = 'all' | 'role' | 'users';

/**
 * Record of an admin-composed broadcast (the "sent history" surfaced in the admin
 * dashboard). One campaign fans out into many per-user Notification documents.
 */
export interface INotificationCampaignDocument extends Document {
  title: string;
  body: string;
  data: Record<string, unknown>;
  audience: CampaignAudience;
  audienceRef?: string;
  recipientCount: number;
  pushSent: number;
  emailSent: number;
  createdBy?: mongoose.Types.ObjectId;
  createdByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const notificationCampaignSchema = new Schema<INotificationCampaignDocument>({
  title: { type: String, required: true },
  body: { type: String, default: '' },
  data: { type: Schema.Types.Mixed, default: {} },
  audience: { type: String, enum: ['all', 'role', 'users'], default: 'all' },
  // For audience 'role' this is the role name; for 'users' a comma-joined id list.
  audienceRef: { type: String },
  recipientCount: { type: Number, default: 0 },
  pushSent: { type: Number, default: 0 },
  emailSent: { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdByName: { type: String },
}, {
  timestamps: true,
});

notificationCampaignSchema.index({ createdAt: -1 });

const NotificationCampaign = mongoose.model<INotificationCampaignDocument>(
  'NotificationCampaign',
  notificationCampaignSchema,
);

export default NotificationCampaign;
