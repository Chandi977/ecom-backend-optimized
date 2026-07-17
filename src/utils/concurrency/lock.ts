import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';
import { config } from '../../config';
import { getRedisClient, isRedisReady } from '../redis';
import { recordConcurrencyEvent } from './analyzer';

/**
 * Distributed lock helper + runtime deadlock analyzer.
 *
 * `withLock(keys, fn)` acquires one or more named locks (sorted, so multi-key
 * sections cannot self-deadlock by ordering), runs `fn`, and always releases.
 *
 *  - Ownership lives in Redis (`SET premind:lock:<key> <flowId> PX ttl NX`) so it
 *    is shared across the API process and BullMQ workers. Release is a Lua
 *    compare-and-del: only the owning flow may free its lock.
 *  - A cross-process wait-for graph (`premind:lockwait:<flowId> = <key>`) lets us
 *    DFS from a lock's holder back to ourselves before sleeping; a cycle throws
 *    DeadlockError immediately instead of waiting for the timeout.
 *  - AsyncLocalStorage tracks each flow's held locks so re-acquiring a held key
 *    is reentrant and releases stay balanced.
 *  - Fail-open: with Redis down we use a best-effort in-process backend, and if a
 *    Redis op throws mid-flight we run the section anyway. Locks are
 *    defense-in-depth over existing idempotency keys / stockReduced flags — they
 *    must never become a new single point of failure.
 */

export interface LockContext {
  flowId: string;
  heldLocks: string[];
}

export const lockContextStorage = new AsyncLocalStorage<LockContext>();

export class LockTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LockTimeoutError';
  }
}

export class DeadlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeadlockError';
  }
}

export const generateFlowId = (prefix = 'flow'): string =>
  `${prefix}:${Date.now().toString(36)}:${crypto.randomBytes(4).toString('hex')}`;

export interface WithLockOptions {
  ttlMs?: number;
  waitMs?: number;
}

const LOCK_PREFIX = 'premind:lock:';
const WAIT_PREFIX = 'premind:lockwait:';
const MAX_CYCLE_DEPTH = 64;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
// Jittered backoff, capped, so contending flows don't retry in lockstep.
const backoffMs = (attempt: number): number => Math.min(20 * attempt, 200) + Math.floor(Math.random() * 20);

interface AcquireResult {
  ok: boolean;
  owner?: string;
}

/** Pluggable lock store. Redis primary (cross-process); in-memory fallback (single-process). */
interface LockBackend {
  readonly name: 'redis' | 'memory';
  tryAcquire(key: string, flowId: string, ttlMs: number): Promise<AcquireResult>;
  release(key: string, flowId: string): Promise<void>;
  setWait(flowId: string, key: string, ttlMs: number): Promise<void>;
  clearWait(flowId: string): Promise<void>;
  getOwner(key: string): Promise<string | undefined>;
  getWait(flowId: string): Promise<string | undefined>;
}

// Lua: release only if we still own the key (compare-and-del).
const RELEASE_LUA = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

const redisBackend: LockBackend = {
  name: 'redis',
  async tryAcquire(key, flowId, ttlMs) {
    const client = await getRedisClient();
    const res = await client.set(LOCK_PREFIX + key, flowId, 'PX', ttlMs, 'NX');
    if (res === 'OK') return { ok: true };
    const owner = await client.get(LOCK_PREFIX + key);
    return { ok: false, owner: owner ?? undefined };
  },
  async release(key, flowId) {
    const client = await getRedisClient();
    await client.eval(RELEASE_LUA, 1, LOCK_PREFIX + key, flowId);
  },
  async setWait(flowId, key, ttlMs) {
    const client = await getRedisClient();
    await client.set(WAIT_PREFIX + flowId, key, 'PX', ttlMs);
  },
  async clearWait(flowId) {
    const client = await getRedisClient();
    await client.del(WAIT_PREFIX + flowId);
  },
  async getOwner(key) {
    const client = await getRedisClient();
    return (await client.get(LOCK_PREFIX + key)) ?? undefined;
  },
  async getWait(flowId) {
    const client = await getRedisClient();
    return (await client.get(WAIT_PREFIX + flowId)) ?? undefined;
  },
};

