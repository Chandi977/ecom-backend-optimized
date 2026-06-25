import { Router } from 'express';
import {
  AddtoCart, alterQuantity, getCart, getCartCount, updateProductTypeAllCoupon,
  removeFromCart, emptyCart, updateCart, updateShippingCoupon,
  updateAllDiscount, removeCoupon,
} from './cart.controller';
import { userMiddleware, validate } from '../../middleware';
import {
  addToCartSchema, alterQuantitySchema, removeFromCartSchema,
  emptyCartSchema, updateCartSchema, updateShippingCouponSchema,
  updateAllDiscountSchema, updateProductTypeAllCouponSchema,
  removeCouponSchema,
} from '../../utils/validators/zod-schemas';

const router = Router();

router.post('/AddtoCart', userMiddleware, validate(addToCartSchema), AddtoCart);
router.post('/alterQunatity', userMiddleware, validate(alterQuantitySchema), alterQuantity);
router.get('/cart/:id', userMiddleware, getCart);
router.get('/cart/count/:id', userMiddleware, getCartCount);
router.post('/removefromcart', userMiddleware, validate(removeFromCartSchema), removeFromCart);
router.post('/emptyCart', userMiddleware, validate(emptyCartSchema), emptyCart);
router.post('/updateCart', userMiddleware, validate(updateCartSchema), updateCart);
router.post('/updateShippingCoupon', userMiddleware, validate(updateShippingCouponSchema), updateShippingCoupon);
router.post('/updateAllDiscount', userMiddleware, validate(updateAllDiscountSchema), updateAllDiscount);
router.post('/update/coupon/all', userMiddleware, validate(updateProductTypeAllCouponSchema), updateProductTypeAllCoupon);
router.post('/remove/coupon', userMiddleware, validate(removeCouponSchema), removeCoupon);

export default router;
