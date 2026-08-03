import { Response } from 'express';
import { PipelineStage } from 'mongoose';
import { commonResponse } from '../../utils/response';
import { IAuthRequest } from '../../types';
import Product from '../product/product.model';
import SEO from '../product/seo.model';
import Category from '../category/category.model';
import SubCategory from '../subcategory/subcategory.model';
import { logger } from '../../utils/logger';

const MAX_LIST_ITEMS = 10;

// A meta field counts as "present" only when it is a non-blank string. Mongo treats a
// missing path and an explicit null the same way, so `$in: [null, '']` covers
// missing / null / empty in one predicate.
const BLANK = { $in: [null, ''] };

// Mongoose's aggregation typings model expression objects as large discriminated
// unions that dynamically-built helpers cannot satisfy, so these three builders are
// deliberately loosely typed. The shapes are asserted by the pipeline below.
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Effective value of an SEO field on a product. The product document's own field
 * wins and the SEO sidecar fills in — mirroring flattenProductCatalog's
 * assignIfEmpty resolution, so the dashboard agrees with what the storefront renders.
 * Returns '' when neither side has content.
 */
const effectiveSeoField = (own: string, sidecar: string): any => ({
  $let: {
    vars: {
      ownValue: { $trim: { input: { $ifNull: [own, ''] } } },
      sidecarValue: { $trim: { input: { $ifNull: [sidecar, ''] } } },
    },
    in: { $cond: [{ $gt: [{ $strLenCP: '$$ownValue' }, 0] }, '$$ownValue', '$$sidecarValue'] },
  },
});

const isBlank = (field: string): any => ({ $eq: [field, ''] });

const countWhen = (condition: any): any => ({
  $sum: { $cond: [condition, 1, 0] },
});

interface IProductSeoFacet {
  counts: Array<{
    total: number;
    missingMetaTitle: number;
    missingMetaDescription: number;
    missingSlug: number;
    missingBoth: number;
    withKeywords: number;
    complete: number;
  }>;
  worstOffenders: Array<{ _id: unknown; name?: string; slug?: string; missing: string[] }>;
  recentlyUpdated: Array<{ _id: unknown; name?: string; slug?: string; updatedAt?: Date }>;
}

// GET /seo/dashboard — SEO coverage over the catalog. Powers the `seo` role's dashboard.
export const getSeoDashboard = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    // One pass over products: join the SEO sidecar, resolve the effective meta
    // fields, then split into counts + the two leaderboards with $facet.
    const productPipeline: PipelineStage[] = [
      {
        $lookup: {
          from: SEO.collection.name,
          localField: 'seo',
          foreignField: '_id',
          as: 'seoSidecar',
        },
      },
      { $addFields: { seoSidecar: { $arrayElemAt: ['$seoSidecar', 0] } } },
      {
        $addFields: {
          effMetaTitle: effectiveSeoField('$meta_title', '$seoSidecar.meta_title'),
          effMetaDescription: effectiveSeoField('$meta_description', '$seoSidecar.meta_description'),
          effSlug: { $trim: { input: { $ifNull: ['$slug', ''] } } },
          keywordCount: { $size: { $ifNull: ['$seoSidecar.keywords', []] } },
        },
      },
      {
        $addFields: {
          missing: {
            $concatArrays: [
              { $cond: [isBlank('$effMetaTitle'), ['meta_title'], []] },
              { $cond: [isBlank('$effMetaDescription'), ['meta_description'], []] },
              { $cond: [isBlank('$effSlug'), ['slug'], []] },
            ],
          },
        },
      },
      {
        $facet: {
          counts: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                missingMetaTitle: countWhen(isBlank('$effMetaTitle')),
                missingMetaDescription: countWhen(isBlank('$effMetaDescription')),
                missingSlug: countWhen(isBlank('$effSlug')),
                missingBoth: countWhen({
                  $and: [isBlank('$effMetaTitle'), isBlank('$effMetaDescription')],
                }),
                withKeywords: countWhen({ $gt: ['$keywordCount', 0] }),
                // Both meta fields present — the numerator of coveragePercent.
                complete: countWhen({
                  $and: [
                    { $ne: ['$effMetaTitle', ''] },
                    { $ne: ['$effMetaDescription', ''] },
                  ],
                }),
              },
            },
          ],
          worstOffenders: [
            { $match: { $expr: { $gt: [{ $size: '$missing' }, 0] } } },
            { $addFields: { missingCount: { $size: '$missing' } } },
            { $sort: { missingCount: -1, updatedAt: -1 } },
            { $limit: MAX_LIST_ITEMS },
            { $project: { _id: 1, name: 1, slug: 1, missing: 1 } },
          ],
          recentlyUpdated: [
            { $sort: { updatedAt: -1 } },
            { $limit: MAX_LIST_ITEMS },
            { $project: { _id: 1, name: 1, slug: 1, updatedAt: 1 } },
          ],
        },
      },
    ];

    const [
      productFacet,
      categories,
      subCategories,
      categoryMissingMetaTitle,
      categoryMissingMetaDescription,
      subCategoryMissingSeoContent,
      subCategoryMissingFaqs,
    ] = await Promise.all([
      Product.aggregate<IProductSeoFacet>(productPipeline).exec(),
      Category.countDocuments().exec(),
      SubCategory.countDocuments().exec(),
      Category.countDocuments({ meta_title: BLANK }).exec(),
      Category.countDocuments({ meta_description: BLANK }).exec(),
      SubCategory.countDocuments({ 'seo_content.description': BLANK }).exec(),
      SubCategory.countDocuments({
        $or: [
          { 'seo_content.faqs': { $exists: false } },
          { 'seo_content.faqs': null },
          { 'seo_content.faqs': { $size: 0 } },
        ],
      }).exec(),
    ]);

    const facet = productFacet[0];
    const counts = facet?.counts?.[0] || {
      total: 0,
      missingMetaTitle: 0,
      missingMetaDescription: 0,
      missingSlug: 0,
      missingBoth: 0,
      withKeywords: 0,
      complete: 0,
    };

    const coveragePercent = counts.total
      ? Math.round((counts.complete / counts.total) * 100)
      : 0;

    res.status(200).json(
      commonResponse('SEO dashboard fetched', true, {
        totals: {
          products: counts.total,
          categories,
          subCategories,
        },
        products: {
          missingMetaTitle: counts.missingMetaTitle,
          missingMetaDescription: counts.missingMetaDescription,
          missingSlug: counts.missingSlug,
          missingBoth: counts.missingBoth,
          withKeywords: counts.withKeywords,
          coveragePercent,
        },
        categories: {
          missingMetaTitle: categoryMissingMetaTitle,
          missingMetaDescription: categoryMissingMetaDescription,
        },
        subCategories: {
          missingSeoContent: subCategoryMissingSeoContent,
          missingFaqs: subCategoryMissingFaqs,
        },
        recentlyUpdated: facet?.recentlyUpdated || [],
        worstOffenders: facet?.worstOffenders || [],
      })
    );
  } catch (error) {
    logger.error('getSeoDashboard error', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal server error.', false));
  }
};
