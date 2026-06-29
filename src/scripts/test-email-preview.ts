import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { DBconnection } from '../database';
import { Order } from '../models';
import {
  buildVerificationHtml,
  buildWelcomeHtml,
  buildForgotPasswordHtml,
  buildOrderHtml,
  buildBackInStockHtml
} from '../workers/email-worker';

const getProductIdFromOrder = (order: Record<string, any>): string | null => {
  const product = order.items?.[0]?.product;
  if (!product) return null;
  if (typeof product === 'string') return product;
  if (product._id) return String(product._id);
  return String(product);
};

async function main() {
  console.log('Generating updated email previews...');
  await DBconnection();
  const latestOrder = await Order.findOne()
    .sort({ createdAt: -1 })
    .populate('items.product')
    .lean()
    .exec();

  if (!latestOrder) {
    throw new Error('No orders found in database. Create an order before generating order email previews.');
  }

  const verificationHtml = (await buildVerificationHtml('889412')).html;
  const welcomeHtml = (await buildWelcomeHtml('Jane Doe')).html;
  const forgotPasswordHtml = (await buildForgotPasswordHtml('412856')).html;
  const productId = getProductIdFromOrder(latestOrder as Record<string, any>);
  const backInStockHtml = productId ? (await buildBackInStockHtml(productId)).html : '';

  const latestOrderHtml = (await buildOrderHtml('Latest Order Preview', latestOrder as Record<string, unknown>)).html;

  const outputDir = path.join(__dirname, '../../temp-email-previews');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(path.join(outputDir, '1_verification.html'), verificationHtml);
  fs.writeFileSync(path.join(outputDir, '2_welcome.html'), welcomeHtml);
  fs.writeFileSync(path.join(outputDir, '3_forgot_password.html'), forgotPasswordHtml);
  fs.writeFileSync(path.join(outputDir, '4_back_in_stock.html'), backInStockHtml);
  fs.writeFileSync(path.join(outputDir, '5_order_exclusive.html'), latestOrderHtml);
  fs.writeFileSync(path.join(outputDir, '6_order_inclusive.html'), latestOrderHtml);

  console.log('=== EMAIL PREVIEWS GENERATED SUCCESSFULLY ===');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  mongoose.disconnect();
});
