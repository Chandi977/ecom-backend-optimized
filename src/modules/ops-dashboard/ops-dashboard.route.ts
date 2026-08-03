import { Router } from 'express';
import { getOpsDashboard } from './ops-dashboard.controller';
import { adminMiddleware, authorize } from '../../middleware';

const router = Router();

// `analytics:read` is held by admin/manager (full access), general, seo and the
// legacy catalog-manager. Aggregate counters only — no customer records.
router.get('/ops/dashboard', adminMiddleware, authorize('analytics:read'), getOpsDashboard);

export default router;
