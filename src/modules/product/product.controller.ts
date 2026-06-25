import { Response } from 'express';
import mongoose from 'mongoose';
import slugify from 'slugify';
import multer from 'multer';
import Product from '../product/product.model';
import Category from '../category/category.model';
import Brand from '../brand/brand.model';
import SubCategory from '../subcategory/subcategory.model';
import { commonResponse } from '../../utils/response';
import { normalizeMojibakeInObject } from '../../utils/text-encoding';
import { processImages, attachSignedImagesToProducts, getSignedUrlForKey, uploadToS3 } from '../../utils/s3';
import { sanitizeOverviewFields } from '../../utils/overview-fields';
import { sanitizeFieldVisibility } from '../../utils/field-visibility';

import { IAuthRequest, IImageSignOptions } from '../../types';
import { logger } from '../../utils/logger';
import { addJob, notificationQueue } from '../../queue';
import {
  PRODUCT_POPULATE_PATHS,
  buildLegacyProductPayload,
  deleteProductCatalogRefs,
  flattenProductCatalog,
  flattenProductCatalogList,
  syncProductCatalogRefs,
} from './product-catalog.service';

const IMAGE_SIGN_OPTIONS: IImageSignOptions = { expiresIn: 3600 };
// Card/list views get lightweight resized thumbnails; detail keeps full-size.
const CARD_IMAGE_SIGN_OPTIONS: IImageSignOptions = { expiresIn: 3600, width: 400 };
const MAX_PAGE_LIMIT = 100;

const normalizeSlugValue = (value?: string): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return slugify(trimmed, { lower: false, strict: false, trim: true });
};

const safeDecodeURIComponent = (value: string): string => {
  try { return decodeURIComponent(value); } catch { return value; }
};

const escapeRegex = (value: string): string =>
  value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

const buildSlugQuery = (value?: string): Record<string, unknown> | null => {
  if (!value) return null;
  const rawValue = value.trim();
  if (!rawValue) return null;
  const decoded = safeDecodeURIComponent(rawValue).trim();
  const variants = [...new Set([rawValue, decoded, normalizeSlugValue(rawValue), normalizeSlugValue(decoded)].filter(Boolean))];
  if (!variants.length) return null;
  return { $or: variants.map((v) => ({ slug: { $regex: new RegExp(`^${escapeRegex(v!)}\\s*$`, 'i') } })) };
};

const buildRangeFilter = (field: string, range?: { min?: number; max?: number }) => {
  if (!range) return null;
  const min = Number(range.min);
  const max = Number(range.max);
  const hasMin = Number.isFinite(min);
  const hasMax = Number.isFinite(max);
  if (!hasMin && !hasMax) return null;
  const numeric: Record<string, number> = {};
  if (hasMin) numeric.$gte = min;
  if (hasMax) numeric.$lte = max;
  return { [field]: numeric };
};

const normalizeObjectId = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const str = typeof value === 'object' ? String((value as Record<string, unknown>)._id || value) : String(value);
  return (mongoose.Types.ObjectId as any).isValid(str) ? String(new (mongoose.Types.ObjectId as any)(str)) : undefined;
};

const normalizeObjectIdList = (values?: unknown[]): string[] | undefined => {
  if (!Array.isArray(values)) return undefined;
  return [...new Set(values.map(normalizeObjectId).filter(Boolean) as string[])];
};

const buildIdFilter = (field: string, value: unknown) => {
  if (!value) return null;
  const list = Array.isArray(value) ? value : [value];
  const ids = list.map(normalizeObjectId).filter(Boolean) as string[];
  return ids.length ? { [field]: { $in: ids } } : null;
};

const getCategoryOverviewFields = async (categoryId?: string) => {
  const id = normalizeObjectId(categoryId);
  if (!id) return [];
  const category = await Category.findById(id).select('overview_fields').lean().exec();
  return Array.isArray(category?.overview_fields) ? category.overview_fields : [];
};

const getCategoryIdFromProduct = (category: unknown): string | undefined => {
  if (!category || typeof category !== 'object') return category?.toString();
  return normalizeObjectId((category as Record<string, unknown>)._id);
};

const parseBoolean = (value: unknown, def = false): boolean => {
  if (value === undefined || value === null) return def;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'y'].includes(String(value).trim().toLowerCase());
};

