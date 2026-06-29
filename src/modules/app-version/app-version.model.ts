import mongoose, { Schema, Document } from 'mongoose';

export interface IAppVersionDocument extends Document {
  platform: string;
  version: string;
  forceUpdate: boolean;
  updateMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const appVersionSchema = new Schema<IAppVersionDocument>({
  platform: { type: String, required: true, enum: ['android', 'ios'] },
  version: { type: String, required: true },
  forceUpdate: { type: Boolean, default: false },
  updateMessage: { type: String },
}, {
  timestamps: true,
});

// Latest version per platform (and overall) is read with sort({ createdAt: -1 }).
appVersionSchema.index({ platform: 1, createdAt: -1 });
appVersionSchema.index({ createdAt: -1 });

const AppVersion = mongoose.model<IAppVersionDocument>('AppVersion', appVersionSchema);
export default AppVersion;
