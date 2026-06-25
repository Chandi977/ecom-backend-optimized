import { Response } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Razorpay from 'razorpay';
import Order from '../order/order.model';
import Product from '../product/product.model';
import Counter from '../counter/counter.model';
import User from '../auth/auth.model';
import { config } from '../../config';
import { commonResponse } from '../../utils/response';
import { sanitizeString } from '../../utils/validators';
import { calculateOrderGST } from '../../utils/gst-calculator';
import { attachSignedImagesToOrders } from '../../utils/s3';
import { IAuthRequest } from '../../types';
import { logger } from '../../utils/logger';
import { addJob, emailQueue, orderQueue } from '../../queue';
import { resolvePaymentStatus, deriveOrderStatus } from '../../services/order.service';
import { IStockItem, toStockItems } from '../../services/stock.service';

if (!config.razorpay.keyId || !config.razorpay.keySecret) {
  throw new Error('Razorpay env vars missing');
}

const razorpay = new Razorpay({
  key_id: config.razorpay.keyId,
  key_secret: config.razorpay.keySecret,
});

const IMAGE_SIGN_OPTIONS = { expiresIn: 3600 };
const PAYMENT_STATUS_SET = new Set(['Not Paid', 'Payment Processed', 'Payment Verified', 'Paid', 'Payment Failed', 'Payment Abandoned', 'Cancelled', 'Expired']);

const normalizePaymentStatus = (value?: string): string | null => {
  if (!value) return null;
  const t = value.trim().toLowerCase();
  if (t === 'paid') return 'Payment Verified';
  if (t === 'payment done') return 'Payment Processed';
  return Array.from(PAYMENT_STATUS_SET).find((s) => s.toLowerCase() === t) || null;
};

const getNextOrderId = async (session?: mongoose.ClientSession): Promise<string> => {
  const counter = await Counter.findOneAndUpdate(
    { name: 'order' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true, session }
  );
  return `PI-${counter.seq}`;
};

const verifyRazorpayPayment = async (payload: Record<string, unknown>, existingOrder: Record<string, unknown>) => {
  const { razorpayPaymentId, razorpayOrderId, razorpaySignature } = payload;
  if (!razorpayPaymentId) throw new Error('Missing payment id');

  const reused = await Order.findOne({
    razorpayPaymentId: razorpayPaymentId as string,
    paymentStatus: { $in: ['Payment Processed', 'Payment Verified'] },
    _id: { $ne: existingOrder._id },
  }).select('_id').lean().exec();
  if (reused) throw new Error('Payment ID already used');

  if (razorpayOrderId && razorpaySignature) {
    const digest = crypto.createHmac('sha256', config.razorpay.keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');
    if (digest !== razorpaySignature) throw new Error('Invalid signature');
  }

  const payment = await razorpay.payments.fetch(razorpayPaymentId as string);
  if (!payment) throw new Error('Unable to verify payment');

  const expected = Math.round(Number(existingOrder.totalOrderValue || 0) * 100);
  if (payment.amount !== expected) throw new Error('Amount mismatch');
  if (!['authorized', 'captured'].includes(payment.status)) throw new Error('Payment not completed');

  if (payment.status === 'authorized') {
    await razorpay.payments.capture(razorpayPaymentId as string, expected, 'INR');
  }
};

const queuePaymentFinalization = async (orderId: string): Promise<void> => {
  await orderQueue.add('finalize-payment-verified', { orderId }, {
    jobId: `finalize-payment-verified:${orderId}`,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: { age: 86400, count: 50 },
  });
};

export const createOrder = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { items, name, phone, mobile, email, address, town, state, pincode, landmark, gstin, total, totalPackWeight, shippingCost, totalOrderValue, totalCartValue, utrNumber, couponCode } = req.body;
    const idempotencyKey = req.body.idempotencyKey || req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || null;

    if (!Array.isArray(items) || items.length === 0) { res.status(400).json(commonResponse('Items required', false)); return; }

    // Idempotency check
    if (idempotencyKey) {
      const existing = await Order.findOne({ idempotencyKey: String(idempotencyKey) }).lean().exec();
      if (existing) { res.status(200).json(commonResponse('Order already created', true, existing)); return; }
    }

    const gstResult = await calculateOrderGST(items, Number(shippingCost) || 0);
    const clientTotal = Number(totalOrderValue);
    const serverTotal = gstResult.totalOrderValue;
    if (Number.isFinite(clientTotal) && clientTotal > serverTotal + 2) {
      res.status(400).json(commonResponse('Order total mismatch', false)); return;
    }
    const finalTotal = Number.isFinite(clientTotal) && clientTotal < serverTotal - 2 ? clientTotal : serverTotal;

    const orderPayload: Record<string, unknown> = {
      items: gstResult.itemsWithGst,
      name: sanitizeString(name),
      phone: sanitizeString(phone || mobile),
      email: sanitizeString(email).toLowerCase(),
      address: sanitizeString(address),
      town: sanitizeString(town),
      state: sanitizeString(state),
      pincode: sanitizeString(pincode),
      landmark: sanitizeString(landmark),
      gstin: sanitizeString(gstin).toUpperCase(),
      user: req.user,
      total, totalPackWeight, shippingCost,
      totalOrderValue: finalTotal,
      totalCartValue, status: 'placed', paymentStatus: 'Not Paid',
      utrNumber, couponCode, stockReduced: false,
      taxableAmount: gstResult.taxableAmount,
      ...(idempotencyKey ? { idempotencyKey: String(idempotencyKey) } : {}),
    };

    const orderId = await getNextOrderId();
    const order = new Order({ orderId, ...orderPayload });
    const data = await order.save();

    if (data) {
      await addJob(emailQueue, 'order-placed', { to: data.email, subject: 'Your Order has been placed', order: data.toObject() });
      await addJob(orderQueue, 'process-new-order', { orderId: data._id });
      res.status(201).json(commonResponse('Order created', true, data));
    } else {
      res.status(500).json(commonResponse('Failed to create order', false));
    }
  } catch (error: unknown) {
    const err = error as Error & { code?: number };
    if (err.code === 11000 && req.body.idempotencyKey) {
      const existing = await Order.findOne({ idempotencyKey: String(req.body.idempotencyKey) }).lean().exec();
      if (existing) { res.status(200).json(commonResponse('Order already created', true, existing)); return; }
    }
    logger.error('Create order error', { error: err.message });
    res.status(500).json(commonResponse('Internal server error', false));
  }
};

