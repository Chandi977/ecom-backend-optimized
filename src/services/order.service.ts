import Order from '../modules/order/order.model';
import { addJob, emailQueue } from '../queue';
import { logger } from '../utils/logger';

const FAILURE_STATUSES = new Set(['Payment Failed', 'Payment Abandoned', 'Cancelled', 'Expired']);

export const deriveOrderStatus = (current: string, paymentStatus: string): string => {
  if (['Payment Failed', 'Payment Abandoned', 'Not Paid'].includes(paymentStatus)) return 'placed';
  if (paymentStatus === 'Payment Processed') return 'Payment Done';
  if (paymentStatus === 'Payment Verified') return 'Payment Verified';
  return current;
};

export const resolvePaymentStatus = (current: string, desired: string): string => {
  if (!desired) return current;
  if (current === 'Payment Verified') return 'Payment Verified';
  if (FAILURE_STATUSES.has(desired)) return desired;
  if (desired === 'Payment Verified') return 'Payment Verified';
  const paymentFlow = ['Not Paid', 'Payment Processed', 'Paid', 'Payment Verified'];
  const currentIndex = paymentFlow.indexOf(current);
  const desiredIndex = paymentFlow.indexOf(desired);
  return desiredIndex >= currentIndex ? desired : current;
};

export const finalizeVerifiedPayment = async (orderId: string): Promise<unknown> => {
  const order = await Order.findById(orderId).exec();
  if (!order) throw new Error(`Order not found: ${orderId}`);

  if (order.paymentStatus === 'Payment Verified') {
    return order;
  }

  const updated = await Order.findByIdAndUpdate(
    order._id,
    {
      paymentStatus: 'Payment Verified',
      status: 'Payment Verified',
      paymentDate: order.paymentDate || new Date(),
    },
    { new: true }
  ).exec();

  if (!updated) throw new Error(`Unable to finalize payment for order ${orderId}`);

  await addJob(emailQueue, 'payment-received', {
    to: updated.email,
    subject: 'Payment received',
    order: updated.toObject(),
  });
  await addJob(emailQueue, 'payment-confirmed', {
    to: null,
    subject: 'Order confirmed - ready to dispatch',
    order: updated.toObject(),
  });

  logger.info('Order payment finalized', { orderId });
  return updated;
};

export const markPaymentFailed = async (orderId: string, reason?: string): Promise<unknown> => {
  const order = await Order.findById(orderId).exec();
  if (!order) throw new Error(`Order not found: ${orderId}`);

  const updated = await Order.findByIdAndUpdate(
    order._id,
    {
      paymentStatus: 'Payment Failed',
      status: deriveOrderStatus(order.status, 'Payment Failed'),
      paymentFailedAt: new Date(),
      paymentFailureReason: reason || 'Payment failed',
    },
    { new: true }
  ).exec();

  if (!updated) throw new Error(`Unable to mark payment failed for order ${orderId}`);

  await addJob(emailQueue, 'payment-failed', {
    to: updated.email,
    subject: 'Payment Failed',
    order: updated.toObject(),
  });

  logger.info('Order payment marked failed', { orderId });
  return updated;
};

export const processNewOrder = async (orderId: string): Promise<unknown> => {
  const order = await Order.findById(orderId).exec();
  if (!order) throw new Error(`Order not found: ${orderId}`);

  logger.info('New order processed', {
    orderId,
    publicOrderId: order.orderId,
    status: order.status,
    paymentStatus: order.paymentStatus,
  });

  return order;
};
