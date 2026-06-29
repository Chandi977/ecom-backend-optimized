/**
 * Forward migration (Phase 3) — backfills the ProductSpecification sidecar's
 * dynamic `attributes` map from the existing flat spec fields.
 *
 *   npm run build && npm run migrate:spec-attributes
 *   # or, without building:  npx ts-node src/scripts/migrate-spec-attributes.ts
 *
 * ADDITIVE + idempotent: flat spec fields are KEPT (dual-read until the Phase 5
 * cutover); a key already present in `attributes` is never overwritten, so
 * re-running is a no-op. Numeric specs are stored as Numbers so range filters on
 * `attributes.<key>` keep using the `attributes.$**` wildcard index on the
 * sidecar. Nothing is removed.
 *
 * Operates on the `productspecifications` collection (the home of `attributes`).
 * Run AFTER deploying the Phase 3 code; then `npm run sync:indexes` if the
 * wildcard index is not yet built.
 *
 * NOTE: written with the native driver — dotted `attributes.<key>` $sets create
 * the sub-document that the Mongoose `Map` schema reads back transparently.
 */
import mongoose from 'mongoose';
import { DBconnection } from '../database';
import { logger } from '../utils/logger';

// Mirrors SPEC_FIELD_KEYS in modules/product/product-catalog.service.ts.
const SPEC_FIELD_KEYS = [
  'length', 'width', 'height', 'length_inch', 'length_mm', 'breadth_inch',
  'breadth_mm', 'height_inch', 'height_mm', 'size_inch', 'size_mm', 'flap_mm',
  'thickness', 'thickness_micron', 'gusset', 'print', 'label_in_roll',
  'core_size', 'pouch_weight', 'adhesive', 'material', 'color', 'colour',
  'weight', 'size',
];

const NUMERIC_SPEC_KEYS = new Set([
  'length', 'width', 'height', 'length_inch', 'length_mm', 'breadth_inch',
  'breadth_mm', 'height_inch', 'height_mm', 'flap_mm', 'thickness',
  'thickness_micron', 'gusset', 'core_size', 'pouch_weight', 'weight',
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
  const specs = db.collection('productspecifications');

  let scanned = 0;
  let updated = 0;

  const cursor = specs.find({});
  for await (const doc of cursor) {
    scanned += 1;
    const attributes = (doc.attributes ?? {}) as Record<string, unknown>;
    const set: Record<string, unknown> = {};

    for (const key of SPEC_FIELD_KEYS) {
      if (isEmpty(doc[key])) continue;          // no flat value to copy
      if (!isEmpty(attributes[key])) continue;  // already in attributes — keep it
      set[`attributes.${key}`] = coerce(key, doc[key]);
    }

    if (Object.keys(set).length) {
      await specs.updateOne({ _id: doc._id }, { $set: set });
      updated += 1;
    }
  }

  logger.info(`[migrate-spec-attributes] specifications scanned=${scanned} updated=${updated}`);
};

run()
  .then(async () => {
    logger.info('[migrate-spec-attributes] Completed');
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('[migrate-spec-attributes] Aborted', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    await mongoose.disconnect();
    process.exit(1);
  });
