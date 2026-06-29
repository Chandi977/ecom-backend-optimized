import mongoose, { Schema, Document } from 'mongoose';

/**
 * A single in-app notification feed item belonging to one user. Broadcasts are
 * fanned out into one document per recipient at send time so read-state is
 * tracked uniformly. `data` carries an optional deep-link payload the mobile app
 * uses to navigate when the item is tapped.
 */
export interface INotificationDocument extends Document {
  user: mongoose.Types.ObjectId;
  title: string;
  body: string;
  data: Record<string, unknown>;
  source: 'broadcast' | 'event';
  templateKey?: string;
  campaign?: mongoose.Types.ObjectId;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotificationDocument>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  data: { type: Schema.Types.Mixed, default: {} },
  source: { type: String, enum: ['broadcast', 'event'], default: 'broadcast' },
  templateKey: { type: String },
  campaign: { type: Schema.Types.ObjectId, ref: 'NotificationCampaign' },
  isRead: { type: Boolean, default: false },
  readAt: { type: Date },
}, {
  timestamps: true,
});

// Feed listing + unread badge: newest-first per user, filtered by read state.
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

const Notification = mongoose.model<INotificationDocument>('Notification', notificationSchema);
export default Notification;
