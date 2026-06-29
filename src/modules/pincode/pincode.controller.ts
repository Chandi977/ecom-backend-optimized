import { Response } from 'express';
import Pincode from '../pincode/pincode.model';
import { commonResponse } from '../../utils/response';
import { IAuthRequest } from '../../types';

export const createFreight = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { pincode, deliveryAvailable, codAvailable, estimatedDays, freight } = req.body;
    if (!pincode) {
      res.status(400).json(commonResponse('Invalid fields', false)); return;
    }
    const newPincode = new Pincode({ pincode, deliveryAvailable, codAvailable, estimatedDays, freight });
    const savedPincode = await newPincode.save();
    res.status(201).json(commonResponse('Pincode created successfully', true, savedPincode));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const fetchFreight = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { skip = '0', limit } = req.query;
    const query = Pincode.find().skip(parseInt(skip as string, 10));
    if (limit !== undefined && limit !== null && limit !== '') {
      const parsedLimit = parseInt(limit as string, 10);
      if (!Number.isNaN(parsedLimit)) query.limit(parsedLimit);
    }
    const pincodeData = await query.lean().exec();
    res.status(200).json(commonResponse('Pincode data fetched successfully', true, pincodeData));
  } catch (error) {
    res.status(500).json(commonResponse('Internal server error', false));
  }
};

export const fetchOneFreight = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { pincode, packweight } = req.body;
  try {
    const normalizedPincode = String(pincode).trim();
    const matchingData = await Pincode.findOne({
      $expr: { $eq: [{ $toString: '$pincode' }, normalizedPincode] },
    }).lean().exec();
    if (matchingData) {
      let shippingCost = 0;
      const roundedPackweight = Math.ceil(Number(packweight) || 0);
      if (matchingData.freight) {
        shippingCost = matchingData.freight * roundedPackweight;
      }
      res.json({
        success: true,
        pincode: matchingData.pincode,
        deliveryAvailable: matchingData.deliveryAvailable !== false,
        codAvailable: Boolean(matchingData.codAvailable),
        estimatedDays: matchingData.estimatedDays,
        shippingCost,
      });
    } else {
      res.status(200).json({
        success: false,
        message: 'Data not found for the provided PIN',
        deliveryAvailable: false,
        shippingCost: 0,
      });
    }
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown' });
  }
};

export const getPincode = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { skip = '0', limit } = req.query;
    const query = Pincode.find().skip(parseInt(skip as string, 10));
    if (limit !== undefined && limit !== null && limit !== '') {
      const parsedLimit = parseInt(limit as string, 10);
      if (!Number.isNaN(parsedLimit)) query.limit(parsedLimit);
    }
    const data = await query.lean().exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Pincode found' : 'Pincode not found', data.length > 0, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const countPincode = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await Pincode.countDocuments();
    res.status(200).json(commonResponse('Pincode count', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const searchPincode = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { pincode } = req.query;
    const query: Record<string, unknown> = {};
    if (pincode) query.pincode = { $regex: String(pincode), $options: 'i' };
    const data = await Pincode.find(query).lean().exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Pincode(s) found' : 'Pincode not found', data.length > 0, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const updatePincode = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { _id, pincode, deliveryAvailable, codAvailable, estimatedDays, freight } = req.body;
    const data = await Pincode.findOneAndUpdate(
      { _id },
      { pincode, deliveryAvailable, codAvailable, estimatedDays, freight },
      { new: true }
    ).exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Pincode updated successfully' : 'Pincode not found', !!data, data || undefined));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const getPincodeById = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const data = await Pincode.findOne({ _id: id }).lean().exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Pincode found' : 'Pincode not found', !!data, data || undefined));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};
