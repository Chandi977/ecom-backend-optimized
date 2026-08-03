import { Router } from 'express';
import { getMyPermissions } from './permissions.controller';
import { adminMiddleware } from '../../middleware';

const router = Router();

// Any admin-panel role may read its OWN permissions — there is nothing to escalate
// here, and gating it on a permission would deadlock the client's bootstrap.
router.get('/permissions/me', adminMiddleware, getMyPermissions);

export default router;
