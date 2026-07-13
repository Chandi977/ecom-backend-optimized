import Redis, { RedisOptions } from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

/**
 * Single shared Redis layer for the whole app:
 *   - a cache client (this module) used by `withCache` / `cacheGet` / ...
 *   - `getBullConnection()`, the connection options BullMQ queues & workers reuse.
 *
 * Target auto-detection: on first use we probe the *local* Redis (config.redis
 * host/port). If it answers a PING within `probeTimeoutMs` we use it; otherwise
 * we fall back to `config.redis.url` (e.g. an Upstash `rediss://` URL). Set
 * REDIS_TARGET=local|upstash to skip the probe and force a target.
 *
 * The cache client is intentionally *non-fatal*: if Redis is unreachable, every
 * helper degrades gracefully (reads miss, writes no-op) so the API keeps serving
 * straight from Mongo/S3. This lets the app run locally without a Redis server.
 */

const KEY_PREFIX = 'premind:';

type TargetLabel = 'local' | 'upstash';

interface ResolvedTarget {
  /** host/port/password/username/tls — the "where", without client-mode flags. */
  base: RedisOptions;
  label: TargetLabel;
}

// --- Target option builders -------------------------------------------------

const localBase = (): RedisOptions => ({
  host: config.redis.host,
  port: config.redis.port,
  ...(config.redis.password ? { password: config.redis.password } : {}),
});

