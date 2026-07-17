import { Worker } from 'bullmq';
import { DBconnection } from '../database';
import { initializeQueues } from '../queue';
import { logger } from '../utils/logger';

/**
 * Standalone boot for a single worker file run as its own process (PM2's
 * `premind-worker-*` entries execute `dist/workers/<name>-worker.js` directly).
 * Without this, the file merely defined `start*Worker` and exited — no jobs
 * were ever processed. Connects Mongo (templates/products are read while
 * rendering emails) and resolves the Redis target before starting the worker.
 */
export const bootWorkerProcess = (name: string, start: () => Worker): void => {
  (async () => {
    await DBconnection();
    await initializeQueues();
    start();
    logger.info(`Standalone ${name} worker process ready`);
  })().catch((error) => {
    logger.error(`Failed to boot ${name} worker process`, {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
};
