import mongoose, { Schema, Document, Types } from 'mongoose';

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'closed'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const ACTIVITY_TYPES = ['note', 'call', 'email', 'whatsapp', 'meeting', 'status_change', 'follow_up'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface ILeadActivity {
  type: ActivityType;
  note?: string;
  // When the interaction actually happened (may be back-dated on import).
  at: Date;
  // Admin who logged it (name/email), when known.
  by?: string;
}

export interface ILeadDocument extends Document {
  name: string;
  email?: string;
  phone?: string;
  message?: string;
  // Structured enquiry details (mainly from the custom-packaging form).
  company?: string;
  productCategory?: string;
  moq?: string;
  // Internal sales notes, editable from the CRM. Never shown to the customer.
  notes?: string;
  // Sales rep the lead is assigned/transferred to (e.g. "Amit", "Tarandeep").
  assignedTo?: string;
  // Latest call/interaction outcome (free-text disposition, e.g. "no requirement",
  // "rates given", "call not picked", "catalogue shared").
  disposition?: string;
  // Scheduled next action — powers the "follow-ups due / overdue" views.
  nextFollowUpAt?: Date;
  // Chronological interaction log — the heart of the lead workspace.
  activities: Types.DocumentArray<ILeadActivity & Types.Subdocument>;
  // Free-text origin of the lead (e.g. "contact-us", "custom-packaging", "import").
  source: string;
  status: LeadStatus;
  // Whether a real deliverability check (MX lookup) has actually run for this
  // address. False for imported leads that only got a cheap format check — the
  // UI shows them as "Unverified" rather than overclaiming "Deliverable".
  emailChecked: boolean;
  // Result of that deliverability check (syntax + disposable + MX). Only
  // meaningful when emailChecked is true.
  emailVerified: boolean;
  autoResponseSent: boolean;
  // Idempotency key for CSV imports — re-importing the same row is a no-op.
  importKey?: string;
  // Set when a logged-in user submits; absent for guests (optionalAuth).
  userId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const activitySchema = new Schema<ILeadActivity>({
  type: { type: String, enum: ACTIVITY_TYPES, default: 'note' },
  note: { type: String },
  at: { type: Date, default: Date.now },
  by: { type: String },
}, { _id: true });

const leadSchema = new Schema<ILeadDocument>({
  name: { type: String, required: true },
  // Optional: historical imported leads may have no email; the public
  // contact-form path still enforces email in the controller/validator.
  email: { type: String },
  phone: { type: String },
  message: { type: String },
  company: { type: String },
  productCategory: { type: String },
  moq: { type: String },
  notes: { type: String },
  assignedTo: { type: String },
  disposition: { type: String },
  nextFollowUpAt: { type: Date },
  activities: { type: [activitySchema], default: [] },
  source: { type: String, default: 'contact-us' },
  status: { type: String, enum: LEAD_STATUSES, default: 'new' },
  emailChecked: { type: Boolean, default: false },
  emailVerified: { type: Boolean, default: false },
  autoResponseSent: { type: Boolean, default: false },
  importKey: { type: String },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
});

// Admin listing reads newest-first, often filtered by status.
leadSchema.index({ createdAt: -1 });
leadSchema.index({ status: 1, createdAt: -1 });
// Follow-up queue (due / overdue) and CRM ownership views.
leadSchema.index({ nextFollowUpAt: 1 });
leadSchema.index({ assignedTo: 1 });
// Idempotent CSV re-import. Sparse: only imported docs carry a key.
leadSchema.index({ importKey: 1 }, { unique: true, sparse: true });

const Lead = mongoose.model<ILeadDocument>('Lead', leadSchema);
export default Lead;
