import { Response } from 'express';
import { commonResponse } from '../../utils/response';
import { IAuthRequest } from '../../types';
import Order from '../order/order.model';
import Lead from '../lead/lead.model';
import Review from '../review/review.model';
import Product from '../product/product.model';
import Category from '../category/category.model';
import SubCategory from '../subcategory/subcategory.model';
import ContactForm from '../contact-form/contact-form.model';
import { logger } from '../../utils/logger';

// Order.status has no enum on the schema; these are the values the order flow
// actually writes (see order.controller: 'placed' -> 'Payment Done' ->
// 'Payment Verified' -> 'Dispatched' -> 'Delivered', plus 'Cancelled').
// "Pending" = accepted but not yet dispatched, delivered or cancelled.
const PENDING_ORDER_STATUSES = ['placed', 'Payment Done', 'Payment Verified'];

const startOfToday = (): Date => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

// GET /ops/dashboard — operational counters. Powers the `general` role's dashboard.
export const getOpsDashboard = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const today = startOfToday();

    const [
      ordersTotal,
      ordersPending,
      ordersToday,
      leadsTotal,
      leadsNew,
      leadsToday,
      reviewsPending,
      products,
      categories,
      subCategories,
      outOfStock,
      enquiriesTotal,
      enquiriesOpen,
    ] = await Promise.all([
      Order.countDocuments().exec(),
      Order.countDocuments({ status: { $in: PENDING_ORDER_STATUSES } }).exec(),
      Order.countDocuments({ createdAt: { $gte: today } }).exec(),
      Lead.countDocuments().exec(),
      Lead.countDocuments({ status: 'new' }).exec(),
      Lead.countDocuments({ createdAt: { $gte: today } }).exec(),
      Review.countDocuments({ status: 'pending' }).exec(),
      Product.countDocuments().exec(),
      Category.countDocuments().exec(),
      SubCategory.countDocuments().exec(),
      // Live stock lives per pack-size tier in Product.priceList[].stock_quantity
      // (see services/stock.service). A product is out of stock when NO tier has a
      // positive quantity — which also catches products with an empty priceList.
      Product.countDocuments({
        priceList: { $not: { $elemMatch: { stock_quantity: { $gt: 0 } } } },
      }).exec(),
      ContactForm.countDocuments().exec(),
      ContactForm.countDocuments({ status: 'open' }).exec(),
    ]);

    res.status(200).json(
      commonResponse('Ops dashboard fetched', true, {
        orders: { total: ordersTotal, pending: ordersPending, today: ordersToday },
        leads: { total: leadsTotal, new: leadsNew, today: leadsToday },
        reviews: { pending: reviewsPending },
        catalog: { products, categories, subCategories, outOfStock },
        // ContactForm is the only enquiry model with a status field, so it is the
        // source for open/total here. The customer-query and custom-packaging
        // enquiry forms have no status and are not counted.
        enquiries: { total: enquiriesTotal, open: enquiriesOpen },
      })
    );
  } catch (error) {
    logger.error('getOpsDashboard error', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal server error.', false));
  }
};
