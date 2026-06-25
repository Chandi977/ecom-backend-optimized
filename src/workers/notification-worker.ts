import { Worker, ConnectionOptions } from 'bullmq';
import { logger } from '../utils/logger';
import { bullConnection } from '../utils/redis';
import { sendBackInStockNotifications } from '../services/notification.service';

const connection: ConnectionOptions = bullConnection as ConnectionOptions;

export const startNotificationWorker = (): Worker => {
  const worker = new Worker('notification', async (job) => {
    logger.info(`Processing notification job: ${job.id} - ${job.name}`);
    switch (job.name) {
      case 'send-back-in-stock':
        return sendBackInStockNotifications(String(job.data.productId));
      case 'send-push-notification':
        throw new Error('Push notification provider is not configured');
      default:
        logger.warn(`Unknown notification job type: ${job.name}`);
    }
  }, { connection });

  worker.on('completed', (job) => {
    logger.info(`Notification job ${job?.id} completed: ${job?.name}`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Notification job ${job?.id} failed: ${job?.name}`, { error: err.message });
  });

  logger.info('Notification worker started');
  return worker;
};
