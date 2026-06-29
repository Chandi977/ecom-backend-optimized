/**
 * Backfill migration — repairs the product -> category link.
 *
 *   npm run build && npm run migrate:product-category-link
 *   # or, without building:  npx ts-node src/scripts/migrate-product-category-link.ts
 *
 * Fills `Product.category` from its sub-category's parent for products that have a
 * `sub_category` but no `category`, so the GST / HSN / attribute inheritance chain
 * is complete for ALL existing products (matching the write-time `resolveCategoryLink`
 * behaviour). ADDITIVE + idempotent: only products missing a category are touched,
 * and a product whose sub-category has no parent is left unchanged. Nothing is removed.
 */
import mongoose from 'mongoose';
import { DBconnection } from '../database';
import { logger } from '../utils/logger';

const run = async (): Promise<void> => {
  await DBconnection();
  const db = mongoose.connection.db!;
  const products = db.collection('products');
  const subcategories = db.collection('subcategories');

  // Map every sub-category to its parent category.
  const subs = await subcategories.find({}, { projection: { category: 1 } }).toArray();
  const parentBySub = new Map<string, unknown>();
  for (const sub of subs) {
    if (sub.category) parentBySub.set(String(sub._id), sub.category);
  }

  let scanned = 0;
  let updated = 0;

  const cursor = products.find({
    sub_category: { $exists: true, $ne: null },
    $or: [{ category: { $exists: false } }, { category: null }],
  });
  for await (const doc of cursor) {
    scanned += 1;
    const parent = parentBySub.get(String(doc.sub_category));
    if (!parent) continue; // sub-category has no parent — leave as-is
    await products.updateOne({ _id: doc._id }, { $set: { category: parent } });
    updated += 1;
  }

  logger.info(`[migrate-product-category-link] products scanned=${scanned} relinked=${updated}`);
};

run()
  .then(async () => {
    logger.info('[migrate-product-category-link] Completed');
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('[migrate-product-category-link] Aborted', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    await mongoose.disconnect();
    process.exit(1);
  });
