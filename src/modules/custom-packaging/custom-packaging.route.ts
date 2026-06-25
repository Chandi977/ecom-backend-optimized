import { Router } from 'express';
import { createCustomPackage, getCustomPackageData, countCustomPackages } from './custom-packaging.controller';
import { adminMiddleware, validate } from '../../middleware';
import { createCustomPackageSchema } from '../../utils/validators/zod-schemas';

const router = Router();

router.post('/custom-packaging', validate(createCustomPackageSchema), createCustomPackage);
router.get('/custom/packaging/get', adminMiddleware, getCustomPackageData);
router.get('/custom/packaging/count', adminMiddleware, countCustomPackages);

export default router;
