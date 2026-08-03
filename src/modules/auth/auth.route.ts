import { Router } from 'express';
import {
  signup, signIn, googleAuth, Allusers, userStats, searchUsers, CountUsers,
  deleteUser, specificuser, editUser, changePassword, totalUsers,
  AllAdminRoles, totalAdmin, CountAdmin, verifyEmail, updateField,
  reVerifyEmail, updateCouponCode, refreshAuthToken, logout,
  getPrivacyPreferences, updatePrivacyPreferences,
} from './auth.controller';
import { adminMiddleware, authorize, optionalAuth, userMiddleware, validate } from '../../middleware';
import {
  signupSchema, signinSchema, googleAuthSchema, refreshAuthSchema,
  logoutSchema, deleteUserSchema, editUserSchema, changePasswordSchema,
  verifyEmailSchema, reVerifyEmailSchema, updateVerifiedSchema,
  addCouponToUserSchema, updatePrivacyPreferencesSchema,
} from '../../utils/validators/zod-schemas';

const router = Router();

// optionalAuth lets the controller honor a requested role ONLY when an authenticated
// full-access admin makes the call; anonymous/public signups are forced to 'user'.
router.post('/signup', optionalAuth, validate(signupSchema), signup);
router.post('/signin', validate(signinSchema), signIn);
router.post('/auth/google', validate(googleAuthSchema), googleAuth);
router.post('/auth/refresh', validate(refreshAuthSchema), refreshAuthToken);
router.post('/auth/logout', validate(logoutSchema), logout);
// Storefront-customer listings + stats. `customer:read` is held by admin, manager,
// general and catalog-manager — but NOT by `seo`, which has no business reading
// customer PII. The shared legacy Dashboard reads /countUsers + /userStats, and
// every role that renders it holds the grant (the `seo` role gets SeoDashboard).
router.get('/allCustomers', adminMiddleware, authorize('customer:read'), Allusers);
router.get('/userStats', adminMiddleware, authorize('customer:read'), userStats);
router.get('/searchusers', adminMiddleware, authorize('customer:read'), searchUsers);
router.get('/countUsers', adminMiddleware, authorize('customer:read'), CountUsers);
router.post('/deleteUser', adminMiddleware, authorize('user:write'), validate(deleteUserSchema), deleteUser);
router.get('/getuser/:id', userMiddleware, specificuser);
router.get('/user/privacy-preferences', userMiddleware, getPrivacyPreferences);
router.put('/user/privacy-preferences', userMiddleware, validate(updatePrivacyPreferencesSchema), updatePrivacyPreferences);
router.post('/edituser', userMiddleware, validate(editUserSchema), editUser);
router.post('/adminPass', adminMiddleware, authorize('user:write'), validate(changePasswordSchema), changePassword);
router.get('/totalUsers', adminMiddleware, authorize('customer:read'), totalUsers);
// Staff-account listings (every user whose role is not `user`). `user:read` is held
// only by admin/manager, so restricted roles cannot enumerate the admin team.
router.get('/all/admin', adminMiddleware, authorize('user:read'), AllAdminRoles);
router.get('/all/admin/list', adminMiddleware, authorize('user:read'), totalAdmin);
router.get('/count/admin', adminMiddleware, authorize('user:read'), CountAdmin);
router.post('/verify/email', validate(verifyEmailSchema), verifyEmail);
router.put('/update/verified', adminMiddleware, authorize('user:write'), validate(updateVerifiedSchema), updateField);
router.post('/re/verify/email', validate(reVerifyEmailSchema), reVerifyEmail);
router.post('/add/coupon', userMiddleware, validate(addCouponToUserSchema), updateCouponCode);

export default router;
