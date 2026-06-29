import { Response } from 'express';
import Customer from '../customer/customer.model';
import { commonResponse } from '../../utils/response';
import { IAuthRequest } from '../../types';

export const createCustomer = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { name, email, phone, message } = req.body;
  try {
    if (!name || !email) {
      res.status(400).json(commonResponse('Invalid fields', false)); return;
    }
    const customer = new Customer({ name, email, phone, message });
    const data = await customer.save();
    res.status(data ? 201 : 400).json(commonResponse(data ? 'Customer created successfully' : 'Customer not created', !!data, data || undefined));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const getCustomerData = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await Customer.find().sort({ createdAt: -1 }).exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Customers Data fetched' : 'Customers Data not found', data.length > 0, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const countCustomer = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await Customer.countDocuments();
    res.status(200).json(commonResponse('Customers Data count', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal server error', false));
  }
};
