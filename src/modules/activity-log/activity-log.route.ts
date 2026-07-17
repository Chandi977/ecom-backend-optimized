import { Router } from 'express';
import { getActivityLogs, getActivitySummary } from './activity-log.controller';
import { adminMiddleware, authorize } from '../../middleware';

const router = Router();

// Analytics is limited to full admins and restricted roles explicitly granted
// `analytics:read` (currently catalog-manager).
router.get('/activity/logs', adminMiddleware, authorize('analytics:read'), getActivityLogs);
router.get('/activity/summary', adminMiddleware, authorize('analytics:read'), getActivitySummary);

export default router;
