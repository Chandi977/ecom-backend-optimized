import { Router } from 'express';
import {
  signup, signIn, googleAuth, Allusers, userStats, searchUsers, CountUsers,
  deleteUser, specificuser, editUser, changePassword, totalUsers,
  AllAdminRoles, totalAdmin, CountAdmin, verifyEmail, updateField,
  reVerifyEmail, updateCouponCode, refreshAuthToken, logout,
  getPrivacyPreferences, updatePrivacyPreferences,
} from './auth.controller';
import { adminMiddleware, userMiddleware, validate } from '../../middleware';
import {
  signupSchema, signinSchema, googleAuthSchema, refreshAuthSchema,
  logoutSchema, deleteUserSchema, editUserSchema, changePasswordSchema,
  verifyEmailSchema, reVerifyEmailSchema, updateVerifiedSchema,
  addCouponToUserSchema, updatePrivacyPreferencesSchema,
} from '../../utils/validators/zod-schemas';

const router = Router();

router.post('/signup', validate(signupSchema), signup);
router.post('/signin', validate(signinSchema), signIn);
router.post('/auth/google', validate(googleAuthSchema), googleAuth);
router.post('/auth/refresh', validate(refreshAuthSchema), refreshAuthToken);
router.post('/auth/logout', validate(logoutSchema), logout);
router.get('/allCustomers', adminMiddleware, Allusers);
router.get('/userStats', adminMiddleware, userStats);
router.get('/searchusers', adminMiddleware, searchUsers);
router.get('/countUsers', adminMiddleware, CountUsers);
router.post('/deleteUser', adminMiddleware, validate(deleteUserSchema), deleteUser);
router.get('/getuser/:id', userMiddleware, specificuser);
router.get('/user/privacy-preferences', userMiddleware, getPrivacyPreferences);
router.put('/user/privacy-preferences', userMiddleware, validate(updatePrivacyPreferencesSchema), updatePrivacyPreferences);
router.post('/edituser', userMiddleware, validate(editUserSchema), editUser);
router.post('/adminPass', adminMiddleware, validate(changePasswordSchema), changePassword);
router.get('/totalUsers', adminMiddleware, totalUsers);
router.get('/all/admin', adminMiddleware, AllAdminRoles);
router.get('/all/admin/list', adminMiddleware, totalAdmin);
router.get('/count/admin', adminMiddleware, CountAdmin);
router.post('/verify/email', validate(verifyEmailSchema), verifyEmail);
router.put('/update/verified', adminMiddleware, validate(updateVerifiedSchema), updateField);
router.post('/re/verify/email', validate(reVerifyEmailSchema), reVerifyEmail);
router.post('/add/coupon', userMiddleware, validate(addCouponToUserSchema), updateCouponCode);

export default router;
