import { logger } from '../utils/logger';
import { initializeQueues } from '../queue';
import { startEmailWorker } from './email-worker';
import { startOrderWorker } from './order-worker';
import { startStockWorker } from './stock-worker';
import { startNotificationWorker } from './notification-worker';

export { startEmailWorker } from './email-worker';
export { startOrderWorker } from './order-worker';
export { startStockWorker } from './stock-worker';
export { startNotificationWorker } from './notification-worker';

/**
 * Start every BullMQ worker in this process. Resolves the Redis target (local vs
 * fallback) and builds the shared queues first, so workers — and any queues they
 * enqueue into (e.g. the order worker chaining to the stock queue) — all connect
 * to the same live server.
 */
export const startWorkers = async (): Promise<void> => {
  await initializeQueues();
  startEmailWorker();
  startOrderWorker();
  startStockWorker();
  startNotificationWorker();
  logger.info('All BullMQ workers started');
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
