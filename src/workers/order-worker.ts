import { QueueEvents, Worker, ConnectionOptions } from 'bullmq';
import { logger } from '../utils/logger';
import { getBullConnection } from '../utils/redis';
import { lockContextStorage } from '../utils/concurrency/lock';
import { stockQueue } from '../queue';
import { finalizeVerifiedPayment, markPaymentFailed, processNewOrder } from '../services/order.service';

export const startOrderWorker = (): Worker => {
  const connection: ConnectionOptions = getBullConnection() as ConnectionOptions;
  const stockQueueEvents = new QueueEvents('stock', { connection });
  const worker = new Worker('order', async (job) => (
    // Run each job in its own lock context so withLock in the services gets a
    // stable flowId + per-flow heldLocks for reentrancy / deadlock detection.
    lockContextStorage.run({ flowId: `job:${job.id}`, heldLocks: [] }, async () => {
      logger.info(`Processing order job: ${job.id} - ${job.name}`);
      switch (job.name) {
        case 'process-new-order':
          return processNewOrder(String(job.data.orderId));
        case 'finalize-payment-verified': {
          const orderId = String(job.data.orderId);
          const stockJob = await stockQueue.add('reduce-stock', { orderId }, {
            // Stable jobId so a retried/duplicated finalize dedupes to one stock job.
            jobId: `reduce-stock:${orderId}`,
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
    })
  ), { connection });

  worker.on('completed', (job) => {
    logger.info(`Order job ${job?.id} completed: ${job?.name}`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Order job ${job?.id} failed: ${job?.name}`, { error: err.message });
  });

  logger.info('Order worker started');
  return worker;
};
