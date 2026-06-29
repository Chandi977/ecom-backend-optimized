import { Router } from 'express';
import { createContactForm, getContactFormData, countContactFormData, updateContactFormStatus } from './contact-form.controller';
import { adminMiddleware, authorize, optionalAuth, validate } from '../../middleware';
import { createContactFormSchema, updateContactStatusSchema } from '../../utils/validators/zod-schemas';

const router = Router();

// optionalAuth lets guests submit while linking the ticket to logged-in users.
router.post('/contact-form/create', optionalAuth, validate(createContactFormSchema), createContactForm);
router.get('/contact/form/get', adminMiddleware, getContactFormData);
router.get('/contact/form/count', adminMiddleware, countContactFormData);
router.patch('/contact/form/:id/status', adminMiddleware, authorize('contact:write'), validate(updateContactStatusSchema), updateContactFormStatus);

export default router;
