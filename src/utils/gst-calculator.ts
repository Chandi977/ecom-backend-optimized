import Product from '../modules/product/product.model';
import { IOrderItem, IProductGstResult } from '../types';
import { parseOptionalGstRate } from './gst-rate';

const SHIPPING_GST_RATE = 18;
const ROUND_PRECISION = 2;

export class MissingGstError extends Error {
  constructor(productId: string) {
    super(
      `GST rate not set for product ${productId}. ` +
      'Set a GST rate on the product, its sub-category, or its category.',
    );
    this.name = 'MissingGstError';
  }
}

const readPopulatedGst = (value: unknown): number | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  return parseOptionalGstRate((value as Record<string, unknown>).gst);
};

const resolveProductGstRate = (product: Record<string, unknown>): number | undefined => {
  return (
    parseOptionalGstRate(product.gst) ??
    readPopulatedGst(product.sub_category) ??
    readPopulatedGst(product.category)
  );
};

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const readPopulatedHsn = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  return readString((value as Record<string, unknown>).hsn_code);
};

// HSN follows the same product -> sub_category -> category cascade as GST so a
// line item always carries the most specific HSN code available for the invoice.
// Different sub-categories/products (e.g. within the Rollabel range) can declare
// their own HSN; the most specific one wins. Undefined when none is set anywhere.
const resolveProductHsnCode = (product: Record<string, unknown>): string | undefined =>
  readString(product.hsn_code) ??
  readPopulatedHsn(product.sub_category) ??
  readPopulatedHsn(product.category);

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
    .select('gst hsn_code category sub_category')
    .populate({ path: 'category', select: 'gst hsn_code' })
    .populate({ path: 'sub_category', select: 'gst hsn_code' })
    .lean()
    .exec();

  const gstMap = new Map<string, number | undefined>();
  const hsnMap = new Map<string, string | undefined>();
  products.forEach((p: Record<string, unknown>) => {
    gstMap.set(String(p._id), resolveProductGstRate(p));
    hsnMap.set(String(p._id), resolveProductHsnCode(p));
  });

  const itemsWithGst: IOrderItem[] = [];
  let totalGst = 0;
  let taxableAmount = 0;

  for (const item of items) {
    const gstRate = gstMap.get(item.product);
    if (gstRate === undefined) {
      throw new MissingGstError(item.product);
    }
    const hsnCode = hsnMap.get(item.product);
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
      ...(hsnCode ? { hsn_code: hsnCode } : {}),
    });

    totalGst += gstAmount;
    taxableAmount += lineTotal;
  }

  const shippingGst = roundTo((shippingCost * SHIPPING_GST_RATE) / 100, ROUND_PRECISION);
  totalGst += shippingGst;
  taxableAmount += shippingCost;

  const totalOrderValue = roundTo(taxableAmount + totalGst, ROUND_PRECISION);

  return { itemsWithGst, taxableAmount, totalOrderValue, totalGst };
};
