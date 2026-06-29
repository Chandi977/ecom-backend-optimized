import { Router } from 'express';
import {
  createOrder, allOrders, specificOrder, updateOrder, countOrders,
  getOrdersByEmail, latestOrderByEmail, updateUtrNumber, updatePaymentStatus,
  updateOrderShipping, updateOrderTracking, updateOrderDelivered,
  countOrderStatus, searchOrder, createPayment, markPaymentAbandoned,
  markPaymentFailed, cancelUnpaidOrder,
} from './order.controller';
import { adminMiddleware, authorize, userMiddleware, optionalAuth, validate } from '../../middleware';
import {
  createOrderSchema, updateOrderSchema, updateOrderShippingSchema,
  updateOrderTrackingSchema, updateOrderDeliveredSchema, updateUtrSchema,
  updatePaymentStatusSchema, createPaymentSchema, markPaymentAbandonedSchema,
  markPaymentFailedSchema, cancelUnpaidOrderSchema,
} from '../../utils/validators/zod-schemas';

const router = Router();

router.post('/order/create', userMiddleware, validate(createOrderSchema), createOrder);
router.get('/order/all/orders', adminMiddleware, allOrders);
router.get('/order/get/:id', userMiddleware, specificOrder);
router.put('/order/update', adminMiddleware, authorize('order:write'), validate(updateOrderSchema), updateOrder);
router.put('/order/update/shipping', adminMiddleware, authorize('order:write'), validate(updateOrderShippingSchema), updateOrderShipping);
router.put('/order/update/tracking', adminMiddleware, authorize('order:write'), validate(updateOrderTrackingSchema), updateOrderTracking);
router.put('/order/update/delivered', adminMiddleware, authorize('order:write'), validate(updateOrderDeliveredSchema), updateOrderDelivered);
router.get('/order/search', adminMiddleware, searchOrder);
router.get('/my/orders/:email', optionalAuth, getOrdersByEmail);
router.get('/order/count/status', adminMiddleware, countOrderStatus);
router.get('/order/count', adminMiddleware, countOrders);
router.get('/order/latest/:email', userMiddleware, latestOrderByEmail);
router.get('/order/latest', userMiddleware, latestOrderByEmail);
router.put('/order/update/utr', userMiddleware, validate(updateUtrSchema), updateUtrNumber);
router.put('/order/update/utr/guest', validate(updateUtrSchema), updateUtrNumber);
router.put('/order/update/payment/status', optionalAuth, validate(updatePaymentStatusSchema), updatePaymentStatus);
router.put('/order/payment/abandoned', optionalAuth, validate(markPaymentAbandonedSchema), markPaymentAbandoned);
router.put('/order/payment/failed', optionalAuth, validate(markPaymentFailedSchema), markPaymentFailed);
router.put('/order/mark-payment-failed', optionalAuth, validate(markPaymentFailedSchema), markPaymentFailed);
router.post('/order/cancel-unpaid', userMiddleware, validate(cancelUnpaidOrderSchema), cancelUnpaidOrder);
router.post('/order/create/payment', userMiddleware, validate(createPaymentSchema), createPayment);

export default router;
