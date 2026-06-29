import { config } from '../../config';
import { logger } from '../../utils/logger';

/**
 * Pluggable push provider. Real delivery uses Firebase Cloud Messaging via the
 * optional `firebase-admin` dependency, activated only when FCM credentials are
 * present in config. When unconfigured (the default) every call is a safe no-op
 * so the rest of the notification pipeline (in-app feed) keeps working. This lets
 * push be switched on later by supplying credentials + installing firebase-admin,
 * with no code changes.
 */

export interface IPushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

let initAttempted = false;

const isConfigured = (): boolean =>
  !!(config.fcm.projectId && config.fcm.clientEmail && config.fcm.privateKey);

/** Lazily initialise firebase-admin. Returns the messaging instance or null. */
const getMessaging = async (): Promise<any | null> => {
  if (!isConfigured()) return null;
  try {
    // Lazy require so firebase-admin stays an optional dependency.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const admin = require('firebase-admin');
    if (!initAttempted) {
      initAttempted = true;
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: config.fcm.projectId,
            clientEmail: config.fcm.clientEmail,
            // Env-stored private keys keep literal "\n"; restore real newlines.
            privateKey: config.fcm.privateKey.replace(/\\n/g, '\n'),
          }),
        });
      }
    }
    return admin.messaging();
  } catch (err) {
    logger.warn('firebase-admin not available; push delivery skipped', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    return null;
  }
};

/**
 * Deliver a push to the given device tokens. Returns the number of messages the
 * provider accepted (0 when push is not configured). Never throws.
 */
export const sendPush = async (tokens: string[], message: IPushMessage): Promise<number> => {
  const unique = [...new Set((tokens || []).filter(Boolean))];
  if (unique.length === 0) return 0;

  if (!isConfigured()) {
    logger.info('Push not configured — skipping delivery', { tokens: unique.length, title: message.title });
    return 0;
  }

  const messaging = await getMessaging();
  if (!messaging) return 0;

  // FCM data payload values must be strings.
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(message.data || {})) {
    data[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }

  try {
    const response = await messaging.sendEachForMulticast({
      tokens: unique,
      notification: { title: message.title, body: message.body },
      data,
    });
    logger.info('Push delivered', { success: response.successCount, failure: response.failureCount });
    return response.successCount || 0;
  } catch (err) {
    logger.error('Push delivery failed', { error: err instanceof Error ? err.message : 'Unknown' });
    return 0;
  }
};

export const isPushConfigured = isConfigured;