export const allOrders = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { skip = '0', limit = '10' } = req.query;
    const orders = await Order.find().sort({ createdAt: -1 }).skip(parseInt(skip as string)).limit(parseInt(limit as string)).populate('user items.product').lean().exec();
    res.status(orders.length > 0 ? 200 : 404).json(commonResponse(orders.length > 0 ? 'Orders found' : 'No orders', orders.length > 0, orders));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const specificOrder = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await Order.findOne({ _id: req.params.id }).populate('user items.product').lean().exec();
    if (!data) { res.status(404).json(commonResponse('Order not found', false)); return; }
    if (req.userRole !== 'admin') {
      const orderUserId = (data.user as any)?._id?.toString() || data.user?.toString();
      let isOwner = orderUserId === req.user;
      if (!isOwner) {
        const userDoc = await User.findById(req.user).select('email_address').lean().exec();
        isOwner = Boolean(userDoc?.email_address && String(data.email).toLowerCase() === String(userDoc.email_address).toLowerCase());
      }
      if (!isOwner) { res.status(403).json(commonResponse('Forbidden', false)); return; }
    }
    res.status(200).json(commonResponse('Order found', true, data));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const updateOrder = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { status, id } = req.body;
    const data = await Order.findOneAndUpdate({ _id: id }, { status }, { new: true }).exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Order updated' : 'Not found', !!data, data || undefined));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const updateOrderShipping = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { shippingDate, id, status } = req.body;
    const data = await Order.findOneAndUpdate({ _id: id }, { shippingDate, status }, { new: true }).exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Shipping updated' : 'Not found', !!data, data || undefined));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const updateOrderTracking = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { trackingId, id, deliveryPartner } = req.body;
    const data = await Order.findOneAndUpdate({ _id: id }, { trackingId, deliveryPartner, status: 'Dispatched' }, { new: true }).exec();
    if (data) {
      await addJob(emailQueue, 'order-shipped', { to: data.email, subject: 'Your Order has been shipped', order: data.toObject() });
    }
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Tracking updated' : 'Not found', !!data, data || undefined));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const updateOrderDelivered = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { deliveredDate, id, status } = req.body;
    const data = await Order.findOneAndUpdate({ _id: id }, { deliveredDate, status }, { new: true }).exec();
    if (data) {
      await addJob(emailQueue, 'order-delivered', { to: data.email, subject: 'Your Order has been delivered', order: data.toObject() });
    }
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Delivery date updated' : 'Not found', !!data, data || undefined));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const getOrdersByEmail = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const emailParam = req.params.email;
    if (!emailParam) { res.status(400).json(commonResponse('Email required', false)); return; }

    let filter: Record<string, unknown>;
    if (req.userRole === 'admin') {
      filter = { email: emailParam };
    } else if (req.user) {
      const userDoc = await User.findById(req.user).select('email_address').lean().exec();
      if (!userDoc) { res.status(401).json(commonResponse('Unauthorized', false)); return; }
      filter = { $or: [{ user: req.user }, { email: userDoc.email_address }] };
    } else {
      res.status(403).json(commonResponse('Forbidden', false)); return;
    }

    const orders = await Order.find(filter).populate('items.product').lean().exec();
    await attachSignedImagesToOrders(orders as any, IMAGE_SIGN_OPTIONS);
    res.status(orders.length > 0 ? 200 : 404).json(orders.length > 0
      ? { success: true, message: 'Orders found', data: orders }
      : { success: false, message: 'No orders found' });
  } catch (error) { res.status(500).json({ success: false, message: 'Error' }); }
};

