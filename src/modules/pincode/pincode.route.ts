import { Router } from 'express';
import {
  createFreight, fetchFreight, fetchOneFreight, updatePincode,
  getPincode, getPincodeById, countPincode, searchPincode,
} from './pincode.controller';
import { validate } from '../../middleware';
import { createFreightSchema, fetchOneFreightSchema, updatePincodeSchema } from '../../utils/validators/zod-schemas';

const router = Router();

router.post('/freight/create', validate(createFreightSchema), createFreight);
router.get('/freight/get', fetchFreight);
router.post('/freight/get/one', validate(fetchOneFreightSchema), fetchOneFreight);
router.get('/pinCode/get/all', getPincode);
router.get('/pinCode/count', countPincode);
router.get('/pinCode/search', searchPincode);
router.put('/pinCode/update', validate(updatePincodeSchema), updatePincode);
router.get('/pincode/get/:id', getPincodeById);

export default router;
