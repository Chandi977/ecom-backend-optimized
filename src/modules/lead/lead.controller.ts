import { Response } from 'express';
import Lead, { LEAD_STATUSES, LeadStatus, ACTIVITY_TYPES, ActivityType } from './lead.model';
import { commonResponse } from '../../utils/response';
import { dispatchEmail } from '../../queue/email-dispatch';
import { verifyEmailDeliverable } from '../../utils/email-verify';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { IAuthRequest } from '../../types';

// Fields on a lead that the CRM update endpoint is allowed to set directly.
const LEAD_EDITABLE_FIELDS = ['name', 'phone', 'email', 'company', 'productCategory', 'moq', 'message', 'notes', 'assignedTo', 'disposition'] as const;

// Parse a date-ish string into a Date, or undefined when blank/unparseable.
const parseDate = (value?: string): Date | undefined => {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/**
 * Self-hosted lead-handling endpoint. Captures the enquiry, then fires two
 * emails through the shared pipeline: an auto-generated acknowledgement to the
 * lead and an internal "new lead" notification to the store inbox. Email is
 * best-effort — a mailer outage must never lose the captured lead, so failures
 * are logged and the request still succeeds.
 */
export const createLead = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { name, email, phone, message, company, productCategory, moq, source } = req.body;
  try {
    if (!name || !email) {
      res.status(400).json(commonResponse('Invalid fields', false)); return;
    }

    // Verify the recipient BEFORE we send anything — this gates the customer
    // auto-response so typos / fake / disposable addresses don't get mailed.
    const verification = await verifyEmailDeliverable(email, { checkMx: config.mail.verifyRecipients });

    const lead = new Lead({
      name,
      email,
      phone,
      message,
      company,
      productCategory,
      moq,
      source: source || 'contact-us',
      // A real MX check ran on the live form, so this result is trustworthy.
      emailChecked: true,
      emailVerified: verification.valid,
      // Link the lead to the submitter when the request is authenticated.
      userId: req.user || undefined,
    });
    const data = await lead.save();
    if (!data) {
      res.status(500).json(commonResponse('Lead not created', false)); return;
    }

    // Auto-generated acknowledgement — only to a verified recipient.
    const leadSource = source || 'contact-us';
    const autoResponseSubject = leadSource === 'custom-packaging'
      ? 'We received your custom packaging enquiry - Prem Packaging'
      : 'We received your message - Prem Packaging';
    let autoResponseSent = false;
    if (verification.valid) {
      try {
        autoResponseSent = await dispatchEmail('lead-autoresponse', {
          to: email,
          subject: autoResponseSubject,
          name,
          message: message || '',
        });
      } catch (err) {
        logger.error('Lead auto-response email failed', { email, error: err instanceof Error ? err.message : 'Unknown' });
      }
    } else {
      logger.warn('Skipping lead auto-response — recipient failed verification', { email, reason: verification.reason });
    }

    // Internal notification to the store inbox (trusted address, always sent).
    try {
      const notifyTo = config.mail.leadNotifyEmail || config.smtp.user;
      if (notifyTo) {
        // Only include structured rows that actually have a value, so a plain
        // contact-us enquiry doesn't render empty Company/MOQ rows.
        const detailRow = (label: string, value?: string): string =>
          value ? `<tr><td class="summary-label">${label}</td><td class="summary-value">${value}</td></tr>` : '';
        const detailsHtml = [
          detailRow('Company', company),
          detailRow('Product Category', productCategory),
          detailRow('MOQ', moq),
        ].join('');

        await dispatchEmail('lead-admin-notify', {
          to: notifyTo,
          subject: `New enquiry from ${name}`,
          name,
          email,
          phone: phone || '—',
          message: message || '—',
          source: leadSource,
          detailsHtml,
          emailVerified: verification.valid ? 'Yes' : `No (${verification.reason})`,
        });
      }
    } catch (err) {
      logger.error('Lead admin-notify email failed', { email, error: err instanceof Error ? err.message : 'Unknown' });
    }

    if (autoResponseSent && !data.autoResponseSent) {
      data.autoResponseSent = true;
      await data.save().catch(() => { /* non-critical flag update */ });
    }

    res.status(201).json(commonResponse('Message sent successfully. We will get back to you shortly.', true, data));
  } catch (error) {
    logger.error('createLead failed', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const getLeads = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { status, source } = req.query;
    const filter: Record<string, unknown> = {};
    if (typeof status === 'string' && status) filter.status = status;
    if (typeof source === 'string' && source) filter.source = source;

    // Always 200 with the (possibly empty) array so the CRM renders a clean
    // empty state instead of surfacing a 404 as an error.
    const data = await Lead.find(filter).sort({ createdAt: -1 }).exec();
    res.status(200).json(commonResponse(data.length > 0 ? 'Leads fetched' : 'No leads found', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const countLeads = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await Lead.countDocuments();
    res.status(200).json(commonResponse('Leads count', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal server error', false));
  }
};

/**
 * Manually create a lead from the CRM (admin). Never sends any email and does
 * not run the deliverability check (emailChecked stays false → "Unverified"
 * until a rep runs Verify email). Email is optional.
 */
export const adminCreateLead = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { name, email, phone, message, company, productCategory, moq, source, status, assignedTo, disposition, nextFollowUpAt } = req.body;
    if (!name) {
      res.status(400).json(commonResponse('Name is required', false)); return;
    }
    const lead = new Lead({
      name,
      email: email || undefined,
      phone,
      message,
      company,
      productCategory,
      moq,
      source: source || 'manual',
      status: status && LEAD_STATUSES.includes(status) ? status : 'new',
      assignedTo,
      disposition,
      nextFollowUpAt: nextFollowUpAt ? parseDate(nextFollowUpAt) : undefined,
      emailChecked: false,
      emailVerified: false,
      autoResponseSent: false,
    });
    const data = await lead.save();
    res.status(201).json(commonResponse('Lead created', true, data));
  } catch (error) {
    logger.error('adminCreateLead failed', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const getLead = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const data = await Lead.findById(id).exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Lead fetched' : 'Lead not found', !!data, data || undefined));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

/**
 * Run the real deliverability check (syntax + disposable + MX) for a lead's
 * email on demand — used to verify imported leads that were only format-checked.
 * Marks emailChecked=true so the UI can distinguish "unverified" from a genuine
 * "deliverable"/"risky" result.
 */
export const verifyLeadEmail = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const lead = await Lead.findById(id).exec();
    if (!lead) {
      res.status(404).json(commonResponse('Lead not found', false)); return;
    }
    if (!lead.email) {
      res.status(400).json(commonResponse('This lead has no email to verify', false)); return;
    }

    const verification = await verifyEmailDeliverable(lead.email, { checkMx: config.mail.verifyRecipients });
    lead.emailChecked = true;
    lead.emailVerified = verification.valid;
    const data = await lead.save();
    res.status(200).json(commonResponse(
      verification.valid ? 'Email looks deliverable' : `Email looks risky (${verification.reason})`,
      true,
      data,
    ));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const updateLead = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;

    const update: Record<string, unknown> = {};
    for (const field of LEAD_EDITABLE_FIELDS) {
      if (body[field] !== undefined) update[field] = body[field];
    }
    if (body.status !== undefined) {
      if (!LEAD_STATUSES.includes(body.status as LeadStatus)) {
        res.status(400).json(commonResponse('Invalid status', false)); return;
      }
      update.status = body.status;
    }
    // Empty string clears the scheduled follow-up.
    if (body.nextFollowUpAt !== undefined) {
      update.nextFollowUpAt = body.nextFollowUpAt ? parseDate(body.nextFollowUpAt as string) || null : null;
    }

    if (Object.keys(update).length === 0) {
      res.status(400).json(commonResponse('Nothing to update', false)); return;
    }

    const data = await Lead.findByIdAndUpdate(id, update, { new: true, runValidators: true }).exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Lead updated' : 'Lead not found', !!data, data || undefined));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

/**
 * Log an interaction on the lead's timeline. Optionally moves the pipeline
 * status, records the latest disposition and schedules the next follow-up in
 * the same action so a rep can capture a whole call outcome in one save.
 */
export const addLeadActivity = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { type, note, at, status, disposition, nextFollowUpAt } = req.body as {
      type?: ActivityType; note: string; at?: string; status?: LeadStatus; disposition?: string; nextFollowUpAt?: string;
    };

    const lead = await Lead.findById(id).exec();
    if (!lead) {
      res.status(404).json(commonResponse('Lead not found', false)); return;
    }

    lead.activities.push({
      type: type && ACTIVITY_TYPES.includes(type) ? type : 'note',
      note,
      at: parseDate(at) || new Date(),
      by: req.userName || undefined,
    });

    if (status !== undefined && LEAD_STATUSES.includes(status)) lead.status = status;
    if (disposition !== undefined) lead.disposition = disposition;
    if (nextFollowUpAt !== undefined) lead.nextFollowUpAt = nextFollowUpAt ? parseDate(nextFollowUpAt) : undefined;

    const data = await lead.save();
    res.status(200).json(commonResponse('Activity logged', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

interface IImportLeadRow {
  name: string;
  email?: string;
  phone?: string;
  message?: string;
  company?: string;
  productCategory?: string;
  moq?: string;
  source?: string;
  status?: LeadStatus;
  disposition?: string;
  assignedTo?: string;
  createdAt?: string;
  importKey?: string;
  activities?: Array<{ type?: ActivityType; note?: string; at?: string }>;
}

/**
 * Bulk-import historical leads from a CSV (mapped on the client). Never sends
 * email. Idempotent: rows carrying an `importKey` already present are skipped,
 * so re-running the same import is safe. Inserts via the native driver so the
 * original `createdAt` is preserved instead of being stamped to now.
 */
export const importLeads = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { leads } = req.body as { leads: IImportLeadRow[] };

    const keys = leads.map((l) => l.importKey).filter((k): k is string => !!k);
    const existing = keys.length
      ? new Set((await Lead.find({ importKey: { $in: keys } }).select('importKey').lean().exec()).map((d) => d.importKey))
      : new Set<string>();

    const now = new Date();
    const seen = new Set<string>();
    const docs = leads
      .filter((l) => {
        if (!l.importKey) return true;
        if (existing.has(l.importKey) || seen.has(l.importKey)) return false;
        seen.add(l.importKey);
        return true;
      })
      .map((l) => {
        const createdAt = parseDate(l.createdAt) || now;
        return {
          name: l.name,
          email: l.email || undefined,
          phone: l.phone || undefined,
          message: l.message || undefined,
          company: l.company || undefined,
          productCategory: l.productCategory || undefined,
          moq: l.moq || undefined,
          source: l.source || 'import',
          status: l.status && LEAD_STATUSES.includes(l.status) ? l.status : 'contacted',
          disposition: l.disposition || undefined,
          assignedTo: l.assignedTo || undefined,
          // Imported addresses are NOT deliverability-checked (that would be
          // hundreds of DNS lookups). Left unverified so the UI shows
          // "Unverified" rather than a misleading "Deliverable"; a rep can run
          // the on-demand check per lead.
          emailChecked: false,
          emailVerified: false,
          autoResponseSent: false,
          importKey: l.importKey || undefined,
          activities: (l.activities || [])
            .filter((a) => a && a.note)
            .map((a) => ({
              type: a.type && ACTIVITY_TYPES.includes(a.type) ? a.type : 'note',
              note: a.note,
              at: parseDate(a.at) || createdAt,
            })),
          createdAt,
          updatedAt: now,
        };
      });

    if (docs.length === 0) {
      res.status(200).json(commonResponse('Nothing to import — all rows already exist', true, { inserted: 0, skipped: leads.length }));
      return;
    }

    // Native insert bypasses Mongoose timestamps so historical createdAt sticks.
    const result = await Lead.collection.insertMany(docs, { ordered: false });
    const inserted = result.insertedCount || 0;
    res.status(200).json(commonResponse(`Imported ${inserted} lead(s)`, true, { inserted, skipped: leads.length - inserted }));
  } catch (error) {
    logger.error('importLeads failed', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};
