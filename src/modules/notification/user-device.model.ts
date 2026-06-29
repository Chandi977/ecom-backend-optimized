import mongoose, { Schema, Document } from 'mongoose';

/**
 * Registered push token for a user's device (FCM-ready). The mobile app registers
 * its token here on login; push.service reads active tokens to deliver pushes.
 * Until Firebase credentials are configured the registry is simply unused.
 */
export interface IUserDeviceDocument extends Document {
  // Optional: guest devices register before/without login. Linked to a user once
  // they sign in (the same token is re-registered with auth).
  user?: mongoose.Types.ObjectId | null;
  token: string;
  platform: 'android' | 'ios';
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userDeviceSchema = new Schema<IUserDeviceDocument>({
  user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  token: { type: String, required: true, unique: true },
  platform: { type: String, enum: ['android', 'ios'], required: true },
  lastSeenAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
});

// Fetch all of a user's tokens when delivering a push.
userDeviceSchema.index({ user: 1 });

const UserDevice = mongoose.model<IUserDeviceDocument>('UserDevice', userDeviceSchema);
export default UserDevice;
