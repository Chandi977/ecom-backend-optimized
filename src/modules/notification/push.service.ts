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
  // Optional rich-notification image (big picture on Android / attachment on iOS).
  image?: string;
  data?: Record<string, unknown>;
}

// FCM caps sendEachForMulticast at 500 tokens per call.
const FCM_MULTICAST_LIMIT = 500;

// Per-token error codes that mean the token is permanently dead and should be
// removed from the registry.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

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
 *
 * Tokens are chunked to FCM's 500-per-call limit so large broadcasts don't fail,
 * and any tokens FCM reports as permanently dead are handed back via
 * `onDeadTokens` so the caller can prune them from the device registry.
 */
export const sendPush = async (
  tokens: string[],
  message: IPushMessage,
  onDeadTokens?: (dead: string[]) => Promise<void>,
): Promise<number> => {
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

  // Route to the high-importance channel the app defines; order events get their
  // own channel so users can mute promos without losing transactional updates.
  const channelId = data.type === 'order' ? 'orders' : data.channelId || 'promotions';

  const notification = {
    title: message.title,
    body: message.body,
    ...(message.image ? { imageUrl: message.image } : {}),
  };
  const android = {
    priority: 'high' as const,
    notification: {
      channelId,
      sound: 'default',
      defaultSound: true,
      notificationPriority: 'PRIORITY_HIGH' as const,
      ...(message.image ? { imageUrl: message.image } : {}),
    },
  };
  const apns = {
    headers: { 'apns-priority': '10' },
    payload: { aps: { sound: 'default', 'mutable-content': 1 } },
    ...(message.image ? { fcmOptions: { imageUrl: message.image } } : {}),
  };

  let success = 0;
  const deadTokens: string[] = [];

  for (const batch of chunk(unique, FCM_MULTICAST_LIMIT)) {
    try {
      const response = await messaging.sendEachForMulticast({
        tokens: batch,
        notification,
        data,
        android,
        apns,
      });
      success += response.successCount || 0;
      response.responses.forEach((r: any, i: number) => {
        if (!r.success && r.error?.code && DEAD_TOKEN_CODES.has(r.error.code)) {
          deadTokens.push(batch[i]);
        }
      });
    } catch (err) {
      logger.error('Push batch failed', { error: err instanceof Error ? err.message : 'Unknown', batchSize: batch.length });
    }
  }

  if (deadTokens.length > 0 && onDeadTokens) {
    try {
      await onDeadTokens(deadTokens);
    } catch (err) {
      logger.error('Dead-token prune failed', { error: err instanceof Error ? err.message : 'Unknown' });
    }
  }

  logger.info('Push delivered', { success, failure: unique.length - success, pruned: deadTokens.length });
  return success;
};

export const isPushConfigured = isConfigured;
