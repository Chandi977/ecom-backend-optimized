import mongoose, { Schema, Document } from 'mongoose';

export type NotificationChannel = 'email' | 'push' | 'inapp';

/**
 * Admin/catalog-manager editable notification template. The code keeps a set of
 * default templates (see notification-template.service.ts `TEMPLATE_DEFAULTS`);
 * a DB document with the same `key` overrides the default. `body` holds the
 * inner-content HTML for email templates (wrapped by the shared email layout at
 * send time) or the plain body text for push/in-app templates.
 */
export interface INotificationTemplateDocument extends Document {
  key: string;
  channel: NotificationChannel;
  name: string;
  description?: string;
  subject: string;
  body: string;
  variables: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const notificationTemplateSchema = new Schema<INotificationTemplateDocument>({
  key: { type: String, required: true, unique: true, trim: true },
  channel: { type: String, enum: ['email', 'push', 'inapp'], required: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  subject: { type: String, default: '' },
  body: { type: String, default: '' },
  // Available {{placeholders}} for this template — surfaced in the admin editor.
  variables: { type: [String], default: [] } as any,
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
});

const NotificationTemplate = mongoose.model<INotificationTemplateDocument>(
  'NotificationTemplate',
  notificationTemplateSchema,
);

export default NotificationTemplate;
