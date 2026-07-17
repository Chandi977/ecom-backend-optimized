import { Router } from 'express';
import { createLead, adminCreateLead, getLeads, getLead, countLeads, updateLead, addLeadActivity, importLeads, verifyLeadEmail } from './lead.controller';
import { adminMiddleware, authorize, optionalAuth, validate } from '../../middleware';
import { createLeadSchema, adminCreateLeadSchema, updateLeadSchema, addLeadActivitySchema, importLeadsSchema } from '../../utils/validators/zod-schemas';

const router = Router();

// optionalAuth lets guests submit while linking the lead to logged-in users.
router.post('/lead/create', optionalAuth, validate(createLeadSchema), createLead);
router.get('/lead/get', adminMiddleware, getLeads);
router.get('/lead/count', adminMiddleware, countLeads);
// Bulk CSV import of historical leads (admin) — registered before the :id
// routes so "import" is never treated as an id.
router.post('/lead/import', adminMiddleware, authorize('contact:write'), validate(importLeadsSchema), importLeads);
// Manual lead creation from the CRM (admin) — no email is sent.
router.post('/lead/admin-create', adminMiddleware, authorize('contact:write'), validate(adminCreateLeadSchema), adminCreateLead);
router.get('/lead/:id', adminMiddleware, getLead);
// On-demand deliverability check (real MX lookup) for a single lead.
router.post('/lead/:id/verify-email', adminMiddleware, authorize('contact:write'), verifyLeadEmail);
// CRM update: contact/enquiry fields, pipeline status, owner, follow-up, notes.
router.patch('/lead/:id', adminMiddleware, authorize('contact:write'), validate(updateLeadSchema), updateLead);
// Log an interaction on the lead's timeline (optionally moves status/follow-up).
router.post('/lead/:id/activity', adminMiddleware, authorize('contact:write'), validate(addLeadActivitySchema), addLeadActivity);

export default router;