export const latestOrderByEmail = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const email = req.params.email || req.query.email;
    let filter: Record<string, unknown>;
    if (req.userRole === 'admin') {
      if (!email) { res.status(400).json({ success: false, message: 'Email required' }); return; }
      filter = { email: String(email).toLowerCase() };
    } else if (req.user) {
      const userDoc = await User.findById(req.user).select('email_address').lean().exec();
      if (!userDoc?.email_address) { res.status(401).json(commonResponse('Unauthorized', false)); return; }
      filter = { $or: [{ user: req.user }, { email: userDoc.email_address }] };
    } else { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

    const order = await Order.findOne(filter).sort({ createdAt: -1 }).populate('items.product').lean().exec();
    if (order) await attachSignedImagesToOrders([order] as any, IMAGE_SIGN_OPTIONS);
    res.status(order ? 200 : 404).json(order
      ? { success: true, message: 'Latest order found', data: order }
      : { success: false, message: 'No orders' });
  } catch (error) { res.status(500).json({ success: false, message: 'Error' }); }
};

export const updateUtrNumber = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { _id, utrNumber } = req.body;
    if (!utrNumber) { res.status(400).json(commonResponse('UTR required', false)); return; }
    const order = await Order.findById(_id).exec();
    if (!order) { res.status(404).json(commonResponse('Not found', false)); return; }
    if (order.user?.toString() !== req.user && req.userRole !== 'admin') { res.status(403).json(commonResponse('Forbidden', false)); return; }
    if (order.paymentStatus === 'Payment Verified') { res.status(400).json(commonResponse('Already verified', false)); return; }

    const nextPaymentStatus = resolvePaymentStatus(order.paymentStatus, 'Payment Processed');
    const data = await Order.findOneAndUpdate(
      { _id },
      { utrNumber, paymentStatus: nextPaymentStatus, status: deriveOrderStatus(order.status, nextPaymentStatus), paymentProvider: 'utr', paymentDate: order.paymentDate || new Date() },
      { new: true }
    ).exec();

    await addJob(emailQueue, 'payment-utr-submitted', { to: null, subject: 'UTR submitted', order: data });
    res.status(200).json(commonResponse('UTR updated', true, data));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const updatePaymentStatus = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { _id, paymentStatus, paymentProvider, razorpayPaymentId, razorpayOrderId, razorpaySignature, guestToken, error: paymentError } = req.body;
    if (!_id) { res.status(400).json(commonResponse('Order ID required', false)); return; }
    const normalized = normalizePaymentStatus(paymentStatus);
    if (!normalized) { res.status(400).json(commonResponse('Invalid status', false)); return; }

    const order = await Order.findById(_id).exec();
    if (!order) { res.status(404).json(commonResponse('Not found', false)); return; }
    if (order.user?.toString() !== req.user && req.userRole !== 'admin') { res.status(403).json(commonResponse('Forbidden', false)); return; }

    if (normalized === 'Payment Verified') {
      await verifyRazorpayPayment({ razorpayPaymentId, razorpayOrderId, razorpaySignature }, order.toObject());
    }

    const requestedVerification = normalized === 'Payment Verified';
    const nextPaymentStatus = requestedVerification && order.paymentStatus !== 'Payment Verified'
      ? 'Payment Processed'
      : resolvePaymentStatus(order.paymentStatus, normalized);

    const update: Record<string, unknown> = {
      paymentStatus: nextPaymentStatus,
      status: deriveOrderStatus(order.status, nextPaymentStatus),
      paymentProvider: paymentProvider || 'razorpay',
      ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
      ...(razorpayOrderId ? { razorpayOrderId } : {}),
      ...(razorpaySignature ? { razorpaySignature } : {}),
    };
    if (['Payment Processed', 'Payment Verified'].includes(nextPaymentStatus)) {
      update.paymentDate = order.paymentDate || new Date();
    }
    if (nextPaymentStatus === 'Payment Failed') {
      update.paymentFailedAt = new Date();
      update.paymentFailureReason = paymentError?.description || paymentError?.reason || 'Payment failed';
    }

    const data = await Order.findOneAndUpdate({ _id }, update, { new: true }).exec();

    if (requestedVerification && data && data.paymentStatus !== 'Payment Verified') {
      await queuePaymentFinalization(data._id.toString());
    } else if (nextPaymentStatus === 'Payment Failed') {
      await addJob(emailQueue, 'payment-failed', { to: data?.email, subject: 'Payment Failed', order: data });
    }

    res.status(200).json(commonResponse(requestedVerification ? 'Payment verification queued' : 'Payment updated', true, data));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error';
    res.status(400).json(commonResponse(message, false));
  }
};

