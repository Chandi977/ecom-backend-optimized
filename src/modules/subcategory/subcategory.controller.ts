import { Response } from 'express';
import SubCategory from '../subcategory/subcategory.model';
import Product from '../product/product.model';
import Category from '../category/category.model';
import { commonResponse } from '../../utils/response';
import slugify from 'slugify';
import { IAuthRequest } from '../../types';
import { parseOptionalGstRate } from '../../utils/gst-rate';
import { sanitizeCommonAttributes } from '../../utils/category-attributes';
import { sanitizeSeoContent } from '../../utils/seo-content';

export const createSubCategory = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { name, category, sub_category_id, gst, hsn_code, sac_code, tax_category, delivery_time, common_attributes, pack_sizes, seo_content } = req.body;
    if (!name) { res.status(400).json(commonResponse('Name is required', false)); return; }
    const parsedGst = parseOptionalGstRate(gst);
    const subCategory = new SubCategory({
      name,
      slug: slugify(name),
      category,
      sub_category_id,
      ...(parsedGst !== undefined ? { gst: parsedGst } : {}),
      ...(hsn_code !== undefined ? { hsn_code } : {}),
      ...(sac_code !== undefined ? { sac_code } : {}),
      ...(tax_category !== undefined ? { tax_category } : {}),
      ...(delivery_time !== undefined ? { delivery_time } : {}),
      ...(common_attributes !== undefined ? { common_attributes: sanitizeCommonAttributes(common_attributes) } : {}),
      ...(pack_sizes !== undefined ? { pack_sizes } : {}),
      ...(seo_content !== undefined ? { seo_content: sanitizeSeoContent(seo_content) } : {}),
    });
    const data = await subCategory.save();
    res.status(201).json(commonResponse('SubCategory created', true, data));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};

export const getSubCategories = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { skip = '0', limit = '10' } = req.query;
    const data = await SubCategory.find().skip(parseInt(skip as string)).limit(parseInt(limit as string)).lean().exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Fetched' : 'None', data.length > 0, data));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};

export const getSubCategory = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await SubCategory.findOne({ _id: req.params.id }).lean().exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Found' : 'Not found', !!data, data || undefined));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};

