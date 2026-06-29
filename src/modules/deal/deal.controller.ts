import { Response } from 'express';
import Deal from '../deal/deal.model';
import { commonResponse } from '../../utils/response';
import { IAuthRequest } from '../../types';

export const createDeal = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { title, description, discountPercentage, products, validFrom, validTo } = req.body;
    if (!title) {
      res.status(400).json(commonResponse('Title is required', false)); return;
    }
    const deal = new Deal({ title, description, discountPercentage, products, isActive: true, validFrom, validTo });
    const savedDeal = await deal.save();
    res.status(201).json(commonResponse('Deal created successfully', true, savedDeal));
  } catch (error) {
    res.status(500).json(commonResponse('An unexpected error occurred', false));
  }
};

export const getDeal = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const data = await Deal.findOne({ _id: id }).populate('products').lean().exec();
    if (data) {
      res.status(200).json(commonResponse('Deal found', true, data));
    } else {
      res.status(404).json(commonResponse('Deal not found', false));
    }
  } catch (error) {
    res.status(500).json(commonResponse('Internal server error', false));
  }
};

export const getAllDeals = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { skip = '0', limit = '10' } = req.query;
    const data = await Deal.find({}).skip(parseInt(skip as string)).limit(parseInt(limit as string)).populate('products').lean().exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Deals found' : 'Deals not found', data.length > 0, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal server error', false));
  }
};

export const updateDeal = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id, title, description, discountPercentage, products, isActive, validFrom, validTo } = req.body;
    if (!id) {
      res.status(400).json(commonResponse('Invalid fields', false)); return;
    }
    const update: Record<string, unknown> = {};
    if (title !== undefined) update.title = title;
    if (description !== undefined) update.description = description;
    if (discountPercentage !== undefined) update.discountPercentage = discountPercentage;
    if (products !== undefined) update.products = products;
    if (isActive !== undefined) update.isActive = isActive;
    if (validFrom !== undefined) update.validFrom = validFrom;
    if (validTo !== undefined) update.validTo = validTo;

    const updatedDeal = await Deal.findOneAndUpdate({ _id: id }, update, { new: true }).exec();
    res.status(updatedDeal ? 200 : 404).json(commonResponse(updatedDeal ? 'Deal updated' : 'Deal not found', !!updatedDeal, updatedDeal || undefined));
  } catch (error) {
    res.status(500).json(commonResponse('Internal server error', false));
  }
};

export const deleteDeal = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.body;
    if (!Array.isArray(id) || id.length === 0) {
      res.status(400).json(commonResponse('Invalid or empty ID array', false)); return;
    }
    const data = await Deal.deleteMany({ _id: { $in: id } }).exec();
    res.status(data.deletedCount > 0 ? 200 : 404).json(commonResponse(data.deletedCount > 0 ? 'Deal(s) deleted' : 'Deal(s) not found for deletion', data.deletedCount > 0, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const countDeals = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await Deal.countDocuments({}).exec();
    res.status(200).json(commonResponse('Deal count', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const allDeals = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { skip = '0', limit, populate } = req.query;
    const query = Deal.find({}).skip(parseInt(skip as string));
    if (limit !== undefined && limit !== null && limit !== '') {
      const parsedLimit = parseInt(limit as string);
      if (!Number.isNaN(parsedLimit)) query.limit(parsedLimit);
    }
    if (populate !== 'false') query.populate('products');
    const data = await query.lean().exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Deals found' : 'No deals found', data.length > 0, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const searchDeals = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { title, discountPercentage } = req.query;
    const query: Record<string, unknown> = {};
    if (title) query.title = { $regex: title, $options: 'i' };
    if (discountPercentage) query.discountPercentage = Number(discountPercentage);

    const data = await Deal.find(query).populate('products').lean().exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Deals found' : 'Deals not found', data.length > 0, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal server error', false));
  }
};
