import { Response } from 'express';
import SubscriptionOrder from '../subscription-order/subscription-order.model';
import { commonResponse } from '../../utils/response';
import { IAuthRequest } from '../../types';

export const createSubscriptionOrder = async (req: IAuthRequest, res: Response): Promise<void> => {
  const { email, product, quantity, frequency } = req.body;
  try {
    if (!email || !product || !quantity || !frequency) {
      res.status(400).json(commonResponse('Invalid fields', false)); return;
    }
    const subscriptionOrder = new SubscriptionOrder({ email, product, quantity, frequency });
    const data = await subscriptionOrder.save();
    res.status(data ? 201 : 400).json(commonResponse(data ? 'Subscription Order created successfully' : 'Subscription Order not created', !!data, data || undefined));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};
