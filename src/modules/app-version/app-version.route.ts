import { Router } from 'express';
import { getAppVersion, createAppVersion, updateAppVersion, getAllAppVersions, deleteAppVersion } from './app-version.controller';
import { adminMiddleware, validate } from '../../middleware';
import { createAppVersionSchema, updateAppVersionSchema } from '../../utils/validators/zod-schemas';

const router = Router();

router.get('/app-version', getAppVersion);
router.post('/app-version/create', adminMiddleware, validate(createAppVersionSchema), createAppVersion);
router.put('/app-version/update/:id', adminMiddleware, validate(updateAppVersionSchema), updateAppVersion);
router.get('/app-version/all', adminMiddleware, getAllAppVersions);
router.delete('/app-version/delete/:id', adminMiddleware, deleteAppVersion);

export default router;
