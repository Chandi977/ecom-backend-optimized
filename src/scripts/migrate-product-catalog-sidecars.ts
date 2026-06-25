/**
 * Phase-1 catalog sidecar migration.
 *
 * Copies existing flat Product fields into ProductSpecification, Pricing,
 * Inventory, ProductMedia, and SEO documents, then stores their ObjectIds on
 * Product. It does NOT delete or unset legacy Product fields; storefront,
 * admin, mobile, cart, order, and stock code can keep reading the old shape
 * while newer code starts consuming populated sidecars.
 *
 *   npm run build && npm run migrate:product-catalog-sidecars
 *   # or, without building: npx ts-node src/scripts/migrate-product-catalog-sidecars.ts
 *
 * Safe to re-run. Each sidecar is keyed by a unique `product` index and is
 * upserted, so reruns repair references instead of duplicating data.
 */
import mongoose from 'mongoose';
import Product from '../modules/product/product.model';
import { DBconnection } from '../database';
import { logger } from '../utils/logger';
import { syncProductCatalogRefs } from '../modules/product/product-catalog.service';

const run = async (): Promise<void> => {
  await DBconnection();

  let scanned = 0;
  let migrated = 0;
  let failed = 0;

  const cursor = Product.find().cursor();
  for await (const product of cursor) {
    scanned += 1;
    try {
      await syncProductCatalogRefs(product._id, product.toObject() as Record<string, unknown>);
      migrated += 1;
      if (migrated % 100 === 0) {
        logger.info('[product-catalog-sidecars] progress', { scanned, migrated, failed });
      }
    } catch (error) {
      failed += 1;
      logger.error('[product-catalog-sidecars] product failed', {
        productId: product._id?.toString(),
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  }

  logger.info('[product-catalog-sidecars] completed', { scanned, migrated, failed });
  if (failed > 0) throw new Error(`Migration completed with ${failed} failed products`);
};

run()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('[product-catalog-sidecars] aborted', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    await mongoose.disconnect();
    process.exit(1);
  });
