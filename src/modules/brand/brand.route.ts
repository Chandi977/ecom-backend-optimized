import { Router } from 'express';
import { createBrand, getBrands, getBrand, updateBrand, deleteBrand, getAllBrands, searchBrand, countBrands } from './brand.controller';
import { adminMiddleware, authorize, validate } from '../../middleware';
import { createBrandSchema, updateBrandSchema, deleteBrandSchema } from '../../utils/validators/zod-schemas';

const router = Router();

router.post('/brand/create', adminMiddleware, authorize('brand:write'), validate(createBrandSchema), createBrand);
router.get('/brand/get', getBrands);
router.get('/brand/get/:id', getBrand);
router.put('/brand/update', adminMiddleware, authorize('brand:write'), validate(updateBrandSchema), updateBrand);
router.post('/brand/delete', adminMiddleware, authorize('brand:write'), validate(deleteBrandSchema), deleteBrand);
router.get('/brand/all', getAllBrands);
router.get('/brand/search', searchBrand);
router.get('/brand/count', countBrands);

export default router;
