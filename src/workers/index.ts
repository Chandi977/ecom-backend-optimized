import { logger } from '../utils/logger';
import { initializeQueues } from '../queue';
import { DBconnection } from '../database';
import { startEmailWorker } from './email-worker';
import { startOrderWorker } from './order-worker';
import { startStockWorker } from './stock-worker';
import { startNotificationWorker } from './notification-worker';

export { startEmailWorker } from './email-worker';
export { startOrderWorker } from './order-worker';
export { startStockWorker } from './stock-worker';
export { startNotificationWorker } from './notification-worker';

/**
 * Start the four BullMQ workers in an already-booted process (DB connected,
 * queues initialized). Used by the API server to run workers in-process so a
 * single `yarn dev` handles jobs without a separate worker process.
 */
export const startAllWorkers = (): void => {
  startEmailWorker();
  startOrderWorker();
  startStockWorker();
  startNotificationWorker();
  logger.info('All BullMQ workers started');
};

/**
 * Full standalone boot: connect Mongo (email/notification workers read
 * templates and products while rendering), resolve the Redis target (local vs
 * fallback) and build the shared queues first, so workers — and any queues they
 * enqueue into (e.g. the order worker chaining to the stock queue) — all connect
 * to the same live server.
 */
export const startWorkers = async (): Promise<void> => {
  await DBconnection();
  await initializeQueues();
  startAllWorkers();
};

// Allow `yarn worker` (ts-node-dev src/workers/index.ts) to boot the workers.
if (require.main === module) {
  startWorkers().catch((error) => {
    logger.error('Failed to start workers', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}
