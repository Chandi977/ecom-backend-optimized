import { Router } from 'express';
import { createCustomPackage, getCustomPackageData, countCustomPackages } from './custom-packaging.controller';
import { adminMiddleware, authorize, validate } from '../../middleware';
import { createCustomPackageSchema } from '../../utils/validators/zod-schemas';

const router = Router();

router.post('/custom-packaging', validate(createCustomPackageSchema), createCustomPackage);
// Custom-packaging enquiries are another tab of the admin Enquiries page — `lead:read`.
router.get('/custom/packaging/get', adminMiddleware, authorize('lead:read'), getCustomPackageData);
router.get('/custom/packaging/count', adminMiddleware, authorize('lead:read'), countCustomPackages);

export default router;