export const updateSubCategory = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id, name, category, sub_category_id, gst, hsn_code, sac_code, tax_category, delivery_time, common_attributes, pack_sizes, seo_content } = req.body;
    const existing = await SubCategory.findById(id).lean().exec();
    if (!existing) { res.status(404).json(commonResponse('Not found', false)); return; }

    const update: Record<string, unknown> = {};
    if (name !== undefined) {
      update.name = name;
      update.slug = slugify(name);
    }
    if (category !== undefined) update.category = category;
    const productUpdate: Record<string, unknown> = {};
    if (sub_category_id !== undefined) update.sub_category_id = sub_category_id;
    const parsedGst = parseOptionalGstRate(gst);
    if (parsedGst !== undefined) {
      update.gst = parsedGst;
      productUpdate.gst = parsedGst;
    }
    if (hsn_code !== undefined) {
      update.hsn_code = hsn_code;
      productUpdate.hsn_code = hsn_code;
    }
    if (sac_code !== undefined) {
      update.sac_code = sac_code;
      productUpdate.sac_code = sac_code;
    }
    if (tax_category !== undefined) {
      update.tax_category = tax_category;
      productUpdate.tax_category = tax_category;
    }
    if (delivery_time !== undefined) {
      update.delivery_time = delivery_time;
      productUpdate.delivery_time = delivery_time;
    }
    if (common_attributes !== undefined) update.common_attributes = sanitizeCommonAttributes(common_attributes);
    if (pack_sizes !== undefined) update.pack_sizes = pack_sizes;
    if (seo_content !== undefined) update.seo_content = sanitizeSeoContent(seo_content);
    const data = await SubCategory.findOneAndUpdate({ _id: id }, update, { new: true }).lean().exec();
    if (!data) { res.status(404).json(commonResponse('Not found', false)); return; }

    let productsUpdated = 0;
    if (Object.keys(productUpdate).length > 0) {
      const productScopes: Record<string, unknown>[] = [{ sub_category: data._id }];
      const legacyMatches = [
        { name: existing.name },
        { slug: existing.slug },
        { name: data.name },
        { slug: data.slug },
      ].filter((match) => Object.values(match)[0]);
      const legacyCategory = await Category.findOne({
        _id: { $ne: data.category },
        $or: legacyMatches,
      }).select('_id').lean().exec();

      if (legacyCategory?._id) productScopes.push({ category: legacyCategory._id });

      const productResult = await Product.updateMany(
        { $or: productScopes },
        { $set: productUpdate },
      ).exec();
      productsUpdated = productResult.modifiedCount ?? productResult.matchedCount ?? 0;
    }

    res.status(200).json(commonResponse('Updated', true, {
      subCategory: data,
      productsUpdated,
    }));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const deleteSubCategory = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.body;
    const ids = Array.isArray(id) ? id : [id];
    const data = await SubCategory.deleteMany({ _id: { $in: ids } }).exec();
    res.status(data.deletedCount > 0 ? 200 : 404).json(commonResponse(data.deletedCount > 0 ? 'Deleted' : 'Not found', data.deletedCount > 0, data));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const getAllSubCategories = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const subCategories = await SubCategory.find().populate('category').lean().exec();
    const data = await Promise.all(
      subCategories.map(async (subcat) => {
        let product = await Product.findOne({ sub_category: subcat._id })
          .populate('media')
          .select('images media')
          .lean()
          .exec();

        if (!product) {
          const parentCategory: any = subcat.category;
          const parentCategoryId = parentCategory?._id || subcat.category;
          const escapeRegex = (string: string) => string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
          const legacyCategory = await Category.findOne({
            _id: { $ne: parentCategoryId },
            $or: [
              { name: { $regex: new RegExp('^' + escapeRegex(subcat.name), 'i') } },
              { slug: { $regex: new RegExp('^' + escapeRegex(subcat.slug), 'i') } }
            ]
          }).lean().exec();

          if (legacyCategory) {
            product = await Product.findOne({ category: legacyCategory._id })
              .populate('media')
              .select('images media')
              .lean()
              .exec();
          }
        }

        const media = product?.media as any;
        const firstImg = product?.images?.[0] as any;
        const productImage = media?.thumbnail || firstImg?.image || firstImg || null;
        return {
          ...subcat,
          productImage,
        };
      })
    );
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Fetched' : 'None', data.length > 0, data));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const searchSubCategory = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { name } = req.query;
    const filter: Record<string, unknown> = {};
    if (name) filter.name = { $regex: name, $options: 'i' };
    const subCategories = await SubCategory.find(filter).lean().exec();
    const data = await Promise.all(
      subCategories.map(async (subcat) => {
        let product = await Product.findOne({ sub_category: subcat._id })
          .populate('media')
          .select('images media')
          .lean()
          .exec();

        if (!product) {
          const parentCategory: any = subcat.category;
          const parentCategoryId = parentCategory?._id || subcat.category;
          const escapeRegex = (string: string) => string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
          const legacyCategory = await Category.findOne({
            _id: { $ne: parentCategoryId },
            $or: [
              { name: { $regex: new RegExp('^' + escapeRegex(subcat.name), 'i') } },
              { slug: { $regex: new RegExp('^' + escapeRegex(subcat.slug), 'i') } }
            ]
          }).lean().exec();

          if (legacyCategory) {
            product = await Product.findOne({ category: legacyCategory._id })
              .populate('media')
              .select('images media')
              .lean()
              .exec();
          }
        }

        const media = product?.media as any;
        const firstImg = product?.images?.[0] as any;
        const productImage = media?.thumbnail || firstImg?.image || firstImg || null;
        return {
          ...subcat,
          productImage,
        };
      })
    );
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Fetched' : 'None', data.length > 0, data));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const countSubCategories = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await SubCategory.countDocuments();
    res.status(200).json(commonResponse('Count', true, data));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};