interface MemEntry { owner: string; expiresAt: number; }

// Single-process fallback + unit-test backend. Fully implements ownership and the
// wait-for graph so DFS deadlock detection is exercisable without a live Redis.
class InMemoryLockBackend implements LockBackend {
  readonly name = 'memory' as const;
  private locks = new Map<string, MemEntry>();
  private waits = new Map<string, MemEntry>();

  private live(map: Map<string, MemEntry>, k: string): MemEntry | undefined {
    const e = map.get(k);
    if (!e) return undefined;
    if (e.expiresAt <= Date.now()) { map.delete(k); return undefined; }
    return e;
  }

  async tryAcquire(key: string, flowId: string, ttlMs: number): Promise<AcquireResult> {
    const e = this.live(this.locks, key);
    if (e) return { ok: false, owner: e.owner };
    this.locks.set(key, { owner: flowId, expiresAt: Date.now() + ttlMs });
    return { ok: true };
  }
  async release(key: string, flowId: string): Promise<void> {
    const e = this.locks.get(key);
    if (e && e.owner === flowId) this.locks.delete(key);
  }
  async setWait(flowId: string, key: string, ttlMs: number): Promise<void> {
    this.waits.set(flowId, { owner: key, expiresAt: Date.now() + ttlMs });
  }
  async clearWait(flowId: string): Promise<void> {
    this.waits.delete(flowId);
  }
  async getOwner(key: string): Promise<string | undefined> {
    return this.live(this.locks, key)?.owner;
  }
  async getWait(flowId: string): Promise<string | undefined> {
    return this.live(this.waits, flowId)?.owner; // stored value is the awaited key
  }
  reset(): void { this.locks.clear(); this.waits.clear(); }
}

const memoryBackend = new InMemoryLockBackend();

// Test hook: pin a backend and bypass Redis entirely. null restores auto-select.
let forcedBackend: LockBackend | null = null;
export const _setBackendForTests = (backend: 'redis' | 'memory' | null): void => {
  forcedBackend = backend === 'redis' ? redisBackend : backend === 'memory' ? memoryBackend : null;
};
export const _resetMemoryBackend = (): void => memoryBackend.reset();

const selectBackend = (): LockBackend => {
  if (forcedBackend) return forcedBackend;
  return isRedisReady() ? redisBackend : memoryBackend;
};

// Kick off a Redis connection at boot so isRedisReady() flips true when a server
// is present (the cache client is otherwise lazy). Skipped under tests to avoid
// leaking a socket / open handle.
if (config.nodeEnv !== 'test') {
  getRedisClient().catch(() => { /* stays on the in-memory backend */ });
}

/**
 * Walk the wait-for graph from `owner`; if the chain returns to `selfFlowId`,
 * acquiring the lock would close a cycle. Returns the depth at which it closed.
 */
const detectCycle = async (
  backend: LockBackend,
  selfFlowId: string,
  owner: string,
): Promise<{ found: boolean; depth: number }> => {
  let current = owner;
  const visited = new Set<string>();
  for (let depth = 1; depth <= MAX_CYCLE_DEPTH; depth++) {
    if (current === selfFlowId) return { found: true, depth };
    if (visited.has(current)) return { found: false, depth }; // unrelated cycle; bounded
    visited.add(current);
    let waitKey: string | undefined;
    try { waitKey = await backend.getWait(current); } catch { return { found: false, depth }; }
    if (!waitKey) return { found: false, depth };
    let next: string | undefined;
    try { next = await backend.getOwner(waitKey); } catch { return { found: false, depth }; }
    if (!next) return { found: false, depth };
    current = next;
  }
  return { found: false, depth: MAX_CYCLE_DEPTH };
};

/**
 * Acquire a single key. Returns true if held, false if we should proceed without
 * it (fail-open on a Redis error). Throws LockTimeoutError / DeadlockError.
 */
