import { Worker, ConnectionOptions } from 'bullmq';
import { logger } from '../utils/logger';
import { bullConnection } from '../utils/redis';
import { lockContextStorage } from '../utils/concurrency/lock';
import { reduceStockForOrder, restoreStockForOrder } from '../services/stock.service';

const connection: ConnectionOptions = bullConnection as ConnectionOptions;

export const startStockWorker = (): Worker => {
  const worker = new Worker('stock', async (job) => (
    lockContextStorage.run({ flowId: `job:${job.id}`, heldLocks: [] }, async () => {
      logger.info(`Processing stock job: ${job.id} - ${job.name}`);
      switch (job.name) {
        case 'reduce-stock':
          return reduceStockForOrder(String(job.data.orderId));
        case 'restore-stock':
          return restoreStockForOrder(String(job.data.orderId));
        default:
          logger.warn(`Unknown stock job type: ${job.name}`);
      }
    })
  ), { connection });

  worker.on('completed', (job) => {
    logger.info(`Stock job ${job?.id} completed: ${job?.name}`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Stock job ${job?.id} failed: ${job?.name}`, { error: err.message });
  });

  logger.info('Stock worker started');
  return worker;
};
