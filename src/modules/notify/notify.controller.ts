import { Response } from 'express';
import Notify from '../notify/notify.model';
import { commonResponse } from '../../utils/response';
import { IAuthRequest } from '../../types';

export const createNotify = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { product_id, email_address } = req.body;
    if (!product_id || !email_address) {
      res.status(400).json(commonResponse('Invalid fields', false)); return;
    }
    const notify = new Notify({ product_id, email_address });
    const data = await notify.save();
    res.status(data ? 201 : 400).json(commonResponse(data ? 'Notify created successfully' : 'Notify not created', !!data, data || undefined));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const getNotify = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { skip = '0', limit = '10', populate } = req.query;
    const query = Notify.find().sort({ createdAt: -1 }).skip(parseInt(skip as string, 10)).limit(parseInt(limit as string, 10));
    if (populate !== 'false') query.populate('product_id');
    const data = await query.lean().exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Notify found' : 'Notify not found', data.length > 0, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const countNotifies = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await Notify.countDocuments();
    res.status(200).json(commonResponse('Notify count', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};
