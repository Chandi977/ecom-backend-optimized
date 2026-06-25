import { Queue, ConnectionOptions } from 'bullmq';
import { logger } from '../utils/logger';
import { bullConnection } from '../utils/redis';

const connection: ConnectionOptions = bullConnection as ConnectionOptions;

export const emailQueue = new Queue('email', { connection });
export const orderQueue = new Queue('order', { connection });
export const stockQueue = new Queue('stock', { connection });
export const notificationQueue = new Queue('notification', { connection });

const queues = [emailQueue, orderQueue, stockQueue, notificationQueue];

export const addJob = async (
  queue: Queue,
  name: string,
  data: Record<string, unknown>,
  opts?: { delay?: number; attempts?: number; backoff?: { type: string; delay: number } }
): Promise<void> => {
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
  for (const queue of queues) {
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

