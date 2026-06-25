import mongoose, { Schema, Document } from 'mongoose';

export interface IPasswordResetDocument extends Document {
  email: string;
  otp: string;
  expiresAt: Date;
  used: boolean;
  verified: boolean;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

const passwordResetSchema = new Schema<IPasswordResetDocument>({
  email: { type: String, required: true, lowercase: true },
  // Stores a bcrypt hash of the OTP, never the plaintext code.
  otp: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
  // Set true once the OTP is successfully verified; resetPassword requires it
  // so the update endpoint can't change a password without proven ownership.
  verified: { type: Boolean, default: false },
  // Failed verify attempts against this OTP; used to lock out brute forcing.
  attempts: { type: Number, default: 0 },
}, {
  timestamps: true,
});

// Latest OTP for an email is read with sort({ createdAt: -1 }).
passwordResetSchema.index({ email: 1, createdAt: -1 });
// TTL index — Mongo auto-expires reset entries at `expiresAt`.
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PasswordReset = mongoose.model<IPasswordResetDocument>('PasswordReset', passwordResetSchema);
export default PasswordReset;
