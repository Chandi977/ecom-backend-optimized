import {
  withLock,
  lockContextStorage,
  LockTimeoutError,
  DeadlockError,
  _setBackendForTests,
  _resetMemoryBackend,
} from './lock';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// All cases run against the in-memory backend so no live Redis is needed. Because
// each top-level withLock call (no ambient context) mints its own flowId, two
// concurrent calls behave like two independent flows / processes.
beforeEach(() => {
  _setBackendForTests('memory');
  _resetMemoryBackend();
});

afterAll(() => {
  _setBackendForTests(null);
});

describe('withLock', () => {
  it('acquires, runs the section, releases, then a waiter proceeds', async () => {
    const order: string[] = [];
    let releaseA!: () => void;
    const aHeld = new Promise<void>((r) => { releaseA = r; });

    const a = withLock('k', async () => {
      order.push('a-start');
      await aHeld;
      order.push('a-end');
    }, { waitMs: 2000 });

    await sleep(20); // let A win the lock first
    const b = withLock('k', async () => { order.push('b'); }, { waitMs: 2000 });

    await sleep(20);
    releaseA();
    await Promise.all([a, b]);

    // B must not interleave into A's critical section.
    expect(order).toEqual(['a-start', 'a-end', 'b']);
  });

  it('is reentrant for a key already held by the same flow', async () => {
    let ran = false;
    await lockContextStorage.run({ flowId: 'flow-1', heldLocks: [] }, async () => {
      await withLock('k', async () => {
        // Re-acquiring the same key in the same flow must not self-deadlock.
        await withLock('k', async () => { ran = true; }, { waitMs: 100 });
      }, { waitMs: 100 });
    });
    expect(ran).toBe(true);
  });

  it('throws LockTimeoutError when the wait budget is exhausted', async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    const holder = withLock('k', async () => { await held; }, { ttlMs: 5000 });

    await sleep(20); // ensure the holder owns the lock
    await expect(
      withLock('k', async () => { /* never reached */ }, { waitMs: 100 }),
    ).rejects.toBeInstanceOf(LockTimeoutError);

    release();
    await holder;
  });

  it('detects a wait-for cycle and throws DeadlockError instead of waiting', async () => {
    // Flow A holds k1 then wants k2; Flow B holds k2 then wants k1 -> cycle.
    let arrived = 0;
    let openBarrier!: () => void;
    const barrier = new Promise<void>((r) => { openBarrier = r; });
    const arrive = (): Promise<void> => {
      arrived += 1;
      if (arrived === 2) openBarrier();
      return barrier;
    };

    const waitMs = 1500;

    const flowA = lockContextStorage.run({ flowId: 'A', heldLocks: [] }, () =>
      withLock('k1', async () => {
        await arrive();                 // both first-locks are held before we cross
        await withLock('k2', async () => { /* would close the cycle */ }, { waitMs });
      }, { waitMs }),
    );

    const flowB = lockContextStorage.run({ flowId: 'B', heldLocks: [] }, () =>
      withLock('k2', async () => {
        await arrive();
        await withLock('k1', async () => { /* would close the cycle */ }, { waitMs });
      }, { waitMs }),
    );

    const started = Date.now();
    const results = await Promise.allSettled([flowA, flowB]);
    const elapsed = Date.now() - started;

    const deadlocks = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected' && r.reason instanceof DeadlockError,
    );

    // The cycle must be detected (at least one flow aborts with DeadlockError)...
    expect(deadlocks.length).toBeGreaterThanOrEqual(1);
    // ...and it must abort fast, not after burning the full wait budget.
    expect(elapsed).toBeLessThan(waitMs);
  });
});
