import mongoose, { Schema, Document } from 'mongoose';
import { IUser } from '../../types';

export interface IUserDocument extends Omit<IUser, '_id'>, Document {}

const addressSchema = new Schema({
  name: { type: String },
  phone: { type: String },
  address: { type: String },
  town: { type: String },
  state: { type: String },
  pincode: { type: String },
  landmark: { type: String },
  isDefault: { type: Boolean, default: false },
}, { _id: false });

// Mirrors the toggles on the mobile AccountPrivacy screen.
const privacyPreferencesSchema = new Schema({
  emailNotifications: { type: Boolean, default: true },
  smsNotifications: { type: Boolean, default: true },
  personalizedRecommendations: { type: Boolean, default: true },
  usageAnalytics: { type: Boolean, default: true },
}, { _id: false });

const userSchema = new Schema<IUserDocument>({
  first_name: { type: String, required: true },
  last_name: { type: String, default: '' },
  email_address: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  mobile_number: { type: String },
  role: { type: String, default: 'user' },
  gender: { type: String },
  user_id: { type: String },
  profile_image: { type: String },
  contact_address: { type: [addressSchema], default: [] },
  couponUsed: { type: [String], default: [] },
  googleId: { type: String },
  authProvider: { type: String, default: 'local' },
  isVerified: { type: Boolean, default: false },
  verification_token: { type: String },
  verification_token_expiry: { type: Date },
  privacyPreferences: {
    type: privacyPreferencesSchema,
    default: () => ({}),
  },
}, {
  timestamps: true,
});

// `email_address` already has a unique index from its path definition.
// Admin user listings filter by role (or role $ne) and sort by createdAt desc.
userSchema.index({ role: 1, createdAt: -1 });

const User = mongoose.model<IUserDocument>('User', userSchema);
export default User;
