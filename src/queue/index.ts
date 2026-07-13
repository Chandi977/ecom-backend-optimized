import { Queue, ConnectionOptions } from 'bullmq';
import { logger } from '../utils/logger';
import { getBullConnection, initRedis } from '../utils/redis';

/**
 * Queues are built lazily by `initializeQueues()` *after* the Redis target has
 * been resolved (local vs. fallback URL), so they always connect to the server
 * that is actually up. These are live bindings — importers see the constructed
 * instances once initialization has run (it runs during server/worker startup).
 */
export let emailQueue: Queue;
export let orderQueue: Queue;
export let stockQueue: Queue;
export let notificationQueue: Queue;

let built = false;

export const addJob = async (
  queue: Queue | undefined,
  name: string,
  data: Record<string, unknown>,
  opts?: { delay?: number; attempts?: number; backoff?: { type: string; delay: number } }
): Promise<void> => {
  if (!queue) {
    logger.warn('addJob called before queues were initialized — dropping job', { job: name });
    return;
  }
  try {
    await queue.add(name, data, {
      attempts: opts?.attempts ?? 3,
      backoff: opts?.backoff ?? { type: 'exponential', delay: 2000 },
      delay: opts?.delay,
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 86400, count: 50 },
    });
  } catch (error) {
    logger.error('Failed to add job to queue', {
      queue: queue.name,
      job: name,
      error: error instanceof Error ? error.message : 'Unknown',
    });
  }
};

export const initializeQueues = async (): Promise<void> => {
  // Resolve local-vs-fallback first so every queue uses the same live target.
  await initRedis();

  if (!built) {
    const connection = getBullConnection() as ConnectionOptions;
    emailQueue = new Queue('email', { connection });
    orderQueue = new Queue('order', { connection });
    stockQueue = new Queue('stock', { connection });
    notificationQueue = new Queue('notification', { connection });
    built = true;
  }

  for (const queue of [emailQueue, orderQueue, stockQueue, notificationQueue]) {
    try {
      await queue.waitUntilReady();
      logger.info(`Queue initialized: ${queue.name}`);
    } catch (error) {
      logger.error(`Failed to initialize queue: ${queue.name}`, {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }
};
