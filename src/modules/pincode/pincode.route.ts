import { Router } from 'express';
import {
  createFreight, fetchFreight, fetchOneFreight, updatePincode,
  getPincode, getPincodeById, countPincode, searchPincode,
} from './pincode.controller';
import { adminMiddleware, authorize, validate } from '../../middleware';
import { createFreightSchema, fetchOneFreightSchema, updatePincodeSchema } from '../../utils/validators/zod-schemas';

const router = Router();

// Serviceability/freight WRITES are admin-only (`pincode:write`). They were
// previously unauthenticated; the only callers are the admin Pincode pages, which
// send a Bearer token, so gating them closes a hole without touching any client.
router.post('/freight/create', adminMiddleware, authorize('pincode:write'), validate(createFreightSchema), createFreight);
// All the reads below stay public: the storefront and mobile app call them for
// pincode serviceability and the product-page freight estimate.
router.get('/freight/get', fetchFreight);
router.post('/freight/get/one', validate(fetchOneFreightSchema), fetchOneFreight);
router.get('/pinCode/get/all', getPincode);
router.get('/pinCode/count', countPincode);
router.get('/pinCode/search', searchPincode);
router.put('/pinCode/update', adminMiddleware, authorize('pincode:write'), validate(updatePincodeSchema), updatePincode);
router.get('/pincode/get/:id', getPincodeById);

export default router;
