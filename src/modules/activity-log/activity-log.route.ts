import { Router } from 'express';
import { getActivityLogs, getActivitySummary } from './activity-log.controller';
import { adminMiddleware, authorize } from '../../middleware';

const router = Router();

// Analytics is for full-access admins only. `authorize('analytics:read')` blocks
// restricted roles (e.g. catalog-manager) while full-access roles bypass.
router.get('/activity/logs', adminMiddleware, authorize('analytics:read'), getActivityLogs);
router.get('/activity/summary', adminMiddleware, authorize('analytics:read'), getActivitySummary);

export default router;