const parseNumber = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const getRequestValue = (req: IAuthRequest, key: string): unknown => {
  const queryValue = req.query?.[key];
  if (queryValue !== undefined) return queryValue;
  return (req.body as Record<string, unknown> | undefined)?.[key];
};

const getPagination = (req: IAuthRequest) => {
  const skip = parseNumber(getRequestValue(req, 'skip')) ?? 0;
  let limit = parseNumber(getRequestValue(req, 'limit'));
  if (limit !== null && limit < 0) limit = null;
  if (limit !== null) limit = Math.min(limit, MAX_PAGE_LIMIT);
  return { skip: Math.max(0, skip), limit };
};

const applyListOptions = (req: IAuthRequest, query: mongoose.Query<unknown, unknown>, populatePaths?: string) => {
  const lite = parseBoolean(req.query.lite);
  const includeImages = parseBoolean(req.query.includeImages, true);
  const includePopulate = parseBoolean(req.query.populate, true);

  if (includePopulate && populatePaths) query.populate(populatePaths);
  if (lite) query.select('-description -aboutItem -priceList -buyItWith -relatedProducts -meta_description -meta_title');
  if (!includeImages) query.select((lite ? '' : '-') + 'images');
  return { includeImages };
};

export const uploadImage = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json(commonResponse('No file uploaded', false)); return; }
    await uploadToS3(req.file.originalname, req.file.buffer, req.file.mimetype);
    const url = await getSignedUrlForKey(req.file.originalname, IMAGE_SIGN_OPTIONS);
    res.status(201).json(commonResponse('image uploaded', true, { key: req.file.originalname, url }));
  } catch (error) { res.status(500).json(commonResponse('Upload failed', false)); }
};

export const getImage = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { image } = req.query;
    const url = await getSignedUrlForKey(image as string, IMAGE_SIGN_OPTIONS);
    res.status(200).json(commonResponse('image fetched', true, { url }));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const createProduct = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const body = req.body;
    const legacyPayload = buildLegacyProductPayload(body);

    const product = new Product({
      brand: normalizeObjectId(body.brand),
      name: body.name, model: body.model,
      delivery_time: body.delivery_time, hsn_code: body.hsn_code,
      price: body.price, priceList: body.priceList,
      gst: body.gst,
      meta_title: body.meta_title, meta_description: body.meta_description,
      category: normalizeObjectId(body.category),
      sub_category: normalizeObjectId(body.sub_category),
      images: body.images, slug: normalizeSlugValue(body.slug ?? body.name),
      product_id: body.product_id,
      description: body.description,
      usage: body.usage, aboutItem: body.aboutItem,
      // Category-specific spec fields stored flat on the product document.
      length: body.length, width: body.width, height: body.height,
      length_inch: body.length_inch, length_mm: body.length_mm,
      breadth_inch: body.breadth_inch, breadth_mm: body.breadth_mm,
      height_inch: body.height_inch, height_mm: body.height_mm,
      size_inch: body.size_inch, size_mm: body.size_mm,
      flap_mm: body.flap_mm, thickness: body.thickness,
      thickness_micron: body.thickness_micron, gusset: body.gusset,
      print: body.print, label_in_roll: body.label_in_roll ?? body.label_in_role,
      core_size: body.core_size, pouch_weight: body.pouch_weight,
      adhesive: body.adhesive, material: body.material, color: body.color,
      top_product: body.top_product,
      deal_product: body.deal_product,
      ...legacyPayload,
      overview_fields: sanitizeOverviewFields(body.overview_fields, { includeValue: true }),
      field_visibility: sanitizeFieldVisibility(body.field_visibility),
      buyItWith: normalizeObjectIdList(body.buyItWith),
      relatedProducts: normalizeObjectIdList(body.relatedProducts),
    });

    const data = await product.save();
    await syncProductCatalogRefs(data._id, {
      ...body,
      overview_fields: sanitizeOverviewFields(body.overview_fields, { includeValue: true }),
    });
    const populated = await Product.findById(data._id).populate(PRODUCT_POPULATE_PATHS).exec();
    res.status(201).json(commonResponse('Product created', true, flattenProductCatalog(populated || data) as Record<string, unknown>));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};

