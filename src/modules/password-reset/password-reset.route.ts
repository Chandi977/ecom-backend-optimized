import { Router } from 'express';
import { forgotPassword, verifyOTP, resetPassword } from './password-reset.controller';
import { validate } from '../../middleware';
import { forgotPasswordSchema, verifyOTPSchema, resetPasswordSchema } from '../../utils/validators/zod-schemas';

const router = Router();

router.post('/reset/password/otp', validate(forgotPasswordSchema), forgotPassword);
router.post('/reset/password/verify/otp', validate(verifyOTPSchema), verifyOTP);
router.post('/reset/password/update', validate(resetPasswordSchema), resetPassword);

export default router;
