import { Router } from 'express';
import { createCustomer, getCustomerData, countCustomer } from './customer.controller';
import { adminMiddleware, validate } from '../../middleware';
import { createCustomerSchema } from '../../utils/validators/zod-schemas';

const router = Router();

router.post('/customer/create', validate(createCustomerSchema), createCustomer);
router.get('/customer/get', adminMiddleware, getCustomerData);
router.get('/customer/count', adminMiddleware, countCustomer);

export default router;
