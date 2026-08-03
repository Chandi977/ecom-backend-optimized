import { Response } from 'express';
import Category from '../category/category.model';
import SubCategory from '../subcategory/subcategory.model';
import { commonResponse } from '../../utils/response';
import slugify from 'slugify';

import { sanitizeOverviewFields } from '../../utils/overview-fields';
import { sanitizeFieldVisibility } from '../../utils/field-visibility';
import { sanitizeCommonAttributes, sanitizeSpecSchema } from '../../utils/category-attributes';
import { IAuthRequest } from '../../types';
import { parseOptionalGstRate } from '../../utils/gst-rate';

const attachSubCategories = async (categories: Array<Record<string, unknown>>) => {
  if (!categories.length) return categories;
  const ids = categories.map((category) => category._id).filter(Boolean);
  const subCategories = await SubCategory.find({ category: { $in: ids } }).lean().exec();
  const byCategory = new Map<string, unknown[]>();
  subCategories.forEach((subCategory) => {
    const categoryId = subCategory.category?.toString();
    if (!categoryId) return;
    const list = byCategory.get(categoryId) || [];
    list.push(subCategory);
    byCategory.set(categoryId, list);
  });
  return categories.map((category) => ({
    ...category,
    subCategories: byCategory.get(category._id?.toString() || '') || [],
  }));
};

export const createCategory = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { name, category_id, meta_title, meta_description, overview_fields, gst, field_visibility, common_attributes, spec_schema, hsn_code, sac_code, tax_category, delivery_time } = req.body;

    const category = new Category({
      name,
      slug: slugify(name),
      category_id,
      gst: parseOptionalGstRate(gst) ?? 18,
      hsn_code,
      sac_code,
      tax_category,
      delivery_time,
      meta_title,
      meta_description,
      overview_fields: sanitizeOverviewFields(overview_fields),
      field_visibility: sanitizeFieldVisibility(field_visibility),
      common_attributes: sanitizeCommonAttributes(common_attributes),
      spec_schema: sanitizeSpecSchema(spec_schema),
    });
    const data = await category.save();
    res.status(data ? 201 : 400).json(commonResponse(data ? 'Category created' : 'Unable to create', !!data, data || undefined));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};

export const getCategories = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { skip = '0', limit = '10' } = req.query;
    const data = await Category.find().skip(parseInt(skip as string)).limit(parseInt(limit as string)).lean().exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Categories fetched' : 'No categories', data.length > 0, data));
  } catch (error) { res.status(500).json(commonResponse('Unable to fetch categories', false)); }
};

export const getCategory = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await Category.findOne({ _id: req.params.id }).lean().exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Category fetched' : 'Not found', !!data, data || undefined));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};

export const updateCategory = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id, name, category_id, meta_title, meta_description, overview_fields, gst, field_visibility, common_attributes, spec_schema, hsn_code, sac_code, tax_category, delivery_time } = req.body;
    // Only touch what was actually sent. These five used to be assigned
    // unconditionally, which made slugify(undefined) throw on any partial update —
    // and a partial update is exactly what the field-scoped `seo` role sends, since
    // SEO_CATEGORY_FIELDS deliberately excludes `name`. Mongoose already strips
    // undefined values from an update, so guarding them changes nothing else.
    const update: Record<string, unknown> = {};
    if (name !== undefined) {
      update.name = name;
      update.slug = slugify(name);
    }
    if (category_id !== undefined) update.category_id = category_id;
    if (meta_title !== undefined) update.meta_title = meta_title;
    if (meta_description !== undefined) update.meta_description = meta_description;
    if (overview_fields !== undefined) update.overview_fields = sanitizeOverviewFields(overview_fields);
    if (hsn_code !== undefined) update.hsn_code = hsn_code;
    if (sac_code !== undefined) update.sac_code = sac_code;
    if (tax_category !== undefined) update.tax_category = tax_category;
    const parsedGst = parseOptionalGstRate(gst);
    if (parsedGst !== undefined) update.gst = parsedGst;
    if (delivery_time !== undefined) update.delivery_time = delivery_time;
    if (field_visibility !== undefined) update.field_visibility = sanitizeFieldVisibility(field_visibility);
    if (common_attributes !== undefined) update.common_attributes = sanitizeCommonAttributes(common_attributes);
    if (spec_schema !== undefined) update.spec_schema = sanitizeSpecSchema(spec_schema);
    const data = await Category.findOneAndUpdate({ _id: id }, update).exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Category updated' : 'Not found', !!data, data || undefined));
  } catch (error) { res.status(500).json(commonResponse('An error occurred', false)); }
};

export const deleteCategory = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.body;
    const data = await Category.deleteMany({ _id: { $in: id } }).exec();
    res.status(data.deletedCount > 0 ? 200 : 404).json(commonResponse(data.deletedCount > 0 ? 'Deleted' : 'Not found', data.deletedCount > 0, data));
  } catch (error) { res.status(500).json(commonResponse('Unable to delete', false)); }
};

export const allCategories = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { skip = '0', limit, populate } = req.query;
    const query = Category.find().skip(parseInt(skip as string));
    if (limit) query.limit(parseInt(limit as string));
    const categories = await query.lean().exec();
    const data = populate !== 'false'
      ? await attachSubCategories(categories as Array<Record<string, unknown>>)
      : categories;
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Categories fetched' : 'No categories', data.length > 0, data));
  } catch (error) { res.status(500).json(commonResponse('Internal server error', false)); }
};

export const searchCategories = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { name, category_id, slug } = req.query;
    const filter: Record<string, unknown> = {};
    if (name) filter.name = { $regex: name, $options: 'i' };
    if (category_id) filter.category_id = category_id;
    if (slug) filter.slug = { $regex: slug, $options: 'i' };
    const data = await Category.find(filter).lean().exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Categories fetched' : 'No categories', data.length > 0, data));
  } catch (error) { res.status(500).json(commonResponse('Internal server error', false)); }
};

export const countCategories = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await Category.countDocuments();
    res.status(200).json(commonResponse('Categories count', true, data));
  } catch (error) { res.status(500).json(commonResponse('Internal server error', false)); }
};
