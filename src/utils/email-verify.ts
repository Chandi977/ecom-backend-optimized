import dns from 'dns';
import { validateEmail } from './validators';
import { logger } from './logger';

// Known disposable / throwaway email domains. Not exhaustive — a best-effort
// block-list to keep obvious junk addresses out of the mail pipeline.
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com',
  'temp-mail.org', 'throwawaymail.com', 'yopmail.com', 'trashmail.com',
  'getnada.com', 'sharklasers.com', 'dispostable.com', 'maildrop.cc',
  'fakeinbox.com', 'mailnesia.com', 'emailondeck.com', 'moakt.com',
  'guerrillamail.info', 'grr.la', 'spam4.me', 'mohmal.com',
]);

export type EmailVerifyReason = 'invalid_format' | 'disposable_domain' | 'no_mail_records';

export interface EmailVerification {
  valid: boolean;
  reason?: EmailVerifyReason;
}

export const getEmailDomain = (email: string): string =>
  (email || '').trim().toLowerCase().split('@')[1] || '';

export const isDisposableEmail = (email: string): boolean =>
  DISPOSABLE_DOMAINS.has(getEmailDomain(email));

const hasAddressRecord = async (domain: string): Promise<boolean> => {
  try {
    await dns.promises.lookup(domain);
    return true;
  } catch {
    return false;
  }
};

/**
 * Best-effort recipient verification, run BEFORE we send a mail. Confirms the
 * address is well-formed, is not a known disposable domain, and that its domain
 * can actually receive mail (publishes MX records, or at least an A/AAAA
 * record). It never proves the mailbox itself exists — its job is to stop
 * typos, fake and throwaway addresses from generating bounces, and to blunt
 * abuse of endpoints that email arbitrary user-supplied addresses.
 *
 * Fails OPEN on transient DNS errors (timeout / servfail) so a flaky resolver
 * never blocks mail to a legitimate address; fails CLOSED only on definitive
 * "this domain cannot receive mail" answers (NXDOMAIN / no records).
 */
export const verifyEmailDeliverable = async (
  email: string,
  { checkMx = true }: { checkMx?: boolean } = {},
): Promise<EmailVerification> => {
  const trimmed = (email || '').trim();
  if (!validateEmail(trimmed)) return { valid: false, reason: 'invalid_format' };
  if (isDisposableEmail(trimmed)) return { valid: false, reason: 'disposable_domain' };
  if (!checkMx) return { valid: true };

  const domain = getEmailDomain(trimmed);
  try {
    const mx = await dns.promises.resolveMx(domain);
    if (mx && mx.some((r) => r.exchange)) return { valid: true };
    // No usable MX record — some domains still accept mail on their A/AAAA record.
    return (await hasAddressRecord(domain)) ? { valid: true } : { valid: false, reason: 'no_mail_records' };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // ENOTFOUND (domain doesn't exist) / ENODATA (no MX) are definitive.
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      return (await hasAddressRecord(domain)) ? { valid: true } : { valid: false, reason: 'no_mail_records' };
    }
    // Transient / unknown DNS failure — inconclusive, so don't block a real address.
    logger.warn('Recipient MX check inconclusive; allowing send', { domain, code: code || 'unknown' });
    return { valid: true };
  }
};
