import Order from '../modules/order/order.model';
import Product from '../modules/product/product.model';
import { logger } from '../utils/logger';

export interface IStockItem {
  productId: string;
  packSize: number;
  quantity: number;
}

interface IStockAdjustmentResult {
  orderId: string;
  adjusted: boolean;
  items: IStockItem[];
}

export const toStockItems = (items: Array<Record<string, unknown>>): IStockItem[] => {
  const stockMap = new Map<string, IStockItem>();

  items.forEach((item) => {
    const productRef = item.product;
    const productId = (productRef as Record<string, unknown>)?._id?.toString() || productRef?.toString();
    const packSize = Number(item.packSize);
    const quantity = Number(item.quantity);

    if (!productId || !Number.isFinite(packSize) || !Number.isFinite(quantity) || quantity <= 0) return;

    const key = `${productId}:${packSize}`;
    const existing = stockMap.get(key) || { productId, packSize, quantity: 0 };
    existing.quantity += quantity;
    stockMap.set(key, existing);
  });

  return Array.from(stockMap.values());
};

const incrementStock = async (items: IStockItem[], direction: 1 | -1): Promise<void> => {
  const applied: IStockItem[] = [];

  try {
    for (const item of items) {
      const filter = direction === -1
        ? { _id: item.productId, 'priceList.number': item.packSize, 'priceList.stock_quantity': { $gte: item.quantity } }
        : { _id: item.productId, 'priceList.number': item.packSize };

      const result = await Product.updateOne(
        filter,
        { $inc: { 'priceList.$.stock_quantity': direction * item.quantity } }
      ).exec();

      if (result.modifiedCount === 0) {
        throw new Error(`Unable to ${direction === -1 ? 'reduce' : 'restore'} stock for product ${item.productId} pack ${item.packSize}`);
      }

      applied.push(item);
    }
  } catch (error) {
    if (direction === -1 && applied.length > 0) {
      await incrementStock(applied, 1);
    }
    throw error;
  }
};

export const reduceStockForOrder = async (orderId: string): Promise<IStockAdjustmentResult> => {
  const order = await Order.findById(orderId).exec();
  if (!order) throw new Error(`Order not found: ${orderId}`);
  if (order.stockReduced) {
    return { orderId, adjusted: false, items: [] };
  }

  const items = toStockItems(order.items as unknown as Array<Record<string, unknown>>);
  if (items.length === 0) throw new Error(`Order has no stock-adjustable items: ${orderId}`);

  await incrementStock(items, -1);

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, stockReduced: false },
    { $set: { stockReduced: true } },
    { new: true }
  ).exec();

  if (!updated) {
    await incrementStock(items, 1);
    return { orderId, adjusted: false, items: [] };
  }

  logger.info('Order stock reduced', { orderId, items });
  return { orderId, adjusted: true, items };
};

export const restoreStockForOrder = async (orderId: string): Promise<IStockAdjustmentResult> => {
  const order = await Order.findById(orderId).exec();
  if (!order) throw new Error(`Order not found: ${orderId}`);
  if (!order.stockReduced) {
    return { orderId, adjusted: false, items: [] };
  }

  const items = toStockItems(order.items as unknown as Array<Record<string, unknown>>);
  if (items.length === 0) throw new Error(`Order has no stock-adjustable items: ${orderId}`);

  await incrementStock(items, 1);

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, stockReduced: true },
    { $set: { stockReduced: false } },
    { new: true }
  ).exec();

  if (!updated) {
    await incrementStock(items, -1);
    return { orderId, adjusted: false, items: [] };
  }

  logger.info('Order stock restored', { orderId, items });
  return { orderId, adjusted: true, items };
};
