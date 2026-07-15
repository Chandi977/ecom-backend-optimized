import Order from '../modules/order/order.model';
import Counter from '../modules/counter/counter.model';
import { addJob, emailQueue } from '../queue';
import { logger } from '../utils/logger';
import { withLock } from '../utils/concurrency/lock';
import { notifyUserEvent } from '../modules/notification/custom-notification.service';

const FAILURE_STATUSES = new Set(['Payment Failed', 'Payment Abandoned', 'Cancelled', 'Expired']);

const PUBLIC_ORDER_ID_REGEX = /^PI-\d+$/;

// The human-readable, sequential "PI-<n>" order number is only minted once a
// payment is confirmed (see finalizeVerifiedPayment). Until then an order carries
// a temporary "TMP-..." id, so unpaid/abandoned orders never consume a PI- number.
export const getNextOrderId = async (): Promise<string> => {
  // Atomically increment the counter
  const counter = await Counter.findOneAndUpdate(
    { name: 'order' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  let candidateSeq = counter.seq;

  // If the candidate ID already exists, jump to max existing + 1
  const exists = await Order.findOne({ orderId: `PI-${candidateSeq}` }).select('_id').lean().exec();
  if (exists) {
    const [maxDoc] = await Order.aggregate([
      { $match: { orderId: { $regex: PUBLIC_ORDER_ID_REGEX } } },
      { $addFields: { num: { $toInt: { $substrCP: ['$orderId', 3, { $strLenCP: '$orderId' }] } } } },
      { $group: { _id: null, maxNum: { $max: '$num' } } },
    ]).exec();
    const maxNum = maxDoc?.maxNum ?? candidateSeq;
    const newSeq = Math.max(maxNum, candidateSeq) + 1;
    await Counter.findOneAndUpdate({ name: 'order' }, { $set: { seq: newSeq } });
    candidateSeq = newSeq;
  }

  return `PI-${candidateSeq}`;
};

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

export const finalizeVerifiedPayment = async (orderId: string): Promise<unknown> => (
  // Serialize finalization per order so a duplicate webhook + frontend update can
  // never mint two PI- numbers or double-send confirmation emails.
  withLock([`finalize:order:${orderId}`], () => finalizeVerifiedPaymentLocked(orderId), { ttlMs: 30000 })
);

const finalizeVerifiedPaymentLocked = async (orderId: string): Promise<unknown> => {
  const order = await Order.findById(orderId).exec();
  if (!order) throw new Error(`Order not found: ${orderId}`);

  if (order.paymentStatus === 'Payment Verified') {
    return order;
  }

  // Mint the real PI- order number now that payment is confirmed. Orders created
  // but never paid keep their temporary TMP- id and never burn a PI- sequence value.
  const needsPublicId = !PUBLIC_ORDER_ID_REGEX.test(order.orderId);

  const baseUpdate: Record<string, unknown> = {
    paymentStatus: 'Payment Verified',
    status: 'Payment Verified',
    paymentDate: order.paymentDate || new Date(),
  };

  let updated: typeof order | null = null;
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const update = needsPublicId
      ? { ...baseUpdate, orderId: await getNextOrderId() }
      : baseUpdate;
    try {
      updated = await Order.findByIdAndUpdate(order._id, update, { new: true }).exec();
      break;
    } catch (saveErr: unknown) {
      const se = saveErr as Error & { code?: number; keyPattern?: Record<string, unknown> };
      if (needsPublicId && se.code === 11000 && se.keyPattern?.orderId && attempt < maxRetries - 1) {
        logger.warn(`orderId collision finalizing ${orderId}, retrying (${attempt + 1}/${maxRetries})`);
        continue;
      }
      throw se;
    }
  }

  if (!updated) throw new Error(`Unable to finalize payment for order ${orderId}`);

  // The customer's first and only "order placed" email - payment is confirmed by
  // the time we get here, so the message is never sent against an unpaid order.
  await addJob(emailQueue, 'order-placed', {
    to: updated.email,
    subject: 'Your Order has been placed',
    order: updated.toObject(),
  });
  await addJob(emailQueue, 'payment-confirmed', {
    to: null,
    subject: 'Order confirmed - ready to dispatch',
    order: updated.toObject(),
  });
  await notifyUserEvent(updated.user ? String(updated.user) : undefined, 'order-placed-push',
    { name: updated.name, orderId: updated.orderId, status: updated.status },
    { type: 'order', orderId: String(updated._id) });

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
