import { Router } from 'express';
import { trackSearch, trackProductView, getDemandSignals } from './demand-signal.controller';
import { adminMiddleware, authorize, optionalAuth } from '../../middleware';

const router = Router();

// Public tracking endpoints — optionalAuth links the signal to a logged-in customer
// when a token is present, but anonymous customers are tracked too.
router.post('/demand/track/search', optionalAuth, trackSearch);
router.post('/demand/track/view', optionalAuth, trackProductView);

// Admin-only aggregated view (restricted roles like catalog-manager are blocked).
router.get('/demand/signals', adminMiddleware, authorize('analytics:read'), getDemandSignals);

export default router;