export const searchOrder = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { orderId, name } = req.query;
    const filter: Record<string, unknown> = {};
    if (orderId) filter.orderId = { $regex: orderId, $options: 'i' };
    if (name) filter.name = { $regex: name, $options: 'i' };
    const data = await Order.find(filter).sort({ createdAt: -1 }).lean().exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Orders fetched' : 'No orders', data.length > 0, data));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const countOrders = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await Order.countDocuments().exec();
    res.status(200).json(commonResponse('Count', true, data));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const countOrderStatus = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const counts = await Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).exec();
    const map: Record<string, number> = {};
    counts.forEach((c: any) => { map[c._id] = c.count; });
    res.status(200).json({
      success: true, message: 'Counts',
      data: {
        placedCount: map['placed'] || 0,
        paymentDoneCount: map['Payment Done'] || 0,
        paymentVerifiedCount: map['Payment Verified'] || 0,
        dispatchedCount: map['Dispatched'] || 0,
        deliveredCount: map['Delivered'] || 0,
      },
    });
  } catch (error) { res.status(500).json({ success: false, message: 'Error' }); }
};

export const createPayment = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { _id, amount } = req.body;
    let amountInRupees: number;
    let receipt: string;

    if (_id) {
      const order = await Order.findById(_id).exec();
      if (!order) { res.status(404).json(commonResponse('Order not found', false)); return; }
      if (order.user?.toString() !== req.user && req.userRole !== 'admin') { res.status(403).json(commonResponse('Forbidden', false)); return; }
      amountInRupees = Number(order.totalOrderValue);
      receipt = `rcpt_${order.orderId}`;
    } else {
      amountInRupees = Number(amount);
      receipt = `rcpt_${Date.now()}`;
    }

    if (!Number.isFinite(amountInRupees) || amountInRupees <= 0) { res.status(400).json(commonResponse('Invalid amount', false)); return; }

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amountInRupees * 100),
      currency: 'INR',
      receipt,
      notes: _id ? { orderId: String(_id) } : undefined,
    });

    if (_id && razorpayOrder.id) {
      await Order.findByIdAndUpdate(_id, { razorpayOrderId: razorpayOrder.id, paymentProvider: 'razorpay' }).exec();
    }

    res.status(201).json(commonResponse('Razorpay order created', true, razorpayOrder));
  } catch (error) { res.status(500).json(commonResponse('Error creating payment', false)); }
};

