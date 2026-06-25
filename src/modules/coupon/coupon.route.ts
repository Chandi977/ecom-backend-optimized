import { Router } from 'express';
import { createCoupon, getCoupon, countCoupon, getSingleCoupon, getCouponByCouponCode, updateCoupon, deleteCoupon } from './coupon.controller';
import { adminMiddleware, validate } from '../../middleware';
import { createCouponSchema, deleteCouponSchema, updateCouponSchema } from '../../utils/validators/zod-schemas';

const router = Router();

router.post('/coupon/create', adminMiddleware, validate(createCouponSchema), createCoupon);
router.post('/coupon/delete', adminMiddleware, validate(deleteCouponSchema), deleteCoupon);
router.get('/coupon/get/all', getCoupon);
router.get('/coupon/count', countCoupon);
router.put('/coupon/update', adminMiddleware, validate(updateCouponSchema), updateCoupon);
router.get('/coupon/get/:id', getSingleCoupon);
router.get('/coupon/get/code/:couponCode', getCouponByCouponCode);

export default router;
