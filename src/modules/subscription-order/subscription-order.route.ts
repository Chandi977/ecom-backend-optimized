import { Router } from 'express';
import { createSubscriptionOrder } from './subscription-order.controller';
import { validate } from '../../middleware';
import { createSubscriptionOrderSchema } from '../../utils/validators/zod-schemas';

const router = Router();

router.post('/subscription-order', validate(createSubscriptionOrderSchema), createSubscriptionOrder);

export default router;