export const getProductById = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await Product.findOne({ _id: req.params.id }).populate(PRODUCT_POPULATE_PATHS).exec();
    if (!data) { res.status(404).json(commonResponse('Product not found', false)); return; }
    // Admin edit source: return the product's OWN values (no category inheritance
    // backfill) so blank fields stay blank (= "inherit from category") and saving
    // never re-persists an inherited value as a per-product override.
    const productData = flattenProductCatalog(data, { inherit: false }) as Record<string, unknown>;
    productData.images = await processImages(productData.images as any[], IMAGE_SIGN_OPTIONS);
    productData.category_overview_fields = await getCategoryOverviewFields(getCategoryIdFromProduct(productData.category));
    res.status(200).json(commonResponse('Product found', true, productData));
  } catch (error) { res.status(500).json(commonResponse('Internal server error', false)); }
};

export const getProduct = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const slugQuery = buildSlugQuery(req.params.slug);
    if (!slugQuery) { res.status(404).json(commonResponse('Product not found', false)); return; }
    const data = await Product.findOne(slugQuery).populate(PRODUCT_POPULATE_PATHS).exec();
    if (!data) { res.status(404).json(commonResponse('Product not found', false)); return; }
    const productData = flattenProductCatalog(data) as Record<string, unknown>;
    productData.images = await processImages(productData.images as any[], IMAGE_SIGN_OPTIONS);
    productData.category_overview_fields = await getCategoryOverviewFields(getCategoryIdFromProduct(productData.category));
    res.status(200).json(commonResponse('Product found', true, productData));
  } catch (error) { res.status(500).json(commonResponse('Internal server error', false)); }
};

export const getProducts = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { skip, limit } = getPagination(req);
    const includeMeta = parseBoolean(getRequestValue(req, 'includeMeta'));
    const query = Product.find().skip(skip);
    if (limit !== null) query.limit(limit);
    applyListOptions(req, query, PRODUCT_POPULATE_PATHS);
    const [data, total] = await Promise.all([
      query.lean().exec(),
      includeMeta ? Product.countDocuments().exec() : Promise.resolve(null),
    ]);
    const products = flattenProductCatalogList(data as Record<string, unknown>[]);
    if (products.length > 0) await attachSignedImagesToProducts(products, CARD_IMAGE_SIGN_OPTIONS);
    res.status(200).json(commonResponse('Products found', true, products, includeMeta ? { total: total ?? 0, skip, limit, returned: products.length, hasMore: limit !== null ? skip + products.length < (total ?? 0) : false } : undefined));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};

export const updateProduct = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const body = req.body;
    const existing = await Product.findById(body.id).exec();
    if (!existing) { res.status(404).json(commonResponse('Product not found', false)); return; }

    const update: Record<string, unknown> = buildLegacyProductPayload(body);
    if (body.slug || body.name) update.slug = normalizeSlugValue(body.slug ?? body.name);
    if (body.brand) update.brand = normalizeObjectId(body.brand);
    if (body.category) update.category = normalizeObjectId(body.category);
    if (body.sub_category) update.sub_category = normalizeObjectId(body.sub_category);
    if (body.overview_fields) update.overview_fields = sanitizeOverviewFields(body.overview_fields, { includeValue: true });
    if (body.field_visibility !== undefined) update.field_visibility = sanitizeFieldVisibility(body.field_visibility);
    if (body.buyItWith) update.buyItWith = normalizeObjectIdList(body.buyItWith);
    if (body.relatedProducts) update.relatedProducts = normalizeObjectIdList(body.relatedProducts);

        if (body.priceList && Array.isArray(body.priceList) && (body.priceList[0] as any)?.stock_quantity !== undefined) {
          const oldStock = (existing.priceList?.[0] as any)?.stock_quantity ?? 0;
          const newStock = (body.priceList[0] as any).stock_quantity as number;
          if ((oldStock as number) <= 0 && (newStock as number) > 0) {
            await addJob(notificationQueue, 'send-back-in-stock', { productId: body.id });
          }
        }

    const data = await Product.findOneAndUpdate({ _id: body.id }, { $set: update }, { new: true }).exec();
    if (data) {
      await syncProductCatalogRefs(data._id, {
        ...body,
        ...(body.overview_fields ? { overview_fields: sanitizeOverviewFields(body.overview_fields, { includeValue: true }) } : {}),
      });
    }
    const populated = data ? await Product.findById(data._id).populate(PRODUCT_POPULATE_PATHS).exec() : null;
    const out = populated ? flattenProductCatalog(populated) as Record<string, unknown> : undefined;
    res.status(data ? 200 : 400).json(commonResponse(data ? 'Product updated' : 'Not updated', !!data, out));
  } catch (error) { res.status(500).json(commonResponse('Internal server error', false)); }
};

