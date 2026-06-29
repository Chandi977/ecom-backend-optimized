import mongoose from 'mongoose';
import { DBconnection } from '../database';
import Order from '../modules/order/order.model';

async function main() {
  console.log('Connecting to database...');
  await DBconnection();
  console.log('Database connected.');

  const latestOrder = await Order.findOne().sort({ createdAt: -1 }).lean().exec();
  if (!latestOrder) {
    console.log('No orders found in database.');
  } else {
    console.log('=== LATEST ORDER DETAILS ===');
    console.log('Order ID:', latestOrder.orderId);
    console.log('Status:', latestOrder.status);
    console.log('Payment Status:', latestOrder.paymentStatus);
    console.log('Total (subtotal):', latestOrder.total);
    console.log('Shipping Cost:', latestOrder.shippingCost);
    console.log('Total Order Value (total paid):', latestOrder.totalOrderValue);
    console.log('Taxable Amount:', latestOrder.taxableAmount);
    console.log('Items:');
    latestOrder.items.forEach((item, index) => {
      console.log(`  Item ${index + 1}:`);
      console.log(`    Product ID:`, item.product);
      console.log(`    Quantity:`, item.quantity);
      console.log(`    Price:`, item.price);
      console.log(`    Pack Size:`, item.packSize);
      console.log(`    GST Rate:`, item.gst);
      console.log(`    GST Amount:`, item.gstAmount);
      console.log(`    Total Price (totalPrice):`, item.totalPrice);
    });
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  mongoose.disconnect();
});
