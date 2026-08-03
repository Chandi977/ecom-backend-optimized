import { Router } from 'express';
import { createCustomer, getCustomerData, countCustomer } from './customer.controller';
import { adminMiddleware, authorize, validate } from '../../middleware';
import { createCustomerSchema } from '../../utils/validators/zod-schemas';

const router = Router();

router.post('/customer/create', validate(createCustomerSchema), createCustomer);
// "Customer" here is a customer-QUERY submission (name/email/phone/message), one of
// the tabs on the admin Enquiries page — so it takes the same `lead:read` gate.
router.get('/customer/get', adminMiddleware, authorize('lead:read'), getCustomerData);
router.get('/customer/count', adminMiddleware, authorize('lead:read'), countCustomer);

export default router;
