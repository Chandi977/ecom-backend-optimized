/**
 * Sets up the admin category-section taxonomy requested for Store 2.0.
 *
 *   npm run setup:category-sections
 *   # or, without building: npx ts-node src/scripts/setup-category-sections.ts
 *
 * ADDITIVE + idempotent:
 * - creates/updates the top-level "Main" category
 * - creates/assigns Corrugated Box, Paper Bag, Poly Bag and Carry Bag as sub-categories of Main
 * - leaves the existing leaf Category records in place
 * - does NOT relink products, because storefront listing pages still filter by
 *   the existing category IDs and category-level spec schemas
 */
import mongoose from 'mongoose';
import slugify from 'slugify';
import { DBconnection } from '../database';
import { logger } from '../utils/logger';

type AnyDoc = Record<string, any>;

const MAIN_CATEGORY = {
  name: 'Main',
  category_id: '00',
};

const MAIN_SUBCATEGORIES = [
  { name: 'Corrugated Box', sub_category_id: '01' },
  { name: 'Paper Bag', sub_category_id: '02' },
  { name: 'Poly Bag', sub_category_id: '03' },
  { name: 'Carry Bag', sub_category_id: '04' },
];

const slugFor = (name: string): string => slugify(name);

const pickDefined = (doc: AnyDoc, keys: string[]): AnyDoc => {
  const out: AnyDoc = {};
  for (const key of keys) {
    if (doc?.[key] !== undefined && doc?.[key] !== null && doc?.[key] !== '') {
      out[key] = doc[key];
    }
  }
  return out;
};

const run = async (): Promise<void> => {
  await DBconnection();
  const db = mongoose.connection.db!;
  const categories = db.collection('categories');
  const subcategories = db.collection('subcategories');

  const now = new Date();
  const mainSlug = slugFor(MAIN_CATEGORY.name);

  const mainResult = await categories.findOneAndUpdate(
    { $or: [{ name: MAIN_CATEGORY.name }, { slug: mainSlug }] },
    {
      $set: {
        name: MAIN_CATEGORY.name,
        slug: mainSlug,
        category_id: MAIN_CATEGORY.category_id,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
        overview_fields: [],
        field_visibility: {},
        common_attributes: {},
        spec_schema: [],
      },
    },
    { upsert: true, returnDocument: 'after' },
  );

  const mainCategory = mainResult.value;
  if (!mainCategory?._id) {
    throw new Error('Unable to create or resolve Main category');
  }

  let created = 0;
  let reassigned = 0;
  let unchanged = 0;

  for (const child of MAIN_SUBCATEGORIES) {
    const childSlug = slugFor(child.name);
    const sourceCategory = await categories.findOne({
      _id: { $ne: mainCategory._id },
      $or: [{ name: child.name }, { slug: childSlug }],
    });
    const existingChild = await subcategories.findOne({
      $or: [{ name: child.name }, { slug: childSlug }],
    });

    const defaultsFromSource = pickDefined(sourceCategory || {}, [
      'gst',
      'hsn_code',
      'sac_code',
      'tax_category',
      'delivery_time',
      'common_attributes',
      'meta_title',
      'meta_description',
    ]);

    if (existingChild) {
      const alreadyInMain = String(existingChild.category || '') === String(mainCategory._id);
      await subcategories.updateOne(
        { _id: existingChild._id },
        {
          $set: {
            name: child.name,
            slug: childSlug,
            sub_category_id: child.sub_category_id,
            category: mainCategory._id,
            ...defaultsFromSource,
            updatedAt: now,
          },
        },
      );
      if (alreadyInMain) unchanged += 1;
      else reassigned += 1;
      continue;
    }

    await subcategories.insertOne({
      name: child.name,
      slug: childSlug,
      sub_category_id: child.sub_category_id,
      category: mainCategory._id,
      ...defaultsFromSource,
      createdAt: now,
      updatedAt: now,
      __v: 0,
    });
    created += 1;
  }

  logger.info('[setup-category-sections] Completed', {
    mainCategoryId: String(mainCategory._id),
    created,
    reassigned,
    unchanged,
    note: 'Existing leaf categories and product links were preserved.',
  });
};

run()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('[setup-category-sections] Aborted', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    await mongoose.disconnect();
    process.exit(1);
  });
