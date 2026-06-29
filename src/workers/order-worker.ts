import { QueueEvents, Worker, ConnectionOptions } from 'bullmq';
import { logger } from '../utils/logger';
import { bullConnection } from '../utils/redis';
import { stockQueue } from '../queue';
import { finalizeVerifiedPayment, markPaymentFailed, processNewOrder } from '../services/order.service';

const connection: ConnectionOptions = bullConnection as ConnectionOptions;
const stockQueueEvents = new QueueEvents('stock', { connection });

export const startOrderWorker = (): Worker => {
  const worker = new Worker('order', async (job) => {
    logger.info(`Processing order job: ${job.id} - ${job.name}`);
    switch (job.name) {
      case 'process-new-order':
        return processNewOrder(String(job.data.orderId));
      case 'finalize-payment-verified': {
        const orderId = String(job.data.orderId);
        const stockJob = await stockQueue.add('reduce-stock', { orderId }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { age: 3600, count: 100 },
          removeOnFail: { age: 86400, count: 50 },
        });
        await stockJob.waitUntilFinished(stockQueueEvents);
        return finalizeVerifiedPayment(orderId);
      }
      case 'mark-payment-failed':
        return markPaymentFailed(String(job.data.orderId), job.data.reason as string | undefined);
      default:
        logger.warn(`Unknown order job type: ${job.name}`);
    }
  }, { connection });

  worker.on('completed', (job) => {
    logger.info(`Order job ${job?.id} completed: ${job?.name}`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Order job ${job?.id} failed: ${job?.name}`, { error: err.message });
  });

  logger.info('Order worker started');
  return worker;
};
