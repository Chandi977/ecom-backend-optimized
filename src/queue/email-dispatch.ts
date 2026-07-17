import { addJob, emailQueue } from './index';
import { emailHandlers } from '../workers/email-worker';
import { logger } from '../utils/logger';

/**
 * Deliver an email job with a guaranteed path: enqueue to BullMQ when Redis is
 * reachable (worker retries, backoff), otherwise render + send inline in this
 * process. Auth-critical emails (signup verification, password-reset OTP) must
 * never be silently dropped just because Redis or the worker is down.
 *
 * Returns true when the email was either enqueued or sent inline.
 */
export const dispatchEmail = async (
  name: string,
  data: Record<string, unknown>,
): Promise<boolean> => {
  const enqueued = await addJob(emailQueue, name, data);
  if (enqueued) return true;

  const handler = emailHandlers[name];
  if (!handler) {
    logger.error('dispatchEmail: no inline handler for job — email dropped', { job: name });
    return false;
  }

  try {
    logger.warn('Email queue unavailable — sending inline', { job: name });
    await handler(data as Record<string, any>);
    return true;
  } catch (error) {
    logger.error('Inline email send failed', {
      job: name,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return false;
  }
};