const acquireOne = async (
  backend: LockBackend,
  key: string,
  ctx: LockContext,
  ttlMs: number,
  waitMs: number,
): Promise<boolean> => {
  const start = Date.now();
  let waited = false;
  let attempt = 0;

  for (;;) {
    let res: AcquireResult;
    try {
      res = await backend.tryAcquire(key, ctx.flowId, ttlMs);
    } catch {
      // Redis unreachable mid-acquire -> fail-open: run the section without a lock.
      recordConcurrencyEvent({ type: 'degraded', key, flowId: ctx.flowId, backend: backend.name });
      await backend.clearWait(ctx.flowId).catch(() => undefined);
      return false;
    }

    if (res.ok) {
      recordConcurrencyEvent({
        type: waited ? 'waited' : 'acquired',
        key,
        flowId: ctx.flowId,
        ...(waited ? { waitMs: Date.now() - start } : {}),
        backend: backend.name,
      });
      await backend.clearWait(ctx.flowId).catch(() => undefined);
      return true;
    }

    // Contended: publish our wait edge, then check for a cycle before sleeping.
    waited = true;
    await backend.setWait(ctx.flowId, key, ttlMs).catch(() => undefined);
    const owner = res.owner;
    if (owner && owner !== ctx.flowId) {
      const cycle = await detectCycle(backend, ctx.flowId, owner);
      if (cycle.found) {
        await backend.clearWait(ctx.flowId).catch(() => undefined);
        recordConcurrencyEvent({ type: 'deadlock', key, flowId: ctx.flowId, ownerFlowId: owner, depth: cycle.depth, backend: backend.name });
        throw new DeadlockError(`Deadlock detected acquiring "${key}" (held by ${owner})`);
      }
    }

    if (Date.now() - start >= waitMs) {
      await backend.clearWait(ctx.flowId).catch(() => undefined);
      recordConcurrencyEvent({ type: 'timeout', key, flowId: ctx.flowId, ownerFlowId: owner, waitMs: Date.now() - start, backend: backend.name });
      throw new LockTimeoutError(`Timed out acquiring lock "${key}" after ${waitMs}ms`);
    }

    attempt += 1;
    await sleep(backoffMs(attempt));
  }
};

/**
 * Run `fn` while holding `keys`. Keys are sorted before acquisition (global lock
 * ordering) so nested/multi-key sections are deadlock-free by construction; the
 * analyzer catches anything that slips past ordering. Reentrant per flow.
 */
export const withLock = async <T>(
  keys: string | string[],
  fn: () => Promise<T> | T,
  opts?: WithLockOptions,
): Promise<T> => {
  if (!config.concurrency.lockEnabled) return fn();

  const keyList = Array.from(new Set(Array.isArray(keys) ? keys : [keys])).sort();
  const ttlMs = opts?.ttlMs ?? config.concurrency.lockTtlMs;
  const waitMs = opts?.waitMs ?? config.concurrency.lockWaitMs;

  const existing = lockContextStorage.getStore();
  const ctx: LockContext = existing ?? { flowId: generateFlowId('flow'), heldLocks: [] };

  const run = async (): Promise<T> => {
    const backend = selectBackend();
    const acquired: string[] = [];
    try {
      for (const key of keyList) {
        if (ctx.heldLocks.includes(key)) continue; // reentrant: already held by this flow
        const ok = await acquireOne(backend, key, ctx, ttlMs, waitMs);
        if (ok) {
          acquired.push(key);
          ctx.heldLocks.push(key);
        }
      }
      return await fn();
    } finally {
      for (const key of acquired.reverse()) {
        const idx = ctx.heldLocks.lastIndexOf(key);
        if (idx !== -1) ctx.heldLocks.splice(idx, 1);
        try {
          await backend.release(key, ctx.flowId);
          recordConcurrencyEvent({ type: 'released', key, flowId: ctx.flowId, backend: backend.name });
        } catch { /* fail-open: the lock TTL will expire it */ }
      }
    }
  };

  // Reuse an existing flow context (middleware/worker) so heldLocks + deadlock
  // detection span the whole flow; otherwise establish one for this call.
  return existing ? run() : lockContextStorage.run(ctx, run);
};
