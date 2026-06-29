import { Router } from 'express';
import { createCoupon, getCoupon, countCoupon, getSingleCoupon, getCouponByCouponCode, updateCoupon, deleteCoupon } from './coupon.controller';
import { adminMiddleware, authorize, validate } from '../../middleware';
import { createCouponSchema, deleteCouponSchema, updateCouponSchema } from '../../utils/validators/zod-schemas';

const router = Router();

router.post('/coupon/create', adminMiddleware, authorize('coupon:write'), validate(createCouponSchema), createCoupon);
router.post('/coupon/delete', adminMiddleware, authorize('coupon:write'), validate(deleteCouponSchema), deleteCoupon);
router.get('/coupon/get/all', getCoupon);
router.get('/coupon/count', countCoupon);
router.put('/coupon/update', adminMiddleware, authorize('coupon:write'), validate(updateCouponSchema), updateCoupon);
router.get('/coupon/get/:id', getSingleCoupon);
router.get('/coupon/get/code/:couponCode', getCouponByCouponCode);

export default router;
