/**
 * Reverse migration — undoes the Product schema refactor.
 *
 * Moves spec values out of `Product.attributes` back onto the flat top-level
 * fields (core_size, length_mm, gusset, thickness_micron, …), unsets
 * `attributes`, drops the `attributes.$**` wildcard index, and drops the
 * now-unused `attributedefinitions` collection.
 *
 *   npm run build && npm run migrate:revert-product-attributes
 *   # or, without building:  npx ts-node src/scripts/revert-product-attributes.ts
 *
 * Safe to re-run (idempotent): products with no `attributes` field are skipped,
 * existing flat values are never clobbered, and the index / collection drops are
 * no-ops once already gone.
 *
 * NOTE: read/written with the native driver — `attributes` no longer exists on
 * the Mongoose schema, so a model query would silently drop it.
 *
 * Run AFTER deploying the reverted code, then run `npm run sync:indexes` to
 * (re)build the per-dimension catalog indexes declared on the product model.
 */
import mongoose from 'mongoose';
import { DBconnection } from '../database';
import { logger } from '../utils/logger';

// Spec keys the refactor moved into `attributes`; flat again after the revert.
const SPEC_ATTRIBUTE_KEYS = [
  'length', 'width', 'height', 'length_inch', 'length_mm', 'breadth_inch',
  'breadth_mm', 'height_inch', 'height_mm', 'size_inch', 'size_mm', 'flap_mm',
  'thickness', 'thickness_micron', 'gusset', 'print', 'label_in_roll',
  'core_size', 'pouch_weight', 'adhesive', 'material', 'color',
];

// Numeric specs are restored as Numbers so range filters keep working.
const NUMERIC_SPEC_KEYS = new Set([
  'length', 'width', 'height', 'length_inch', 'length_mm', 'breadth_inch',
  'breadth_mm', 'height_inch', 'height_mm', 'flap_mm', 'thickness',
  'thickness_micron', 'gusset', 'core_size', 'pouch_weight',
]);

const isEmpty = (value: unknown): boolean =>
  value === undefined || value === null || value === '';

const coerce = (key: string, value: unknown): unknown => {
  if (!NUMERIC_SPEC_KEYS.has(key)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
};

const run = async (): Promise<void> => {
  await DBconnection();
  const db = mongoose.connection.db!;
  const products = db.collection('products');

  let scanned = 0;
  let reverted = 0;

  // Only docs that still carry the Map need reversing (idempotent).
  const cursor = products.find({ attributes: { $exists: true } });
  for await (const doc of cursor) {
    scanned += 1;
    const attributes = (doc.attributes ?? {}) as Record<string, unknown>;
    const set: Record<string, unknown> = {};

    for (const key of SPEC_ATTRIBUTE_KEYS) {
      const value = attributes[key];
      if (isEmpty(value)) continue;
      if (!isEmpty(doc[key])) continue; // never clobber an existing flat value
      set[key] = coerce(key, value);
    }

    await products.updateOne(
      { _id: doc._id },
      {
        ...(Object.keys(set).length ? { $set: set } : {}),
        $unset: { attributes: '' },
      },
    );
    reverted += 1;
  }

  logger.info(`[revert-attributes] products scanned=${scanned} reverted=${reverted}`);

  // Drop the wildcard attribute index so sync:indexes can rebuild cleanly.
  try {
    const indexes = await products.indexes();
    const wildcard = indexes.find((idx: any) => idx.key && idx.key['attributes.$**'] !== undefined);
    if (wildcard?.name) {
      await products.dropIndex(wildcard.name);
      logger.info(`[revert-attributes] dropped index ${wildcard.name}`);
    }
  } catch (error) {
    logger.warn('[revert-attributes] wildcard index drop skipped', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
  }

  // Drop the now-unused AttributeDefinition collection.
  try {
    const collections = await db.listCollections({ name: 'attributedefinitions' }).toArray();
    if (collections.length) {
      await db.dropCollection('attributedefinitions');
      logger.info('[revert-attributes] dropped attributedefinitions collection');
    }
  } catch (error) {
    logger.warn('[revert-attributes] attributedefinitions drop skipped', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
  }
};

run()
  .then(async () => {
    logger.info('[revert-attributes] Completed');
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('[revert-attributes] Aborted', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    await mongoose.disconnect();
    process.exit(1);
  });