/** Parse a redis://|rediss:// URL (e.g. Upstash) into ioredis base options. */
const parseUrlBase = (url: string): RedisOptions | null => {
  if (!url) return null;
  try {
    const u = new URL(url);
    const base: RedisOptions = {
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : 6379,
    };
    if (u.username) base.username = decodeURIComponent(u.username);
    if (u.password) base.password = decodeURIComponent(u.password);
    // Upstash (and most managed providers) require TLS via the rediss:// scheme.
    if (u.protocol === 'rediss:') base.tls = {};
    return base;
  } catch (error) {
    logger.warn('Invalid Redis fallback URL — ignoring', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

/** Fast, self-contained liveness probe: connect + PING within `timeoutMs`. */
const probeLocal = async (base: RedisOptions, timeoutMs: number): Promise<boolean> => {
  const probe = new Redis({
    ...base,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: timeoutMs,
    retryStrategy: () => null, // never retry — we only want a quick yes/no
  });
  // Swallow the throwaway probe's own error logging; the race handles failure.
  probe.on('error', () => { /* handled below */ });
  try {
    await Promise.race([
      (async () => {
        await probe.connect();
        await probe.ping();
      })(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('probe timed out')), timeoutMs),
      ),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
};

// --- Resolution (memoised — the probe runs at most once per process) --------

let resolvedBase: RedisOptions | null = null;
let resolvePromise: Promise<ResolvedTarget> | null = null;

const doResolve = async (): Promise<ResolvedTarget> => {
  const local = localBase();
  const remote = parseUrlBase(config.redis.url);
  const mode = config.redis.target;

  const pick = (base: RedisOptions, label: TargetLabel, reason: string): ResolvedTarget => {
    resolvedBase = base;
    logger.info(`Redis target: ${label} (${reason})`, { host: base.host, port: base.port });
    return { base, label };
  };

  if (mode === 'upstash') {
    if (!remote) throw new Error('REDIS_TARGET=upstash but UPSTASH_REDIS_URL/REDIS_URL is not set');
    return pick(remote, 'upstash', 'forced via REDIS_TARGET');
  }
  if (mode === 'local' || !remote) {
    return pick(local, 'local', remote ? 'forced via REDIS_TARGET' : 'no fallback URL configured');
  }

  // auto: use local when it is actually running, otherwise fall back to the URL.
  const localUp = await probeLocal(local, config.redis.probeTimeoutMs);
  return localUp
    ? pick(local, 'local', 'local server reachable')
    : pick(remote, 'upstash', 'local server unreachable — using fallback URL');
};

const resolveTarget = (): Promise<ResolvedTarget> => {
  if (!resolvePromise) {
    resolvePromise = doResolve().catch((error) => {
      // Resolution must never crash the app: default to local so behaviour is
      // exactly as before (cache misses / in-process locks when nothing is up).
      resolvedBase = localBase();
      logger.warn('Redis target resolution failed — defaulting to local', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { base: resolvedBase, label: 'local' as TargetLabel };
    });
  }
  return resolvePromise;
};

/**
 * Resolve the Redis target (local if running, else the configured fallback URL)
 * exactly once, and return which one was chosen. Call this before constructing
 * BullMQ queues/workers so they connect to the right server. Safe to call any
 * number of times — the probe only runs on the first call.
 */
export const initRedis = async (): Promise<TargetLabel> => (await resolveTarget()).label;

// --- BullMQ connection ------------------------------------------------------

// BullMQ requires maxRetriesPerRequest:null; enableReadyCheck:false keeps it
// tolerant of managed providers (e.g. Upstash) that gate a few admin commands.
const toBullConnection = (base: RedisOptions): RedisOptions => ({
  ...base,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

/**
 * Synchronous BullMQ connection options for the resolved target. Requires
 * initRedis() to have completed first (queue/worker startup always awaits it);
 * if it somehow hasn't, falls back to the local target rather than hard-failing.
 */
export const getBullConnection = (): RedisOptions => {
  if (!resolvedBase) {
    logger.warn('getBullConnection() called before initRedis() — using local target');
    return toBullConnection(localBase());
  }
  return toBullConnection(resolvedBase);
};

// --- Cache client (lazy, non-fatal) -----------------------------------------

// Cache client options: fail fast instead of queueing when Redis is down.
const toCacheOptions = (base: RedisOptions): RedisOptions => ({
  ...base,
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  // Stop hammering / log-spamming after a few attempts when there is no server.
  retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 200, 2000)),
});

let client: Redis | null = null;
let ready = false;
let warnedUnavailable = false;
let readyWait: Promise<void> | null = null;
let clientInit: Promise<Redis> | null = null;

const createClient = async (): Promise<Redis> => {
  const { base } = await resolveTarget();
  const c = new Redis(toCacheOptions(base));

  c.on('ready', () => {
    ready = true;
    warnedUnavailable = false;
    logger.info('Redis cache connected');
  });
  c.on('end', () => { ready = false; });
  c.on('error', (error: Error) => {
    ready = false;
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      logger.warn('Redis cache unavailable — falling back to direct reads', { error: error.message });
    }
  });

  // Kick off the lazy connection without throwing on failure.
  c.connect().catch(() => { /* handled by the 'error' listener */ });
  return c;
};

const getClient = async (): Promise<Redis> => {
  if (client) return client;
  if (!clientInit) clientInit = createClient().then((c) => (client = c));
  return clientInit;
};

export const isRedisReady = (): boolean => ready;

const getStrictClient = async (): Promise<Redis> => {
  const c = await getClient();
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

/**
 * Returns the shared cache client once it is ready, or throws/times out if Redis
 * is unreachable. Used by the lock helper to run raw `SET … NX PX` and `EVAL`
 * commands; callers must add their own key prefix and fall back gracefully on
 * throw (the lock helper degrades to an in-process lock — see lock.ts).
 */
export const getRedisClient = async (): Promise<Redis> => getStrictClient();

export const cacheGet = async <T>(key: string): Promise<T | null> => {
  try {
    const raw = await (await getClient()).get(KEY_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

export const cacheSet = async (key: string, value: unknown, ttlSeconds: number): Promise<void> => {
  if (ttlSeconds <= 0) return;
  try {
    await (await getClient()).set(KEY_PREFIX + key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    /* non-fatal */
  }
};

export const cacheDel = async (key: string): Promise<void> => {
  try {
    await (await getClient()).del(KEY_PREFIX + key);
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
