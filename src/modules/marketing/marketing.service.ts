import crypto from 'crypto';
import { User, Customer, Subscriber } from '../../models';
import Lead from '../lead/lead.model';
import { config } from '../../config';
import { MarketingAudience } from './email-campaign.model';

// Public storefront origin — used to build unsubscribe links inside promo emails.
export const STORE_URL = (process.env.STORE_URL || 'https://store.prempackaging.com').replace(/\/+$/, '');

export interface IRecipient {
  email: string;
  name?: string;
}

// Loose email shape check — the real gate is SMTP delivery; this just filters
// obvious junk out of imported / legacy data before we try to send.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (value: unknown): value is string =>
  typeof value === 'string' && EMAIL_RE.test(value.trim());

export const normalizeEmail = (value: string): string => value.trim().toLowerCase();

/* ------------------------------ Unsubscribe tokens ------------------------------ */

/**
 * Stateless, verifiable unsubscribe token: HMAC-SHA256(email, SECRET). Lets us
 * put a one-click unsubscribe link on every promo email — including for
 * recipients who only exist as registered users / leads and have no Subscriber
 * row yet — without a per-recipient DB token.
 */
export const unsubscribeToken = (email: string): string =>
  crypto.createHmac('sha256', config.jwt.secret).update(normalizeEmail(email)).digest('hex').slice(0, 32);

export const verifyUnsubscribeToken = (email: string, token: string): boolean => {
  if (!email || !token) return false;
  const expected = unsubscribeToken(email);
  // Constant-time compare to avoid leaking token bytes via timing.
  const a = Buffer.from(expected);
  const b = Buffer.from(String(token));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const buildUnsubscribeUrl = (email: string): string =>
  `${STORE_URL}/unsubscribe?e=${encodeURIComponent(normalizeEmail(email))}&t=${unsubscribeToken(email)}`;

/* ------------------------------ Recipient collection ------------------------------ */

/**
 * The set of emails that have opted out — excluded from every send. Two sources
 * are honoured so opt-out works however the customer expressed it:
 *   1. The Subscriber suppression list (email unsubscribe link, footer, import).
 *   2. A registered customer switching off email notifications in profile
 *      settings (privacyPreferences.emailNotifications === false).
 */
export const getSuppressedEmails = async (): Promise<Set<string>> => {
  const [subscribers, optedOutUsers] = await Promise.all([
    Subscriber.find({ status: 'unsubscribed' }).select('email').lean().exec(),
    User.find({ role: 'user', 'privacyPreferences.emailNotifications': false })
      .select('email_address')
      .lean()
      .exec(),
  ]);

  const suppressed = new Set<string>();
  for (const row of subscribers) suppressed.add(normalizeEmail(row.email));
  for (const user of optedOutUsers) {
    if (isValidEmail(user.email_address)) suppressed.add(normalizeEmail(user.email_address));
  }
  return suppressed;
};

/**
 * Keep the two opt-out stores in step. Setting a preference from the storefront
 * (footer subscribe, email unsubscribe link, profile toggle) writes both the
 * Subscriber row and, when the address belongs to a registered customer, their
 * profile preference — so the UI and the send suppression list never disagree.
 */
export const syncMarketingSubscription = async (
  email: string,
  subscribed: boolean,
  source: 'newsletter' | 'import' | 'checkout' | 'manual' = 'newsletter',
  name?: string,
): Promise<void> => {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) return;

  const status = subscribed ? 'subscribed' : 'unsubscribed';
  await Subscriber.findOneAndUpdate(
    { email: normalized },
    {
      $set: {
        status,
        ...(name ? { name } : {}),
        ...(subscribed ? {} : { unsubscribedAt: new Date() }),
      },
      ...(subscribed ? { $unset: { unsubscribedAt: '' } } : {}),
      $setOnInsert: { email: normalized, source },
    },
    { upsert: true, setDefaultsOnInsert: true },
  ).exec();

  await User.updateOne(
    { email_address: normalized, role: 'user' },
    { $set: { 'privacyPreferences.emailNotifications': subscribed } },
  ).exec();
};

// Collectors may surface partial rows (a legacy record with no email); every
// address is validated in collectRecipients / audienceCounts before use.
type RawRecipient = { email?: string; name?: string };
type Collector = () => Promise<RawRecipient[]>;

const COLLECTORS: Record<MarketingAudience, Collector> = {
  // Registered storefront customers.
  customers: async () => {
    const users = await User.find({ role: 'user' })
      .select('email_address first_name last_name')
      .lean()
      .exec();
    return users.map((u) => ({
      email: u.email_address,
      name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || undefined,
    }));
  },
  // Newsletter sign-ups + imported / manually added contacts (opted in).
  subscribers: async () => {
    const rows = await Subscriber.find({ status: 'subscribed' }).select('email name').lean().exec();
    return rows.map((r) => ({ email: r.email, name: r.name || undefined }));
  },
  // People who submitted the contact / enquiry form.
  contacts: async () => {
    const rows = await Customer.find().select('email name').lean().exec();
    return rows.map((r) => ({ email: r.email, name: r.name || undefined }));
  },
  // CRM leads.
  leads: async () => {
    const rows = await Lead.find().select('email name').lean().exec();
    return rows.map((r) => ({ email: r.email, name: r.name || undefined }));
  },
};

export const AUDIENCE_KEYS: MarketingAudience[] = ['customers', 'subscribers', 'contacts', 'leads'];

/**
 * Resolve the de-duplicated recipient list for the selected audiences. First
 * valid + non-suppressed occurrence of each email wins (so a named record beats a
 * later bare one). Suppressed (unsubscribed) addresses are always removed.
 */
export const collectRecipients = async (audiences: MarketingAudience[]): Promise<IRecipient[]> => {
  const selected = audiences.filter((a): a is MarketingAudience => AUDIENCE_KEYS.includes(a));
  if (selected.length === 0) return [];

  const suppressed = await getSuppressedEmails();
  const seen = new Map<string, IRecipient>();

  for (const key of selected) {
    const rows = await COLLECTORS[key]();
    for (const row of rows) {
      if (!isValidEmail(row.email)) continue;
      const email = normalizeEmail(row.email);
      if (suppressed.has(email) || seen.has(email)) continue;
      seen.set(email, { email, name: row.name });
    }
  }

  return [...seen.values()];
};

/** Per-audience de-duplicated counts + the combined unique total. */
export const audienceCounts = async (): Promise<{ counts: Record<string, number>; total: number }> => {
  const suppressed = await getSuppressedEmails();
  const counts: Record<string, number> = {};
  const union = new Set<string>();

  for (const key of AUDIENCE_KEYS) {
    const rows = await COLLECTORS[key]();
    const unique = new Set<string>();
    for (const row of rows) {
      if (!isValidEmail(row.email)) continue;
      const email = normalizeEmail(row.email);
      if (suppressed.has(email)) continue;
      unique.add(email);
      union.add(email);
    }
    counts[key] = unique.size;
  }

  return { counts, total: union.size };
};
