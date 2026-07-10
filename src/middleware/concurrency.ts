import { Request, Response, NextFunction } from 'express';
import { lockContextStorage, generateFlowId } from '../utils/concurrency/lock';

/**
 * Runs every request inside a lock context so `withLock` (in controllers/services)
 * has a stable flowId and per-flow heldLocks for reentrancy + deadlock detection.
 * Honors an inbound `x-request-id` when present so the same id shows up in
 * concurrency events and any upstream trace.
 */
export const concurrencyContext = (req: Request, _res: Response, next: NextFunction): void => {
  const headerId = req.headers['x-request-id'];
  const flowId = (Array.isArray(headerId) ? headerId[0] : headerId) || generateFlowId('req');
  lockContextStorage.run({ flowId, heldLocks: [] }, () => next());
};
