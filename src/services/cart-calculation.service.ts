import { calculateOrderGST } from '../utils/gst-calculator';
import { IProductGstResult } from '../types';

const SHIPPING_GST_RATE = 18;

export interface CalculationItemInput {
  product: string;
  quantity: number;
  price: number;
  packSize: number;
  discountPrice?: number;
}

export interface CouponInput {
  type?: 'all' | 'shipping' | 'both' | 'product';
  couponType?: string;
  code: string;
  discountPercentage?: number;
  discountPrice?: number;
  maxDiscountCap?: number;
  shippingDiscountPrice?: number;
  shippingDiscountPercentage?: number;
  totalDiscountPrice?: number;
  totalDiscountPercentage?: number;
  productDiscounts?: Array<{ product: string; discountPrice: number }>;
}

export interface CartCalculationResult {
  items: Array<{
    product: string;
    quantity: number;
    price: number;
    packSize: number;
    gst: number;
    gstAmount: number;
    totalPrice: number;
    hsn_code?: string;
  }>;
  subtotal: number;
  productSavings: number;
  discountedSubtotal: number;
  shippingCost: number;
  shippingSavings: number;
  effectiveShippingCost: number;
  taxableAmount: number;
  gstTotal: number;
  gstBreakdown: {
    productGst: number;
    shippingGst: number;
  };
  totalOrderValue: number;
  appliedCoupon: {
    code: string;
    type: string;
    totalSavings: number;
  } | null;
}

export const calculateCartTotals = async (
  items: CalculationItemInput[],
  shippingCost: number,
  coupon?: CouponInput | null,
): Promise<CartCalculationResult> => {
  // Normalize: accept either `type` or `couponType` (web sends couponType).
  if (coupon && !coupon.type && coupon.couponType) {
    coupon.type = coupon.couponType as CouponInput['type'];
  }

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  let productSavings = 0;
  let shippingSavings = 0;
  let discountedSubtotal = subtotal;
  let effectiveShippingCost = shippingCost;
  let appliedCoupon: CartCalculationResult['appliedCoupon'] = null;

  const effectiveItems = items.map((item) => {
    let effectivePrice = item.price;
    if (coupon?.type === 'product') {
      const pd = coupon.productDiscounts?.find((d) => d.product === item.product);
      if (pd && pd.discountPrice >= 0 && pd.discountPrice < item.price) {
        effectivePrice = pd.discountPrice;
      }
    }
    const savings = (item.price - effectivePrice) * item.quantity;
    productSavings += savings;
    return { ...item, effectivePrice };
  });

  discountedSubtotal = effectiveItems.reduce((sum, item) => sum + item.effectivePrice * item.quantity, 0);

  if (coupon) {
    if (coupon.type === 'all') {
      let totalDiscountAmount = 0;
      if (coupon.discountPercentage && coupon.discountPercentage > 0) {
        const raw = (discountedSubtotal * coupon.discountPercentage) / 100;
        totalDiscountAmount = coupon.maxDiscountCap && raw > coupon.maxDiscountCap
          ? coupon.maxDiscountCap : raw;
      } else if (coupon.discountPrice && coupon.discountPrice > 0) {
        totalDiscountAmount = Math.min(coupon.discountPrice, discountedSubtotal);
      }
      const scale = discountedSubtotal > 0 ? (discountedSubtotal - totalDiscountAmount) / discountedSubtotal : 1;
      productSavings = totalDiscountAmount;
      discountedSubtotal = discountedSubtotal - totalDiscountAmount;
      for (const item of effectiveItems) {
        item.effectivePrice = item.effectivePrice * scale;
      }
      appliedCoupon = { code: coupon.code, type: 'all', totalSavings: totalDiscountAmount };
    } else if (coupon.type === 'shipping') {
      if (coupon.shippingDiscountPrice && coupon.shippingDiscountPrice > 0) {
        shippingSavings = Math.min(coupon.shippingDiscountPrice, shippingCost);
      } else if (coupon.shippingDiscountPercentage && coupon.shippingDiscountPercentage > 0) {
        const raw = (shippingCost * coupon.shippingDiscountPercentage) / 100;
        shippingSavings = coupon.maxDiscountCap && raw > coupon.maxDiscountCap
          ? Math.min(coupon.maxDiscountCap, shippingCost) : Math.min(raw, shippingCost);
      }
      effectiveShippingCost = shippingCost - shippingSavings;
      appliedCoupon = { code: coupon.code, type: 'shipping', totalSavings: shippingSavings };
    } else if (coupon.type === 'both') {
      const totalBefore = discountedSubtotal + shippingCost;
      let totalSavings = 0;
      if (coupon.totalDiscountPercentage && coupon.totalDiscountPercentage > 0) {
        const raw = (totalBefore * coupon.totalDiscountPercentage) / 100;
        totalSavings = coupon.maxDiscountCap && raw > coupon.maxDiscountCap
          ? coupon.maxDiscountCap : raw;
      } else if (coupon.totalDiscountPrice && coupon.totalDiscountPrice > 0) {
        totalSavings = Math.min(coupon.totalDiscountPrice, totalBefore);
      }
      const ratio = totalBefore > 0 ? totalSavings / totalBefore : 0;
      productSavings = discountedSubtotal * ratio;
      shippingSavings = shippingCost * ratio;
      discountedSubtotal = discountedSubtotal - productSavings;
      effectiveShippingCost = shippingCost - shippingSavings;
      const scale = 1 - ratio;
      for (const item of effectiveItems) {
        item.effectivePrice = item.effectivePrice * scale;
      }
      appliedCoupon = { code: coupon.code, type: 'both', totalSavings };
    } else if (coupon.type === 'product') {
      appliedCoupon = { code: coupon.code, type: 'product', totalSavings: productSavings };
    }
  }

  const gstResult: IProductGstResult = await calculateOrderGST(
    effectiveItems.map((item) => ({
      product: item.product,
      quantity: item.quantity,
      price: item.effectivePrice,
      packSize: item.packSize,
    })),
    effectiveShippingCost,
  );

  const shippingGst = Math.round(effectiveShippingCost * SHIPPING_GST_RATE * 100) / 10000;
  const productGst = Math.round((gstResult.totalGst - shippingGst) * 100) / 100;

  return {
    items: gstResult.itemsWithGst.map((item) => ({
      product: item.product,
      quantity: item.quantity,
      price: item.price,
      packSize: item.packSize,
      gst: item.gst ?? SHIPPING_GST_RATE,
      gstAmount: item.gstAmount ?? 0,
      totalPrice: item.totalPrice ?? item.price * item.quantity,
      hsn_code: item.hsn_code,
    })),
    subtotal: Math.round(subtotal * 100) / 100,
    productSavings: Math.round(productSavings * 100) / 100,
    discountedSubtotal: Math.round(discountedSubtotal * 100) / 100,
    shippingCost: Math.round(shippingCost * 100) / 100,
    shippingSavings: Math.round(shippingSavings * 100) / 100,
    effectiveShippingCost: Math.round(effectiveShippingCost * 100) / 100,
    taxableAmount: Math.round(gstResult.taxableAmount * 100) / 100,
    gstTotal: Math.round(gstResult.totalGst * 100) / 100,
    gstBreakdown: {
      productGst,
      shippingGst,
    },
    totalOrderValue: Math.round(gstResult.totalOrderValue * 100) / 100,
    appliedCoupon,
  };
};