export const addRelatedProducts = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const productId = req.params.id;
    if (!(mongoose.Types.ObjectId as any).isValid(productId)) { res.status(400).json(commonResponse('Invalid id', false)); return; }
    const raw = req.body.relatedProducts ?? req.body.relatedProductIds ?? req.body.productIds;
    const list = Array.isArray(raw) ? raw : [raw];
    const ids = (normalizeObjectIdList(list) || []).filter((id) => id !== productId);
    if (!ids.length) { res.status(400).json(commonResponse('No valid products', false)); return; }
    const data = await Product.findByIdAndUpdate(productId, { $addToSet: { relatedProducts: { $each: ids } } }, { new: true }).populate('brand').exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Related products added' : 'Not found', !!data, data || undefined));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const addBuyItWithProducts = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const productId = req.params.id;
    if (!(mongoose.Types.ObjectId as any).isValid(productId)) { res.status(400).json(commonResponse('Invalid id', false)); return; }
    const raw = req.body.buyItWith ?? req.body.buyItWithProducts ?? req.body.productIds;
    const list = Array.isArray(raw) ? raw : [raw];
    const ids = (normalizeObjectIdList(list) || []).filter((id) => id !== productId);
    if (!ids.length) { res.status(400).json(commonResponse('No valid products', false)); return; }
    const data = await Product.findByIdAndUpdate(productId, { $addToSet: { buyItWith: { $each: ids } } }, { new: true }).populate('brand').exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Buy it with added' : 'Not found', !!data, data || undefined));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const deleteProduct = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const ids = Array.isArray(req.body.id) ? req.body.id : [req.body.id];
    const data = await Product.deleteMany({ _id: { $in: ids } }).exec();
    if (data.deletedCount > 0) await deleteProductCatalogRefs(ids);
    res.status(data.deletedCount > 0 ? 200 : 404).json(commonResponse(data.deletedCount > 0 ? 'Deleted' : 'Not found', data.deletedCount > 0, data));
  } catch (error) { res.status(500).json(commonResponse('Error deleting', false)); }
};

export const allProducts = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { skip, limit } = getPagination(req);
    const includeMeta = parseBoolean(getRequestValue(req, 'includeMeta'));
    const query = Product.find().sort({ _id: 1 }).skip(skip);
    if (limit !== null) query.limit(limit);
    applyListOptions(req, query, PRODUCT_POPULATE_PATHS);
    const [data, total] = await Promise.all([
      query.lean().exec(),
      includeMeta ? Product.countDocuments().exec() : Promise.resolve(null),
    ]);
    const products = flattenProductCatalogList(data as Record<string, unknown>[]);
    if (products.length > 0) await attachSignedImagesToProducts(products, CARD_IMAGE_SIGN_OPTIONS);
    res.status(200).json(commonResponse('Products found', true, products, includeMeta ? { total: total ?? 0, skip, limit, returned: products.length, hasMore: limit !== null ? skip + products.length < (total ?? 0) : false } : undefined));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};

