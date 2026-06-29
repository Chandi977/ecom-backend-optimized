import { Response } from 'express';
import AttributeDefinition from './attribute.model';
import { commonResponse } from '../../utils/response';
import { IAuthRequest } from '../../types';

const DUPLICATE_KEY = 11000;

const isDuplicateKey = (error: unknown): boolean =>
  (error as { code?: number })?.code === DUPLICATE_KEY;

export const createAttribute = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { key, ...rest } = req.body;
    const attribute = new AttributeDefinition({ key: String(key).trim(), ...rest });
    const data = await attribute.save();
    res.status(201).json(commonResponse('Attribute created', true, data));
  } catch (error) {
    if (isDuplicateKey(error)) {
      res.status(409).json(commonResponse('An attribute with this key already exists', false));
      return;
    }
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const getAttributes = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { skip = '0', limit = '50' } = req.query;
    const data = await AttributeDefinition.find()
      .sort({ order: 1, key: 1 })
      .skip(parseInt(skip as string))
      .limit(parseInt(limit as string))
      .lean()
      .exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Attributes fetched' : 'No attributes', data.length > 0, data));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};

export const getAttribute = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await AttributeDefinition.findOne({ _id: req.params.id }).lean().exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Attribute found' : 'Not found', !!data, data || undefined));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};

export const updateAttribute = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id, ...rest } = req.body;
    const update: Record<string, unknown> = { ...rest };
    if (typeof update.key === 'string') update.key = update.key.trim();
    const data = await AttributeDefinition.findOneAndUpdate({ _id: id }, { $set: update }, { new: true }).exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Attribute updated' : 'Not found', !!data, data || undefined));
  } catch (error) {
    if (isDuplicateKey(error)) {
      res.status(409).json(commonResponse('An attribute with this key already exists', false));
      return;
    }
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const deleteAttribute = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.body;
    const ids = Array.isArray(id) ? id : [id];
    const data = await AttributeDefinition.deleteMany({ _id: { $in: ids } }).exec();
    res.status(data.deletedCount > 0 ? 200 : 404).json(commonResponse(data.deletedCount > 0 ? 'Deleted' : 'Not found', data.deletedCount > 0, data));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};

export const getAllAttributes = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await AttributeDefinition.find().sort({ order: 1, key: 1 }).lean().exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Attributes fetched' : 'No attributes', data.length > 0, data));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};

// Drives dynamic spec forms/filters for a category. Returns active attributes
// scoped to the category, ordered. An empty list is a valid 200 response (the
// category simply has no attributes configured yet), not a 404.
export const getAttributesByCategory = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await AttributeDefinition.find({ categories: req.params.id, isActive: true })
      .sort({ order: 1, key: 1 })
      .lean()
      .exec();
    res.status(200).json(commonResponse('Attributes fetched', true, data));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};

export const getAttributesBySubCategory = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await AttributeDefinition.find({ sub_categories: req.params.id, isActive: true })
      .sort({ order: 1, key: 1 })
      .lean()
      .exec();
    res.status(200).json(commonResponse('Attributes fetched', true, data));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};

export const countAttributes = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await AttributeDefinition.countDocuments();
    res.status(200).json(commonResponse('Count', true, data));
  } catch (error) { res.status(500).json(commonResponse('Internal Server Error', false)); }
};
