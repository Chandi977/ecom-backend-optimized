import { Response } from 'express';
import ProductVariant from './product-variant.model';
import { commonResponse } from '../../utils/response';
import { IAuthRequest } from '../../types';

const DUPLICATE_KEY = 11000;

const isDuplicateKey = (error: unknown): boolean =>
  (error as { code?: number })?.code === DUPLICATE_KEY;

export const createVariant = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { sku, ...rest } = req.body;
    const variant = new ProductVariant({
      ...rest,
      ...(typeof sku === 'string' && sku.trim() ? { sku: sku.trim() } : {}),
    });
    const data = await variant.save();
    res.status(201).json(commonResponse('Variant created', true, data));
  } catch (error) {
    if (isDuplicateKey(error)) {
      res.status(409).json(commonResponse('A variant with this SKU already exists', false));
      return;
    }
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const getVariant = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await ProductVariant.findOne({ _id: req.params.id }).lean().exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Variant found' : 'Not found', !!data, data || undefined));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};

export const updateVariant = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id, sku, ...rest } = req.body;
    const update: Record<string, unknown> = { ...rest };
    if (typeof sku === 'string' && sku.trim()) update.sku = sku.trim();
    const data = await ProductVariant.findOneAndUpdate({ _id: id }, { $set: update }, { new: true }).exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Variant updated' : 'Not found', !!data, data || undefined));
  } catch (error) {
    if (isDuplicateKey(error)) {
      res.status(409).json(commonResponse('A variant with this SKU already exists', false));
      return;
    }
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const deleteVariant = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.body;
    const ids = Array.isArray(id) ? id : [id];
    const data = await ProductVariant.deleteMany({ _id: { $in: ids } }).exec();
    res.status(data.deletedCount > 0 ? 200 : 404).json(commonResponse(data.deletedCount > 0 ? 'Deleted' : 'Not found', data.deletedCount > 0, data));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};

// Lists a product's variants (ordered). An empty list is a valid 200 response —
// most products simply have no variants.
export const getVariantsByProduct = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await ProductVariant.find({ product: req.params.id }).sort({ order: 1, _id: 1 }).lean().exec();
    res.status(200).json(commonResponse('Variants fetched', true, data));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};

export const getAllVariants = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { skip = '0', limit = '100' } = req.query;
    const data = await ProductVariant.find()
      .sort({ order: 1, _id: 1 })
      .skip(parseInt(skip as string))
      .limit(parseInt(limit as string))
      .lean()
      .exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Variants fetched' : 'No variants', data.length > 0, data));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};

export const countVariants = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await ProductVariant.countDocuments();
    res.status(200).json(commonResponse('Count', true, data));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};
