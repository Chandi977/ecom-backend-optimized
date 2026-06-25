import { Response } from 'express';
import SubCategory from '../subcategory/subcategory.model';
import { commonResponse } from '../../utils/response';
import slugify from 'slugify';
import { IAuthRequest } from '../../types';
import { parseOptionalGstRate } from '../../utils/gst-rate';

export const createSubCategory = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { name, category, sub_category_id, gst } = req.body;
    if (!name) { res.status(400).json(commonResponse('Name is required', false)); return; }
    const parsedGst = parseOptionalGstRate(gst);
    const subCategory = new SubCategory({
      name,
      slug: slugify(name),
      category,
      sub_category_id,
      ...(parsedGst !== undefined ? { gst: parsedGst } : {}),
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
    const { id, name, category, sub_category_id, gst } = req.body;
    const update: Record<string, unknown> = { name, slug: slugify(name), category };
    if (sub_category_id !== undefined) update.sub_category_id = sub_category_id;
    const parsedGst = parseOptionalGstRate(gst);
    if (parsedGst !== undefined) update.gst = parsedGst;
    const data = await SubCategory.findOneAndUpdate({ _id: id }, update).exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Updated' : 'Not found', !!data, data || undefined));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const deleteSubCategory = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.body;
    const data = await SubCategory.deleteMany({ _id: { $in: id } }).exec();
    res.status(data.deletedCount > 0 ? 200 : 404).json(commonResponse(data.deletedCount > 0 ? 'Deleted' : 'Not found', data.deletedCount > 0, data));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const getAllSubCategories = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await SubCategory.find().populate('category').lean().exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Fetched' : 'None', data.length > 0, data));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const searchSubCategory = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { name } = req.query;
    const filter: Record<string, unknown> = {};
    if (name) filter.name = { $regex: name, $options: 'i' };
    const data = await SubCategory.find(filter).lean().exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Fetched' : 'None', data.length > 0, data));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const countSubCategories = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await SubCategory.countDocuments();
    res.status(200).json(commonResponse('Count', true, data));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};
