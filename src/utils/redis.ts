import Redis, { RedisOptions } from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

/**
 * Single shared Redis layer for the whole app:
 *   - a cache client (this module) used by `withCache` / `cacheGet` / ...
 *   - `bullConnection`, the connection options BullMQ queues & workers reuse.
 *
 * The cache client is intentionally *non-fatal*: if Redis is unreachable, every
 * helper degrades gracefully (reads miss, writes no-op) so the API keeps serving
 * straight from Mongo/S3. This lets the app run locally without a Redis server.
 *
 * Uses `config.redis`, which defaults to 127.0.0.1:6379 — no extra env required.
 */

const KEY_PREFIX = 'premind:';

// Connection options shared with BullMQ. BullMQ requires `maxRetriesPerRequest: null`.
export const bullConnection: RedisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  ...(config.redis.password ? { password: config.redis.password } : {}),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

// Cache client options: fail fast instead of queueing when Redis is down.
const cacheOptions: RedisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  ...(config.redis.password ? { password: config.redis.password } : {}),
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  // Stop hammering / log-spamming after a few attempts when there is no server.
  retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 200, 2000)),
};

let client: Redis | null = null;
let ready = false;
let warnedUnavailable = false;
let readyWait: Promise<void> | null = null;

const getClient = (): Redis => {
  if (client) return client;

  client = new Redis(cacheOptions);

  client.on('ready', () => {
    ready = true;
    warnedUnavailable = false;
    logger.info('Redis cache connected');
  });
  client.on('end', () => { ready = false; });
  client.on('error', (error: Error) => {
    ready = false;
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      logger.warn('Redis cache unavailable — falling back to direct reads', { error: error.message });
    }
  });

  // Kick off the lazy connection without throwing on failure.
  client.connect().catch(() => { /* handled by the 'error' listener */ });
  return client;
};

export const isRedisReady = (): boolean => ready;

const getStrictClient = async (): Promise<Redis> => {
  const c = getClient();
  if (ready && c.status === 'ready') return c;
  if (c.status === 'end' || c.status === 'close') {
    throw new Error('Redis connection is closed');
  }

  if (!readyWait) {
    readyWait = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Redis connection timed out'));
      }, 2000);

      const cleanup = () => {
        clearTimeout(timeout);
        c.off('ready', onReady);
        c.off('error', onError);
        c.off('end', onEnd);
      };

      const onReady = () => {
        cleanup();
        resolve();
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const onEnd = () => {
        cleanup();
        reject(new Error('Redis connection ended'));
      };

      c.once('ready', onReady);
      c.once('error', onError);
      c.once('end', onEnd);
    }).finally(() => {
      readyWait = null;
    });
  }

  await readyWait;
  return c;
};

export const cacheGet = async <T>(key: string): Promise<T | null> => {
  try {
    const raw = await getClient().get(KEY_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

export const cacheSet = async (key: string, value: unknown, ttlSeconds: number): Promise<void> => {
  if (ttlSeconds <= 0) return;
  try {
    await getClient().set(KEY_PREFIX + key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    /* non-fatal */
  }
};

export const cacheDel = async (key: string): Promise<void> => {
  try {
    await getClient().del(KEY_PREFIX + key);
  } catch {
    /* non-fatal */
  }
};

export const strictRedisGet = async (key: string): Promise<string | null> => {
  return (await getStrictClient()).get(KEY_PREFIX + key);
};

export const strictRedisSet = async (key: string, value: string, ttlSeconds: number): Promise<void> => {
  if (ttlSeconds <= 0) return;
  await (await getStrictClient()).set(KEY_PREFIX + key, value, 'EX', ttlSeconds);
};

export const strictRedisSetNx = async (key: string, value: string, ttlSeconds: number): Promise<boolean> => {
  if (ttlSeconds <= 0) return false;
  const result = await (await getStrictClient()).set(KEY_PREFIX + key, value, 'EX', ttlSeconds, 'NX');
  return result === 'OK';
};


