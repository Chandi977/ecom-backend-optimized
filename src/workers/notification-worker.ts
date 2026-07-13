import { Worker, ConnectionOptions } from 'bullmq';
import { logger } from '../utils/logger';
import { getBullConnection } from '../utils/redis';
import { sendBackInStockNotifications } from '../services/notification.service';
import { sendPush } from '../modules/notification/push.service';
import { dispatch, IDispatchOptions } from '../modules/notification/custom-notification.service';

export const startNotificationWorker = (): Worker => {
  const connection: ConnectionOptions = getBullConnection() as ConnectionOptions;
  const worker = new Worker('notification', async (job) => {
    logger.info(`Processing notification job: ${job.id} - ${job.name}`);
    switch (job.name) {
      case 'send-back-in-stock':
        return sendBackInStockNotifications(String(job.data.productId));
      case 'send-push-notification':
        // Direct push to explicit device tokens.
        return sendPush(job.data.tokens as string[], {
          title: job.data.title as string,
          body: job.data.body as string,
          data: job.data.data as Record<string, unknown>,
        });
      case 'send-custom-notification':
        // Fan-out broadcast: in-app feed + push to an audience.
        return dispatch(job.data as IDispatchOptions);
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
