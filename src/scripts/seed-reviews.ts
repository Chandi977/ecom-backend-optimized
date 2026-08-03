import mongoose from 'mongoose';
import { DBconnection } from '../database';
import Review from '../modules/review/review.model';
import Product from '../modules/product/product.model';
import User from '../modules/auth/auth.model';

const IndianNames = [
  'Rajesh Kumar', 'Priya Sharma', 'Amit Patel', 'Sneha Gupta', 'Vikram Singh',
  'Anjali Desai', 'Suresh Reddy', 'Meena Iyer', 'Arjun Nair', 'Deepa Menon',
  'Ravi Verma', 'Pooja Joshi', 'Sanjay Mishra', 'Kavita Rao', 'Manoj Tiwari',
  'Nisha Bhatt', 'Arun Chopra', 'Divya Kulkarni', 'Vivek Pandey', 'Shruti Kulkarni',
  'Rahul Bose', 'Sunita Kaur', 'Kiran Bapat', 'Aditi Pandit', 'Sachin Jadhav',
];

const reviewTitles = [
  'Excellent quality packaging', 'Good value for money', 'Fast delivery',
  'Sturdy and reliable', 'Perfect for our needs', 'Slightly thin but okay',
  'Great for bulk orders', 'Exactly as described', 'Highly recommended',
  'Could be better', 'Average quality', 'Exceeded expectations',
  'Best in this price range', 'Durable and well-made', 'Good packaging material',
];

const reviewComments = [
  'We have been using these packaging materials for our warehouse and they perform well consistently. The material quality is top-notch.',
  'Ordered in bulk for our e-commerce fulfillment center. The products arrived on time and the quality matched the description.',
  'Great for shipping our food products. The tamper-evident feature is a big plus for our customers.',
  'We switched from our previous supplier and the quality difference is noticeable. Will continue ordering.',
  'The thickness is just right for our lightweight products. Good adhesion and seal strength.',
  'Used these for our festive season rush. Held up well even with heavy items inside.',
  'The tape rolls are durable and the adhesive sticks well to corrugated boxes. Happy with the purchase.',
  'Perfect size for our small product shipments. The material feels premium and professional.',
  'Good for our daily packaging needs. We go through about 500 units a day and these work great.',
  'Slightly thinner than expected but still does the job. Price point makes it worth it.',
  'The labels printed clearly on our thermal printer. No issues with smudging or peeling.',
  'We use these for international shipments. The quality gives us confidence that products arrive safely.',
  'Bulk order was delivered ahead of schedule. Quality control seems good across the batch.',
  'The stretch wrap is strong and stretches well without breaking. Good for palletizing.',
  'These corrugated boxes are sturdy enough for our electronics shipments. Double-wall construction is solid.',
  'The bubble wrap provides excellent cushioning. We have had zero damage claims since switching.',
  'Good quality poly bags. The zip-lock feature works reliably. Customers appreciate the resealable option.',
  'The tape dispenser we ordered is smooth and easy to use. Our packing line efficiency improved.',
  'Impressed with the print quality on our custom branded tape. Logo looks sharp and professional.',
  'We use these thermal rolls for our POS systems. Clean printing and no jams so far.',
  'The vacuum bags work perfectly for our food preservation needs. Strong seal every time.',
  'Ordered the stretch film for our warehouse. It wraps tightly and holds pallets securely during transit.',
  'The masking tape is perfect for our painting business. Clean removal without surface damage.',
  'These zip ties are strong and the locking mechanism is reliable. Use them for cable management.',
  'Good quality strapping bands. They hold heavy loads without snapping. Essential for our dispatch.',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomRating(): number {
  const weights = [1, 1, 2, 3, 5]; // weighted towards higher ratings
  return weights[Math.floor(Math.random() * weights.length)];
}

function randomDate(daysBack: number): Date {
  const now = Date.now();
  const offset = Math.floor(Math.random() * daysBack * 24 * 60 * 60 * 1000);
  return new Date(now - offset);
}

const run = async () => {
  await DBconnection();

  const products = await Product.find({}).select('_id name').lean().exec();
  const users = await User.find({ role: { $ne: 'admin' } }).select('_id first_name last_name').lean().exec();

  if (products.length === 0) {
    console.log('No products found. Add products first.');
    await mongoose.disconnect();
    process.exit(0);
  }

  if (users.length === 0) {
    console.log('No users found. Add users first.');
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(`Found ${products.length} products and ${users.length} users`);

  let created = 0;
  let skipped = 0;

  for (const product of products) {
    // 3–7 reviews per product
    const reviewCount = 3 + Math.floor(Math.random() * 5);
    const shuffledUsers = [...users].sort(() => Math.random() - 0.5).slice(0, reviewCount);

    for (const user of shuffledUsers) {
      const existing = await Review.findOne({ user: user._id, product: product._id }).lean().exec();
      if (existing) {
        skipped++;
        continue;
      }

      const reviewerName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || 'Customer';
      const rating = randomRating();
      const createdAt = randomDate(90);

      await Review.create({
        product: product._id,
        user: user._id,
        rating,
        title: pick(reviewTitles),
        comment: pick(reviewComments),
        reviewerName,
        verifiedPurchase: true,
        status: 'approved',
        moderatedBy: 'admin',
        moderatedAt: createdAt,
        helpfulCount: Math.floor(Math.random() * 12),
        createdAt,
        updatedAt: createdAt,
      });

      created++;
    }

    // Recompute rating for this product
    const [agg] = await Review.aggregate<{ avg: number; count: number }>([
      { $match: { product: product._id, status: 'approved' } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    const count = agg?.count || 0;
    const average = count > 0 ? Math.round((agg.avg || 0) * 10) / 10 : 0;
    await Product.updateOne(
      { _id: product._id },
      { $set: { ratingAverage: average, ratingCount: count } },
    ).exec();

    console.log(`✓ ${product.name} — ${count} reviews (avg: ${average})`);
  }

  console.log(`\nDone. Created ${created} reviews, skipped ${skipped} duplicates.`);
};

run()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await mongoose.disconnect();
    process.exit(1);
  });
