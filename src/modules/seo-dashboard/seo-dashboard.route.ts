import { Router } from 'express';
import { getSeoDashboard } from './seo-dashboard.controller';
import { adminMiddleware, authorize } from '../../middleware';

const router = Router();

// `seo:read` is held by admin/manager (full access), general and seo.
router.get('/seo/dashboard', adminMiddleware, authorize('seo:read'), getSeoDashboard);

export default router;
