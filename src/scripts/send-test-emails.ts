import mongoose from 'mongoose';
import { config } from '../config';
import { DBconnection } from '../database';
import { sendEmail } from '../utils/mailer';
import { Order } from '../models';
import {
  buildVerificationHtml,
  buildWelcomeHtml,
  buildForgotPasswordHtml,
  buildOrderHtml,
  buildBackInStockHtml,
} from '../workers/email-worker';

const TEST_EMAIL = process.env.TEST_EMAIL || config.smtp.user;

const getProductIdFromOrder = (order: Record<string, any>): string | null => {
  const product = order.items?.[0]?.product;
  if (!product) return null;
  if (typeof product === 'string') return product;
  if (product._id) return String(product._id);
  return String(product);
};

const run = async () => {
  if (!TEST_EMAIL) {
    throw new Error('Set TEST_EMAIL or SMTP_USER before sending test emails.');
  }

  console.log('Sending test emails to', TEST_EMAIL, '\n');
  await DBconnection();
  const latestOrder = await Order.findOne()
    .sort({ createdAt: -1 })
    .populate('items.product')
    .lean()
    .exec();

  // 1. Verification OTP
  console.log('1/9 Verification Email...');
  await sendEmail({
    to: TEST_EMAIL,
    subject: '[TEST] Email Verification OTP',
    html: (await buildVerificationHtml('ABC123')).html,
  });

  // 2. Welcome
  console.log('2/9 Welcome Email...');
  await sendEmail({
    to: TEST_EMAIL,
    subject: '[TEST] Welcome to Prem Packaging',
    html: (await buildWelcomeHtml('Charan')).html,
  });

  // 3. Forgot Password
  console.log('3/9 Forgot Password Email...');
  await sendEmail({
    to: TEST_EMAIL,
    subject: '[TEST] Password Reset OTP',
    html: (await buildForgotPasswordHtml('482736')).html,
  });

  // 4. Back in Stock
  console.log('4/9 Back in Stock Email...');
  const productId = latestOrder ? getProductIdFromOrder(latestOrder as Record<string, any>) : null;
  if (productId) {
    await sendEmail({
      to: TEST_EMAIL,
      subject: '[TEST] Product Back in Stock',
      html: (await buildBackInStockHtml(productId)).html,
    });
  } else {
    console.log('Skipped Back in Stock Email: no product found on latest order.');
  }

  if (!latestOrder) {
    console.log('Skipped order lifecycle emails: no orders found in database.');
    await mongoose.disconnect();
    return;
  }

  // 5. Order Placed
  console.log('5/9 Order Placed Email...');
  await sendEmail({
    to: TEST_EMAIL,
    subject: '[TEST] Your Order has been placed',
    html: (await buildOrderHtml('Your Order has been placed', latestOrder as Record<string, unknown>)).html,
  });

  // 6. Payment Received
  console.log('6/9 Payment Received Email...');
  await sendEmail({
    to: TEST_EMAIL,
    subject: '[TEST] Payment received',
    html: (await buildOrderHtml('Payment received', latestOrder as Record<string, unknown>)).html,
  });

  // 7. Order Shipped
  console.log('7/9 Order Shipped Email...');
  await sendEmail({
    to: TEST_EMAIL,
    subject: '[TEST] Your Order has been shipped',
    html: (await buildOrderHtml('Your Order has been shipped', latestOrder as Record<string, unknown>)).html,
  });

  // 8. Order Delivered
  console.log('8/9 Order Delivered Email...');
  await sendEmail({
    to: TEST_EMAIL,
    subject: '[TEST] Your Order has been delivered',
    html: (await buildOrderHtml('Your Order has been delivered', latestOrder as Record<string, unknown>)).html,
  });

  // 9. Payment Failed
  console.log('9/9 Payment Failed Email...');
  await sendEmail({
    to: TEST_EMAIL,
    subject: '[TEST] Payment Failed',
    html: (await buildOrderHtml('Payment Failed', latestOrder as Record<string, unknown>)).html,
  });

  console.log('\nAll 9 test emails sent to', TEST_EMAIL);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Failed:', err);
  mongoose.disconnect();
  process.exit(1);
});
