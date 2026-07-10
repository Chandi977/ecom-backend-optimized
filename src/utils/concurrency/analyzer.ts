import mongoose from 'mongoose';
import { config } from '../../config';
import { logger } from '../logger';
import ConcurrencyEvent, { IConcurrencyEvent, ConcurrencyEventType } from '../../modules/concurrency/concurrency-event.model';

/**
 * Observability sink for the lock helper. Every lock lifecycle event bumps an
 * in-memory counter, writes a structured log line, and (when the analyzer flag
 * is on and Mongo is connected) persists a TTL-bounded ConcurrencyEvent doc.
 *
 * Persistence is best-effort and non-blocking: it must never throw into or slow
 * down a critical section, so failures are swallowed.
 */

interface Counters {
  byType: Record<ConcurrencyEventType, number>;
  contendedKeys: Record<string, number>; // key -> number of waited/timeout/deadlock events
}

const counters: Counters = {
  byType: { acquired: 0, waited: 0, timeout: 0, released: 0, deadlock: 0, degraded: 0 },
  contendedKeys: {},
};

const CONTENDED_TYPES: ReadonlySet<ConcurrencyEventType> = new Set(['waited', 'timeout', 'deadlock']);

// Events worth surfacing at warn level rather than debug.
const WARN_TYPES: ReadonlySet<ConcurrencyEventType> = new Set(['timeout', 'deadlock', 'degraded']);

export const recordConcurrencyEvent = (event: IConcurrencyEvent): void => {
  counters.byType[event.type] = (counters.byType[event.type] || 0) + 1;
  if (CONTENDED_TYPES.has(event.type)) {
    counters.contendedKeys[event.key] = (counters.contendedKeys[event.key] || 0) + 1;
  }

  const meta = {
    key: event.key,
    flowId: event.flowId,
    ...(event.ownerFlowId ? { ownerFlowId: event.ownerFlowId } : {}),
    ...(event.waitMs !== undefined ? { waitMs: event.waitMs } : {}),
    ...(event.depth !== undefined ? { depth: event.depth } : {}),
    ...(event.backend ? { backend: event.backend } : {}),
  };
  if (WARN_TYPES.has(event.type)) {
    logger.warn(`Concurrency ${event.type}`, meta);
  } else {
    logger.debug(`Concurrency ${event.type}`, meta);
  }

  if (!config.concurrency.analyzerEnabled) return;
  if (mongoose.connection.readyState !== 1) return;
  // Fire-and-forget; never block or throw into the caller's critical section.
  ConcurrencyEvent.create(event).catch((error) => {
    logger.debug('Failed to persist concurrency event', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
  });
};

/** Snapshot of counters for tests / a future observability endpoint. */
export const getConcurrencyStats = (): Counters => ({
  byType: { ...counters.byType },
  contendedKeys: { ...counters.contendedKeys },
});

/** Test helper: reset in-memory counters between cases. */
export const resetConcurrencyStats = (): void => {
  counters.byType = { acquired: 0, waited: 0, timeout: 0, released: 0, deadlock: 0, degraded: 0 };
  counters.contendedKeys = {};
};