export const razorpayWebhook = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    if (!config.razorpay.webhookSecret) {
      res.status(503).json({ status: 'webhook not configured' }); return;
    }

    const signature = req.headers['x-razorpay-signature'] as string;
    if (!signature) { res.status(400).json({ status: 'missing signature' }); return; }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    const expected = crypto.createHmac('sha256', config.razorpay.webhookSecret).update(rawBody).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      res.status(400).json({ status: 'invalid signature' }); return;
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    const event = payload?.event;
    const actionable = new Set(['payment.captured', 'payment.authorized', 'order.paid']);
    if (!actionable.has(event)) { res.status(200).json({ status: 'ignored', event }); return; }

    const paymentEntity = payload?.payload?.payment?.entity;
    const orderEntity = payload?.payload?.order?.entity;
    const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id;
    const razorpayPaymentId = paymentEntity?.id;
    const notesOrderId = paymentEntity?.notes?.orderId || orderEntity?.notes?.orderId;
    const capturedAmount = Number(paymentEntity?.amount ?? orderEntity?.amount);

    let order = razorpayOrderId ? await Order.findOne({ razorpayOrderId }).exec() : null;
    if (!order && notesOrderId) order = await Order.findById(notesOrderId).exec();
    if (!order && razorpayPaymentId) order = await Order.findOne({ razorpayPaymentId }).exec();

    if (!order) { res.status(200).json({ status: 'order not found' }); return; }

    const expectedAmount = Math.round(Number(order.totalOrderValue || 0) * 100);
    if (capturedAmount !== expectedAmount) { res.status(200).json({ status: 'amount mismatch' }); return; }

    if (order.paymentStatus === 'Payment Verified') { res.status(200).json({ status: 'ok', verified: false }); return; }

    const updated = await Order.findOneAndUpdate(
      { _id: order._id },
      {
        paymentStatus: 'Payment Processed',
        status: 'Payment Done',
        paymentProvider: 'razorpay',
        paymentReference: razorpayPaymentId,
        razorpayPaymentId,
        razorpayOrderId,
        paymentDate: order.paymentDate || new Date(),
      },
      { new: true }
    ).exec();

    if (updated) {
      await queuePaymentFinalization(updated._id.toString());
    }

    res.status(200).json({ status: 'ok', verified: true, queued: Boolean(updated) });
  } catch (error) {
    logger.error('Webhook error', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json({ status: 'error' });
  }
};

export const markPaymentAbandoned = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { _id } = req.body;
    if (!_id) { res.status(400).json(commonResponse('Order ID required', false)); return; }
    const data = await Order.findOneAndUpdate({ _id }, { paymentStatus: 'Payment Abandoned' }, { new: true }).exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Marked abandoned' : 'Not found', !!data, data || undefined));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const markPaymentFailed = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { _id, error: paymentError } = req.body;
    if (!_id) { res.status(400).json(commonResponse('Order ID required', false)); return; }
    const data = await Order.findOneAndUpdate(
      { _id },
      { paymentStatus: 'Payment Failed', paymentFailedAt: new Date(), paymentFailureReason: paymentError?.description || paymentError?.reason || 'Payment failed' },
      { new: true }
    ).exec();
    if (data) {
      await addJob(emailQueue, 'payment-failed', { to: data.email, subject: 'Payment Failed', order: data });
    }
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Marked failed' : 'Not found', !!data, data || undefined));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const cancelUnpaidOrder = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { _id } = req.body;
    const data = await Order.findOneAndUpdate({ _id, user: req.user, paymentStatus: 'Not Paid' }, { status: 'Cancelled', paymentStatus: 'Cancelled' }, { new: true }).exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Order cancelled' : 'Not found or already paid', !!data, data || undefined));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

const stockRollback = async (stockItems: IStockItem[]): Promise<void> => {
  for (const stockItem of stockItems) {
    await Product.updateOne(
      { _id: stockItem.productId, 'priceList.number': stockItem.packSize },
      { $inc: { 'priceList.$.stock_quantity': stockItem.quantity } }
    );
  }
};

export const cleanupAbandonedOrders = async (): Promise<{ cleaned: number; message: string }> => {
  try {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const abandonedOrders = await Order.find({
      paymentStatus: { $in: ['Not Paid', 'Payment Abandoned', 'Payment Failed'] },
      status: 'placed',
      createdAt: { $lt: fifteenMinutesAgo },
    }).exec();

    let cleanedCount = 0;
    for (const order of abandonedOrders) {
      if (order.stockReduced) {
        const stockItems = toStockItems(order.items as unknown as Array<Record<string, unknown>>);
        await stockRollback(stockItems);
      }
      await Order.findByIdAndUpdate(order._id, {
        status: 'Cancelled',
        paymentStatus: 'Expired',
        ...(order.stockReduced ? { stockReduced: false } : {}),
      }).exec();
      cleanedCount++;
    }

    return { cleaned: cleanedCount, message: `Cleaned ${cleanedCount} abandoned orders` };
  } catch (error) {
    return { cleaned: 0, message: error instanceof Error ? error.message : 'Unknown error' };
  }
};
