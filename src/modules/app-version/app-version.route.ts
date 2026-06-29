import { Router } from 'express';
import { getAppVersion, createAppVersion, updateAppVersion, getAllAppVersions, deleteAppVersion } from './app-version.controller';
import { adminMiddleware, authorize, validate } from '../../middleware';
import { createAppVersionSchema, updateAppVersionSchema } from '../../utils/validators/zod-schemas';

const router = Router();

router.get('/app-version', getAppVersion);
router.post('/app-version/create', adminMiddleware, authorize('appversion:write'), validate(createAppVersionSchema), createAppVersion);
router.put('/app-version/update/:id', adminMiddleware, authorize('appversion:write'), validate(updateAppVersionSchema), updateAppVersion);
router.get('/app-version/all', adminMiddleware, getAllAppVersions);
router.delete('/app-version/delete/:id', adminMiddleware, authorize('appversion:write'), deleteAppVersion);

export default router;
