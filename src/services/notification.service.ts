import { addJob, emailQueue } from '../queue';
import Notify from '../modules/notify/notify.model';
import { logger } from '../utils/logger';

interface IBackInStockResult {
  productId: string;
  queued: number;
}

export const sendBackInStockNotifications = async (productId: string): Promise<IBackInStockResult> => {
  const notifications = await Notify.find({ product_id: productId, mail_sent: false }).exec();
  if (notifications.length === 0) {
    return { productId, queued: 0 };
  }

  const emails = [...new Set(notifications.map((notification) => notification.email_address).filter(Boolean))];
  if (emails.length === 0) {
    return { productId, queued: 0 };
  }

  await addJob(emailQueue, 'back-in-stock', {
    emails,
    productId,
    subject: 'Product back in Stock',
  });

  await Notify.updateMany(
    { _id: { $in: notifications.map((notification) => notification._id) } },
    { $set: { mail_sent: true } }
  ).exec();

  logger.info('Back-in-stock notifications queued', { productId, count: emails.length });
  return { productId, queued: emails.length };
};
