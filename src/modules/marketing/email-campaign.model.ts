import mongoose, { Schema, Document } from 'mongoose';

export type CampaignStatus = 'draft' | 'sending' | 'sent' | 'failed';

// Which contact pools a promotional email was sent to.
export type MarketingAudience = 'customers' | 'subscribers' | 'contacts' | 'leads';

/**
 * The composed content of a promotional email plus its send outcome. The
 * `content` block is stored verbatim so a campaign can be re-previewed or
 * duplicated later; `recipientCount` / `sentCount` / `failedCount` record how the
 * fan-out went.
 */
export interface IEmailCampaignDocument extends Document {
  subject: string;
  previewText?: string;
  content: {
    // 'branded' = Prem header/footer wrapper + composed fields; 'custom' = full HTML.
    mode?: 'branded' | 'custom';
    html?: string;
    heading?: string;
    body?: string;
    imageUrl?: string;
    ctaLabel?: string;
    ctaUrl?: string;
  };
  audiences: MarketingAudience[];
  status: CampaignStatus;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdBy?: mongoose.Types.ObjectId;
  createdByName?: string;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const emailCampaignSchema = new Schema<IEmailCampaignDocument>({
  subject: { type: String, required: true },
  previewText: { type: String, default: '' },
  content: {
    mode: { type: String, enum: ['branded', 'custom'], default: 'branded' },
    html: { type: String, default: '' },
    heading: { type: String, default: '' },
    body: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    ctaLabel: { type: String, default: '' },
    ctaUrl: { type: String, default: '' },
  },
  audiences: [{ type: String, enum: ['customers', 'subscribers', 'contacts', 'leads'] }],
  status: { type: String, enum: ['draft', 'sending', 'sent', 'failed'], default: 'draft' },
  recipientCount: { type: Number, default: 0 },
  sentCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdByName: { type: String },
  sentAt: { type: Date },
}, {
  timestamps: true,
});

emailCampaignSchema.index({ createdAt: -1 });

const EmailCampaign = mongoose.model<IEmailCampaignDocument>('EmailCampaign', emailCampaignSchema);
export default EmailCampaign;