export const searchProduct = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { name, product_id, slug, model, brand, category, sub_category, q } = req.query;
    const filter: Record<string, unknown> = {};
    
    if (q) {
      const safeQ = escapeRegex(String(q).trim());
      filter.$or = [
        { name: { $regex: safeQ, $options: 'i' } },
        { product_id: { $regex: safeQ, $options: 'i' } },
        { slug: { $regex: safeQ, $options: 'i' } },
        { model: { $regex: safeQ, $options: 'i' } },
      ];
    } else {
      if (name) filter.name = { $regex: name, $options: 'i' };
      if (product_id) filter.product_id = product_id;
      if (slug) filter.slug = { $regex: slug, $options: 'i' };
      if (model) filter.model = { $regex: model, $options: 'i' };
    }

    if (category) {
      const catStr = String(category);
      const catObjId = normalizeObjectId(catStr);
      const catMatchQuery: Record<string, any>[] = [{ name: { $regex: catStr, $options: 'i' } }];
      if (catObjId) {
        catMatchQuery.push({ _id: new (mongoose.Types.ObjectId as any)(catObjId) });
      }
      const categories = await Category.find({ $or: catMatchQuery }).select('_id').lean().exec();
      const categoryIds = categories.map(c => c._id);
      filter.category = { $in: categoryIds };
    }

    if (sub_category) {
      const subCatStr = String(sub_category);
      const subCatObjId = normalizeObjectId(subCatStr);
      const subCatMatchQuery: Record<string, any>[] = [{ name: { $regex: subCatStr, $options: 'i' } }];
      if (subCatObjId) {
        subCatMatchQuery.push({ _id: new (mongoose.Types.ObjectId as any)(subCatObjId) });
      }
      const subCategories = await SubCategory.find({ $or: subCatMatchQuery }).select('_id').lean().exec();
      const subCategoryIds = subCategories.map(s => s._id);
      filter.sub_category = { $in: subCategoryIds };
    }

    if (brand) {
      const brandStr = String(brand);
      const brandObjId = normalizeObjectId(brandStr);
      const brandMatchQuery: Record<string, any>[] = [{ name: { $regex: brandStr, $options: 'i' } }];
      if (brandObjId) {
        brandMatchQuery.push({ _id: new (mongoose.Types.ObjectId as any)(brandObjId) });
      }
      const brands = await Brand.find({ $or: brandMatchQuery }).select('_id').lean().exec();
      const brandIds = brands.map(b => b._id);
      filter.brand = { $in: brandIds };
    }

    const { skip, limit } = getPagination(req);
    const includeMeta = parseBoolean(getRequestValue(req, 'includeMeta'));
    const query = Product.find(filter).skip(skip);
    if (limit !== null) query.limit(limit);
    applyListOptions(req, query, PRODUCT_POPULATE_PATHS);
    const [data, total] = await Promise.all([
      query.lean().exec(),
      includeMeta ? Product.countDocuments(filter).exec() : Promise.resolve(null),
    ]);
    const products = flattenProductCatalogList(data as Record<string, unknown>[]);
    if (products.length > 0) await attachSignedImagesToProducts(products, CARD_IMAGE_SIGN_OPTIONS);
    res.status(200).json(commonResponse('Products fetched', true, products, includeMeta ? { total: total ?? 0, skip, limit, returned: products.length, hasMore: limit !== null ? skip + products.length < (total ?? 0) : false } : undefined));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

// Minimum query length at which the MongoDB text index is worth using. Text
// search matches whole (stemmed) words, so very short prefixes ("bo") can't hit
// it — those go straight to the regex fallback below.
const TEXT_SEARCH_MIN_LENGTH = 3;

