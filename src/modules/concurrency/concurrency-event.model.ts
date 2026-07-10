import mongoose, { Schema, Document } from 'mongoose';

/**
 * Lifecycle events emitted by the distributed lock helper + deadlock analyzer
 * (src/utils/concurrency/lock.ts). Persisted only when the analyzer flag is on;
 * TTL-bounded so the collection stays small. Mirrors the activity-log model.
 */
export type ConcurrencyEventType =
  | 'acquired'   // a lock was taken without contention
  | 'waited'     // a lock was contended and acquired after waiting
  | 'timeout'    // waitMs elapsed without acquiring the lock (LockTimeoutError)
  | 'released'   // a held lock was released
  | 'deadlock'   // a wait-for cycle was detected (DeadlockError) and aborted
  | 'degraded';  // Redis was unreachable; ran with an in-process/no lock (fail-open)

export interface IConcurrencyEvent {
  type: ConcurrencyEventType;
  key: string;          // resource key, e.g. "cart:<userId>" or "stock:<productId>:<packSize>"
  flowId: string;       // request/job id that owns or is waiting on the lock
  ownerFlowId?: string; // for waited/deadlock: the flow currently holding the key
  waitMs?: number;      // time spent waiting before acquire/timeout
  depth?: number;       // wait-for graph depth at which a cycle was found
  backend?: 'redis' | 'memory';
  createdAt?: Date;
}

export interface IConcurrencyEventDocument extends IConcurrencyEvent, Document {}

// Days to retain events before the TTL index expires them. Keeps the collection bounded.
const TTL_DAYS = parseInt(process.env.CONCURRENCY_EVENT_TTL_DAYS || '14', 10);

const concurrencyEventSchema = new Schema<IConcurrencyEventDocument>({
  type: { type: String, required: true, index: true },
  key: { type: String, required: true, index: true },
  flowId: { type: String, required: true },
  ownerFlowId: { type: String },
  waitMs: { type: Number },
  depth: { type: Number },
  backend: { type: String, enum: ['redis', 'memory'] },
  // TTL index: documents auto-expire TTL_DAYS after creation.
  createdAt: { type: Date, default: Date.now, expires: TTL_DAYS * 24 * 60 * 60 },
});

// Common query patterns: recent first, filtered by type / contended key over a window.
concurrencyEventSchema.index({ createdAt: -1 });
concurrencyEventSchema.index({ type: 1, createdAt: -1 });
concurrencyEventSchema.index({ key: 1, createdAt: -1 });

const ConcurrencyEvent = mongoose.model<IConcurrencyEventDocument>('ConcurrencyEvent', concurrencyEventSchema);
export default ConcurrencyEvent;
