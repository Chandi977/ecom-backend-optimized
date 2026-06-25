import { Response } from 'express';
import CustomPackaging from '../custom-packaging/custom-packaging.model';
import { commonResponse } from '../../utils/response';
import { IAuthRequest } from '../../types';

export const createCustomPackage = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { name, email, phone, description } = req.body;
  try {
    if (!name || !email || !phone || !description) {
      res.status(400).json(commonResponse('Invalid fields', false)); return;
    }
    const customPackage = new CustomPackaging({ name, email, phone, description });
    const data = await customPackage.save();
    res.status(data ? 201 : 400).json(commonResponse(data ? 'Custom packaging created successfully' : 'Custom packaging not created', !!data, data || undefined));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const getCustomPackageData = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await CustomPackaging.find().sort({ createdAt: -1 }).exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Custom Form Data fetched' : 'Custom Form Data not found', data.length > 0, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const countCustomPackages = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await CustomPackaging.countDocuments();
    res.status(200).json(commonResponse('Custom Form Data count', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal server error', false));
  }
};
