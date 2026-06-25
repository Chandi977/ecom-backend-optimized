import { Response } from 'express';
import Brand from '../brand/brand.model';
import { commonResponse } from '../../utils/response';
import slugify from 'slugify';
import { IAuthRequest } from '../../types';

export const createBrand = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { name, brand_id, image } = req.body;
    if (!name) { res.status(400).json(commonResponse('Name is required', false)); return; }
    const brand = new Brand({ name, slug: slugify(name), brand_id, image });
    const data = await brand.save();
    res.status(201).json(commonResponse('Brand created', true, data));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};

export const getBrands = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { skip = '0', limit = '10' } = req.query;
    const data = await Brand.find().skip(parseInt(skip as string)).limit(parseInt(limit as string)).lean().exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Brands fetched' : 'No brands', data.length > 0, data));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};

export const getBrand = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await Brand.findOne({ _id: req.params.id }).lean().exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Brand found' : 'Not found', !!data, data || undefined));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};

export const updateBrand = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id, name, brand_id, image } = req.body;
    const data = await Brand.findOneAndUpdate({ _id: id }, { name, slug: slugify(name), brand_id, image }).exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Brand updated' : 'Not found', !!data, data || undefined));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const deleteBrand = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.body;
    const data = await Brand.deleteMany({ _id: { $in: id } }).exec();
    res.status(data.deletedCount > 0 ? 200 : 404).json(commonResponse(data.deletedCount > 0 ? 'Deleted' : 'Not found', data.deletedCount > 0, data));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const getAllBrands = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await Brand.find().lean().exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Brands fetched' : 'No brands', data.length > 0, data));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const searchBrand = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { name } = req.query;
    const filter: Record<string, unknown> = {};
    if (name) filter.name = { $regex: name, $options: 'i' };
    const data = await Brand.find(filter).lean().exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Brands fetched' : 'No brands', data.length > 0, data));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};

export const countBrands = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await Brand.countDocuments();
    res.status(200).json(commonResponse('Count', true, data));
  } catch (error) { res.status(500).json(commonResponse('Error', false)); }
};
