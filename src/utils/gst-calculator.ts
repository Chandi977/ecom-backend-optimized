import Product from '../modules/product/product.model';
import { IOrderItem, IProductGstResult } from '../types';
import { getDefaultGstRate, parseOptionalGstRate } from './gst-rate';

const DEFAULT_GST_RATE = getDefaultGstRate();
const ROUND_PRECISION = 2;

const readPopulatedGst = (value: unknown): number | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  // Must return undefined (not the default rate) when the populated doc has no
  // gst, so resolveProductGstRate's `??` chain falls through to the next source.
  return parseOptionalGstRate((value as Record<string, unknown>).gst);
};

const resolveProductGstRate = (product: Record<string, unknown>): number => {
  // Per-product GST wins. parseOptionalGstRate returns undefined when the
  // product has no own gst, so the `??` chain falls through to the
  // sub_category / category rates and finally the default.
  return (
    parseOptionalGstRate(product.gst) ??
    readPopulatedGst(product.sub_category) ??
    readPopulatedGst(product.category) ??
    DEFAULT_GST_RATE
  );
};

const roundTo = (value: number, decimals: number): number => {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

export const calculateOrderGST = async (
  items: Array<{
    product: string;
    quantity: number;
    price: number;
    packSize: number;
  }>,
  shippingCost: number
): Promise<IProductGstResult> => {
  const productIds = [...new Set(items.map((item) => item.product))];
  const products = await Product.find({ _id: { $in: productIds } })
    .select('gst category sub_category')
    .populate({ path: 'category', select: 'gst' })
    .populate({ path: 'sub_category', select: 'gst' })
    .lean()
    .exec();

  const gstMap = new Map<string, number>();
  products.forEach((p: Record<string, unknown>) => {
    gstMap.set(String(p._id), resolveProductGstRate(p));
  });

  const itemsWithGst: IOrderItem[] = [];
  let totalGst = 0;
  let taxableAmount = 0;

  for (const item of items) {
    const gstRate = gstMap.get(item.product) ?? DEFAULT_GST_RATE;
    const lineTotal = item.price * item.quantity;
    const gstAmount = roundTo((lineTotal * gstRate) / 100, ROUND_PRECISION);

    itemsWithGst.push({
      product: item.product,
      quantity: item.quantity,
      price: item.price,
      packSize: item.packSize,
      gst: gstRate,
      gstAmount,
      totalPrice: lineTotal,
    });

    totalGst += gstAmount;
    taxableAmount += lineTotal;
  }

  const shippingGst = roundTo((shippingCost * DEFAULT_GST_RATE) / 100, ROUND_PRECISION);
  totalGst += shippingGst;
  taxableAmount += shippingCost;

  const totalOrderValue = roundTo(taxableAmount + totalGst, ROUND_PRECISION);

  return { itemsWithGst, taxableAmount, totalOrderValue, totalGst };
};