export const searchMainProducts = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const searchQuery = typeof req.body.search === 'string' ? req.body.search.trim() : '';
    if (!searchQuery) { res.status(400).json(commonResponse('Search query required', false)); return; }

    const { skip, limit } = getPagination(req);
    const includeMeta = parseBoolean(getRequestValue(req, 'includeMeta'));

    // Substring + exact-SKU fallback. Preserves the original "contains" semantics
    // the navbar typeahead relies on (partial words, mid-word matches, product_id
    // lookups). User input is escaped so regex metacharacters are matched
    // literally instead of throwing on an invalid pattern.
    const safe = escapeRegex(searchQuery);
    const regexFilter = {
      $or: [
        { name: { $regex: safe, $options: 'i' } },
        { product_id: searchQuery },
        { slug: { $regex: safe, $options: 'i' } },
        { model: { $regex: safe, $options: 'i' } },
      ],
    };

    const runQuery = async (filter: Record<string, unknown>, sortByScore = false) => {
      const query = Product.find(filter).skip(skip);
      // Rank by text relevance. The score is only used for ordering, not
      // projected, so this stays compatible with the lite/exclusion projections
      // applied by applyListOptions.
      if (sortByScore) query.sort({ score: { $meta: 'textScore' } } as Record<string, { $meta: string }>);
      if (limit !== null) query.limit(limit);
      applyListOptions(req, query, PRODUCT_POPULATE_PATHS);
      const [data, total] = await Promise.all([
        query.lean().exec(),
        includeMeta ? Product.countDocuments(filter).exec() : Promise.resolve(null),
      ]);
      return { data, total };
    };

    // Indexed text search for word-like queries; fall back to the regex scan when
    // it finds nothing (substring-only matches, SKUs) or the query is too short.
    let result: { data: unknown[]; total: number | null } | null = null;
    if (searchQuery.length >= TEXT_SEARCH_MIN_LENGTH) {
      try {
        result = await runQuery({ $text: { $search: searchQuery } }, true);
      } catch (textError) {
        // Most likely the text index hasn't been created yet (sync:indexes not
        // run): "text index required for $text query". Degrade to the regex path
        // instead of failing the whole search.
        logger.warn('searchMainProducts: $text query failed, falling back to $regex', {
          error: textError instanceof Error ? textError.message : 'Unknown',
        });
        result = null;
      }
    }
    if (!result || result.data.length === 0) {
      result = await runQuery(regexFilter);
    }

    const { data, total } = result;
    const products = flattenProductCatalogList(data as Record<string, unknown>[]);
    if (products.length > 0) await attachSignedImagesToProducts(products, CARD_IMAGE_SIGN_OPTIONS);
    res.status(200).json(commonResponse('Products fetched', true, products, includeMeta ? { total: total ?? 0, skip, limit, returned: products.length, hasMore: limit !== null ? skip + products.length < (total ?? 0) : false } : undefined));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const countProducts = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await Product.countDocuments().exec();
    res.status(200).json(commonResponse('Count', true, data));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const getSubCategoryAvailability = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { category, brand, subcategory, q } = req.body;
    const filter: Record<string, unknown> = { sub_category: { $ne: null } };
    const catFilter = buildIdFilter('category', category);
    const brandFilter = buildIdFilter('brand', brand);
    const subCatFilter = buildIdFilter('sub_category', subcategory);
    if (catFilter) filter.category = (catFilter as Record<string, unknown>).category;
    if (brandFilter) filter.brand = (brandFilter as Record<string, unknown>).brand;
    if (subCatFilter) filter.sub_category = (subCatFilter as Record<string, unknown>).sub_category;
    if (q) filter.name = { $regex: q, $options: 'i' };

    const data = await Product.aggregate([
      { $match: filter },
      { $group: { _id: '$sub_category', productCount: { $sum: 1 } } },
      { $sort: { productCount: -1, _id: 1 } },
    ]).exec();

    res.status(200).json(commonResponse('Subcategory availability', true, data.map((item: any) => ({ subcategory: String(item._id), productCount: item.productCount }))));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const filterProducts = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { length, breadth, height, width, flap, gusset, thickness, category, brand, subcategory, q, unit } = req.body;
    const normalizedUnit = unit === 'inches' ? 'inches' : 'mm';
    const dimFields = normalizedUnit === 'inches'
      ? { length: ['length_inch'], breadth: ['breadth_inch'], height: ['height_inch'] }
      : { length: ['length_mm'], breadth: ['breadth_mm', 'width'], height: ['height_mm'] };

    const buildMultiFieldFilter = (fields: string[], range?: { min?: number; max?: number }) => {
      if (!range) return null;
      const filters = fields.map((f) => buildRangeFilter(f, range)).filter(Boolean);
      return filters.length === 1 ? filters[0] : filters.length > 1 ? { $or: filters } : null;
    };

    const rangeFilters = [
      buildMultiFieldFilter(dimFields.length, length),
      buildMultiFieldFilter(dimFields.breadth, breadth ?? width),
      buildMultiFieldFilter(dimFields.height, height),
      buildRangeFilter('flap_mm', flap),
      buildRangeFilter('gusset', gusset),
      buildMultiFieldFilter(['thickness', 'thickness_micron'], thickness),
    ].filter(Boolean);

    const filter: Record<string, unknown> = {};
    if (rangeFilters.length) filter.$and = rangeFilters as Record<string, unknown>[];
    const catFilter = buildIdFilter('category', category);
    const brandFilter = buildIdFilter('brand', brand);
    const subCatFilter = buildIdFilter('sub_category', subcategory);
    if (catFilter) Object.assign(filter, catFilter);
    if (brandFilter) Object.assign(filter, brandFilter);
    if (subCatFilter) Object.assign(filter, subCatFilter);
    if (q) filter.name = { $regex: q, $options: 'i' };

    const { skip, limit } = getPagination(req);
    const includeMeta = parseBoolean(getRequestValue(req, 'includeMeta'));
    const query = Product.find(filter).sort({ _id: 1 }).skip(skip);
    if (limit !== null) query.limit(limit);
    applyListOptions(req, query, PRODUCT_POPULATE_PATHS);
    const [data, total] = await Promise.all([
      query.lean().exec(),
      includeMeta ? Product.countDocuments(filter).exec() : Promise.resolve(null),
    ]);
    const products = flattenProductCatalogList(data as Record<string, unknown>[]);
    if (products.length > 0) await attachSignedImagesToProducts(products, CARD_IMAGE_SIGN_OPTIONS);
    res.status(200).json(commonResponse('Products found', true, products, includeMeta ? { total: total ?? 0, skip, limit, returned: products.length, hasMore: limit !== null ? skip + products.length < (total ?? 0) : false } : undefined));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const filterBoppProducts = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { length, width, thickness, category, brand, subcategory, q } = req.body;
    const rangeFilters = [
      buildRangeFilter('length', length),
      buildRangeFilter('breadth_mm', width) || buildRangeFilter('width', width),
      buildRangeFilter('thickness_micron', thickness) || buildRangeFilter('thickness', thickness),
    ].filter(Boolean);
    const filter: Record<string, unknown> = {};
    if (rangeFilters.length) filter.$and = rangeFilters as Record<string, unknown>[];
    ['category', 'brand', 'sub_category'].forEach((f) => {
      const v = f === 'sub_category' ? subcategory : req.body[f];
      if (v) filter[f] = { $in: Array.isArray(v) ? v : [v] };
    });
    if (q) filter.name = { $regex: q, $options: 'i' };
    const { skip, limit } = getPagination(req);
    const includeMeta = parseBoolean(getRequestValue(req, 'includeMeta'));
    const query = Product.find(filter).sort({ _id: 1 }).skip(skip);
    if (limit !== null) query.limit(limit);
    applyListOptions(req, query, PRODUCT_POPULATE_PATHS);
    const [data, total] = await Promise.all([
      query.lean().exec(),
      includeMeta ? Product.countDocuments(filter).exec() : Promise.resolve(null),
    ]);
    const products = flattenProductCatalogList(data as Record<string, unknown>[]);
    if (products.length > 0) await attachSignedImagesToProducts(products, CARD_IMAGE_SIGN_OPTIONS);
    res.status(200).json(commonResponse('Products found', true, products, includeMeta ? { total: total ?? 0, skip, limit, returned: products.length, hasMore: limit !== null ? skip + products.length < (total ?? 0) : false } : undefined));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const filterPolyProducts = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { length, width, breadth, flap, category, brand, subcategory, q, unit } = req.body;
    const normalizedUnit = unit === 'mm' ? 'mm' : 'inches';
    const dimFields = normalizedUnit === 'inches'
      ? { length: ['length_inch'], breadth: ['breadth_inch'] }
      : { length: ['length_mm'], breadth: ['breadth_mm', 'width'] };
    const rangeFilters = [
      buildRangeFilter(dimFields.length[0], length ?? width),
      buildRangeFilter(dimFields.breadth[0], breadth),
      buildRangeFilter('flap_mm', flap),
    ].filter(Boolean);
    const filter: Record<string, unknown> = {};
    if (rangeFilters.length) filter.$and = rangeFilters as Record<string, unknown>[];
    ['category', 'brand', 'sub_category'].forEach((f) => {
      const v = f === 'sub_category' ? subcategory : req.body[f];
      if (v) filter[f] = { $in: Array.isArray(v) ? v : [v] };
    });
    if (q) filter.name = { $regex: q, $options: 'i' };
    const { skip, limit } = getPagination(req);
    const includeMeta = parseBoolean(getRequestValue(req, 'includeMeta'));
    const query = Product.find(filter).sort({ _id: 1 }).skip(skip);
    if (limit !== null) query.limit(limit);
    applyListOptions(req, query, PRODUCT_POPULATE_PATHS);
    const [data, total] = await Promise.all([
      query.lean().exec(),
      includeMeta ? Product.countDocuments(filter).exec() : Promise.resolve(null),
    ]);
    const products = flattenProductCatalogList(data as Record<string, unknown>[]);
    if (products.length > 0) await attachSignedImagesToProducts(products, CARD_IMAGE_SIGN_OPTIONS);
    res.status(200).json(commonResponse('Products found', true, products, includeMeta ? { total: total ?? 0, skip, limit, returned: products.length, hasMore: limit !== null ? skip + products.length < (total ?? 0) : false } : undefined));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const filterLabelProducts = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { length, breadth, height, core_size, category, brand, subcategory, q, unit } = req.body;
    const normalizedUnit = unit === 'inches' ? 'inches' : 'mm';
    const lField = normalizedUnit === 'inches' ? 'length_inch' : 'length_mm';
    const bFields = normalizedUnit === 'inches' ? ['height_inch', 'breadth_inch'] : ['height_mm', 'breadth_mm'];
    const rangeFilters = [
      buildRangeFilter(lField, length),
      buildRangeFilter(bFields[0], height ?? breadth) || buildRangeFilter(bFields[1], height ?? breadth),
      buildRangeFilter('core_size', core_size),
    ].filter(Boolean);
    const filter: Record<string, unknown> = {};
    if (rangeFilters.length) filter.$and = rangeFilters as Record<string, unknown>[];
    ['category', 'brand', 'sub_category'].forEach((f) => {
      const v = f === 'sub_category' ? subcategory : req.body[f];
      if (v) filter[f] = { $in: Array.isArray(v) ? v : [v] };
    });
    if (q) filter.name = { $regex: q, $options: 'i' };
    const { skip, limit } = getPagination(req);
    const includeMeta = parseBoolean(getRequestValue(req, 'includeMeta'));
    const query = Product.find(filter).sort({ _id: 1 }).skip(skip);
    if (limit !== null) query.limit(limit);
    applyListOptions(req, query, PRODUCT_POPULATE_PATHS);
    const [data, total] = await Promise.all([
      query.lean().exec(),
      includeMeta ? Product.countDocuments(filter).exec() : Promise.resolve(null),
    ]);
    const products = flattenProductCatalogList(data as Record<string, unknown>[]);
    if (products.length > 0) await attachSignedImagesToProducts(products, CARD_IMAGE_SIGN_OPTIONS);
    res.status(200).json(commonResponse('Products found', true, products, includeMeta ? { total: total ?? 0, skip, limit, returned: products.length, hasMore: limit !== null ? skip + products.length < (total ?? 0) : false } : undefined));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const SingleProduct = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await Product.findOne({ _id: req.params.id }).populate(PRODUCT_POPULATE_PATHS).exec();
    if (!data) { res.status(404).json({ message: 'Product not found' }); return; }
    const productData = flattenProductCatalog(data) as Record<string, unknown>;
    productData.category_overview_fields = await getCategoryOverviewFields(getCategoryIdFromProduct(productData.category));
    res.status(200).json({ message: 'Product found', data: normalizeMojibakeInObject(productData) });
  } catch (error) { res.status(500).json({ message: 'Internal server error' }); }
};

export const SingleProductWithImage = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await Product.findOne({ _id: req.params.id }).populate(PRODUCT_POPULATE_PATHS).exec();
    if (!data) { res.status(404).json({ message: 'Product not found' }); return; }
    const productData = flattenProductCatalog(data) as Record<string, unknown>;
    productData.images = await processImages(productData.images as any[], IMAGE_SIGN_OPTIONS);
    productData.category_overview_fields = await getCategoryOverviewFields(getCategoryIdFromProduct(productData.category));
    res.status(200).json({ message: 'Product found', data: normalizeMojibakeInObject(productData) });
  } catch (error) { res.status(500).json({ message: 'Internal server error' }); }
};
