import { Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import User from '../auth/auth.model';
import Coupon from '../coupon/coupon.model';
import { commonResponse } from '../../utils/response';
import { validateEmail } from '../../utils/validators';
import { hashPassword, comparePassword } from '../../utils/validators/password-hash';
import { IAuthPayload, IAuthRequest } from '../../types';
import { isFullAccessRole, roleCan } from '../../config/rbac';
import { ASSIGNABLE_ROLES } from '../../utils/validators/zod-schemas';
import { logger } from '../../utils/logger';
import { dispatchEmail } from '../../queue/email-dispatch';
import {
  blacklistToken,
  claimRefreshTokenForRotation,
  signAuthTokenPair,
  TokenRevocationStoreError,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../utils/auth-tokens';

const googleClient = new OAuth2Client();

const GOOGLE_AUDIENCE_KEYS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_WEB_CLIENT_ID',
  'GOOGLE_ANDROID_CLIENT_ID',
  'GOOGLE_IOS_CLIENT_ID',
];

const getGoogleAudiences = (): string[] => {
  const values = GOOGLE_AUDIENCE_KEYS.flatMap((key) =>
    String(process.env[key] || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
  );
  return [...new Set(values)];
};

// The user schema stores email_address lowercased; normalize lookups the same
// way so "Foo@Bar.com" typed at login still finds the stored "foo@bar.com".
const normalizeEmail = (email: unknown): string => String(email ?? '').trim().toLowerCase();

const generateVerificationToken = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 6; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
};

const buildAuthPayload = (user: {
  _id: unknown;
  first_name: string;
  last_name: string;
  role: string;
  mobile_number?: string;
  profile_image?: string;
  couponUsed?: string[];
}): IAuthPayload => ({
  id: String(user._id),
  first_name: user.first_name,
  last_name: user.last_name,
  role: user.role,
  mobile_number: user.mobile_number,
  profile_image: user.profile_image,
  couponUsed: user.couponUsed,
});

const buildAuthResponseData = (
  user: { _id: unknown; email_address: string },
  payload: IAuthPayload,
  tokens: { token: string; refreshToken: string }
) => ({
  user: { _id: user._id, email_address: user.email_address, ...payload },
  Token: tokens.token,
  RefreshToken: tokens.refreshToken,
  token: tokens.token,
  refreshToken: tokens.refreshToken,
});

const getBearerToken = (req: IAuthRequest): string | null => {
  const header = req.headers.authorization;
  if (!header) return null;
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
  return parts[1];
};

const getRefreshTokenFromBody = (body: Record<string, unknown>): string | null => {
  const token = body.refreshToken || body.RefreshToken;
  return typeof token === 'string' && token.trim() ? token : null;
};

// Defence in depth: the zod schemas already constrain `role`, but role assignment is
// the one field that escalates privilege, so it is re-checked before it is persisted.
const isAssignableRole = (role: unknown): boolean =>
  typeof role === 'string' && (ASSIGNABLE_ROLES as readonly string[]).includes(role);

const sendRevocationStoreUnavailable = (res: Response): void => {
  res.status(503).json(commonResponse('Authentication revocation store unavailable. Please try again later.', false));
};

export const signup = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { first_name, last_name, password, mobile_number, role, gender, user_id } = req.body;
    const email_address = normalizeEmail(req.body.email_address);

    const existingUser = await User.findOne({ email_address }).exec();
    if (existingUser) {
      res.status(403).json(commonResponse('User already exists.', false));
      return;
    }

    // Security: public signups can only create plain users. If the admin UI asks
    // for a privileged role, fail loudly instead of silently creating a normal user.
    const requestedRole = role || 'user';
    if (!isAssignableRole(requestedRole)) {
      res.status(400).json(commonResponse(`Invalid role. Expected one of: ${ASSIGNABLE_ROLES.join(', ')}.`, false));
      return;
    }
    if (requestedRole !== 'user' && !isFullAccessRole(req.userRole)) {
      res.status(req.userRole ? 403 : 401).json(
        commonResponse('Only an admin or manager can create staff accounts.', false)
      );
      return;
    }
    const assignedRole = isFullAccessRole(req.userRole) ? requestedRole : 'user';

    const verificationToken = generateVerificationToken();
    const hashedPassword = await hashPassword(password);

    const newUser = new User({
      first_name, last_name, email_address, password: hashedPassword,
      mobile_number, role: assignedRole, gender, user_id,
      verification_token: verificationToken,
      verification_token_expiry: new Date(Date.now() + 3600000),
    });

    const savedUser = await newUser.save();

    const emailSent = await dispatchEmail('send-verification-email', {
      to: savedUser.email_address,
      subject: 'Email verification OTP',
      token: verificationToken,
    });
    if (!emailSent) {
      logger.error('Signup verification email could not be delivered', { email: savedUser.email_address });
    }

    // Never echo the password hash or the verification OTP back to the client —
    // returning the token would let anyone verify without reading the email.
    const safeUser = {
      _id: savedUser._id,
      first_name: savedUser.first_name,
      last_name: savedUser.last_name,
      email_address: savedUser.email_address,
      mobile_number: savedUser.mobile_number,
      role: savedUser.role,
      gender: savedUser.gender,
      isVerified: savedUser.isVerified,
      createdAt: savedUser.createdAt,
    };

    res.status(201).json(commonResponse('User created successfully', true, safeUser));
  } catch (error) {
    logger.error('Signup error', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal server error.', false));
  }
};

export const signIn = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    const email_address = normalizeEmail(req.body.email_address);

    const user = await User.findOne({ email_address }).exec();
    if (!user) {
      res.status(401).json(commonResponse('Email not registered. Please Sign Up.', false));
      return;
    }

    if (!user.isVerified) {
      res.status(401).json(commonResponse('User is not verified. Please verify your account.', false));
      return;
    }

    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      res.status(401).json(commonResponse('Password is incorrect.', false));
      return;
    }

    const payload = buildAuthPayload(user);
    const tokens = signAuthTokenPair(payload, email_address);

    res.status(200).json(commonResponse('Sign-in successful', true, buildAuthResponseData(user, payload, tokens)));
  } catch (error) {
    logger.error('Signin error', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(401).json(commonResponse('Authentication failed', false));
  }
};

export const googleAuth = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { credential } = req.body;
    if (!credential) {
      res.status(400).json(commonResponse('Google credential is required.', false));
      return;
    }

    const audiences = getGoogleAudiences();
    if (audiences.length === 0) {
      res.status(500).json(commonResponse('Google OAuth is not configured.', false));
      return;
    }

    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: audiences });
    const payload = ticket.getPayload()!;
    const { email, given_name, family_name, picture, sub: googleId } = payload;

    let user = await User.findOne({ email_address: email }).exec();

    if (!user) {
      const randomPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
      const hashedPassword = await hashPassword(randomPassword);

      user = new User({
        first_name: given_name || 'User',
        last_name: family_name || '',
        email_address: email,
        password: hashedPassword,
        googleId,
        profile_image: picture,
        isVerified: true,
        authProvider: 'google',
      });

      await user.save();

      await dispatchEmail('send-welcome-email', {
        to: user.email_address,
        subject: 'Welcome to Prem Industries',
        name: user.first_name,
      });
    } else {
      if (!user.googleId) {
        user.googleId = googleId;
        user.authProvider = user.authProvider || 'google';
        user.profile_image = user.profile_image || picture;
        await user.save();
      }
    }

    const payload2 = buildAuthPayload(user);
    const tokens = signAuthTokenPair(payload2, user.email_address);

    res.status(200).json(commonResponse('Google sign-in successful', true, buildAuthResponseData(user, payload2, tokens)));
  } catch (error) {
    logger.error('Google auth error', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(401).json(commonResponse('Google authentication failed.', false));
  }
};

export const refreshAuthToken = async (req: IAuthRequest, res: Response): Promise<void> => {
  const refreshToken = getRefreshTokenFromBody((req.body || {}) as Record<string, unknown>);
  if (!refreshToken) {
    res.status(400).json(commonResponse('Refresh token is required.', false));
    return;
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    res.status(401).json(commonResponse('Invalid or expired refresh token.', false));
    return;
  }

  try {
    const claimed = await claimRefreshTokenForRotation(refreshToken, decoded);
    if (!claimed) {
      res.status(401).json(commonResponse('Refresh token has already been used or revoked.', false));
      return;
    }

    const user = await User.findOne({ _id: decoded.id, email_address: decoded.email_address }).exec();
    if (!user) {
      res.status(401).json(commonResponse('Invalid refresh token.', false));
      return;
    }

    if (!user.isVerified) {
      res.status(401).json(commonResponse('User is not verified. Please verify your account.', false));
      return;
    }

    const payload = buildAuthPayload(user);
    const tokens = signAuthTokenPair(payload, user.email_address);

    res.status(200).json(commonResponse('Token refreshed successfully', true, buildAuthResponseData(user, payload, tokens)));
  } catch (error) {
    if (error instanceof TokenRevocationStoreError) {
      sendRevocationStoreUnavailable(res);
      return;
    }
    logger.error('Refresh token error', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json(commonResponse('Internal server error.', false));
  }
};

export const logout = async (req: IAuthRequest, res: Response): Promise<void> => {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json(commonResponse('Access denied. No token provided.', false));
    return;
  }

  try {
    const decoded = verifyAccessToken(token);
    await blacklistToken('access', token, decoded);

    const refreshToken = getRefreshTokenFromBody((req.body || {}) as Record<string, unknown>);
    if (refreshToken) {
      const refreshDecoded = verifyRefreshToken(refreshToken);
      await blacklistToken('refresh', refreshToken, refreshDecoded);
    }

    res.status(200).json(commonResponse('Logout successful', true));
  } catch (error) {
    if (error instanceof TokenRevocationStoreError) {
      sendRevocationStoreUnavailable(res);
      return;
    }
    res.status(401).json(commonResponse('Invalid or expired token.', false));
  }
};

export const userStats = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const stats = await User.aggregate([
      { $match: { role: 'user' } },
      { $group: { _id: { month: { $month: '$createdAt' } }, numberofdocuments: { $sum: 1 } } },
      { $project: { _id: false, month: { $arrayElemAt: [['', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'], '$_id.month'] }, numberofdocuments: true } },
    ]).exec();

    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const result = months.map((m) => stats.find((s: any) => s.month === m)?.numberofdocuments || 0);

    res.status(200).json(commonResponse('done', true, result));
  } catch (error) {
    res.status(500).json(commonResponse('An error occurred', false));
  }
};

export const totalUsers = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { skip = '0', limit } = req.query;
    const query = User.find({ role: 'user' }).skip(parseInt(skip as string, 10));
    if (limit) query.limit(parseInt(limit as string, 10));
    const data = await query.lean().exec();
    res.status(data.length > 0 ? 200 : 404).json(
      commonResponse(data.length > 0 ? 'Users list fetched' : 'No users found', data.length > 0, data)
    );
  } catch (error) {
    res.status(500).json(commonResponse('Internal server error', false));
  }
};

export const changePassword = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id, password } = req.body;
    if (!id) { res.status(403).json(commonResponse('id not found', false)); return; }
    const hashedPassword = await hashPassword(password);
    const data = await User.findOneAndUpdate({ _id: id }, { password: hashedPassword }).exec();
    res.status(data ? 200 : 400).json(commonResponse(data ? 'password changed' : 'password not changed', !!data, data || undefined));
  } catch (error) {
    res.status(500).json(commonResponse('An error occurred', false));
  }
};

export const editUser = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { first_name, last_name, email_address, mobile_number, role, id, user_id, contact_address } = req.body;
    if (!id) { res.status(403).json(commonResponse('id not found', false)); return; }
    // Full-access roles (admin, manager) may edit any account; everyone else only
    // their own. Editing OTHER people's records stays deliberately narrow — the
    // customer-facing admin pages gate their edit controls on `user:write`.
    if (!isFullAccessRole(req.userRole) && req.user !== id) { res.status(403).json(commonResponse('Forbidden', false)); return; }
    if (email_address && !validateEmail(email_address)) { res.status(400).json(commonResponse('Invalid email', false)); return; }

    const update: Record<string, unknown> = {};
    if (first_name !== undefined) update.first_name = first_name;
    if (last_name !== undefined) update.last_name = last_name;
    if (email_address !== undefined) update.email_address = email_address;
    if (mobile_number !== undefined) update.mobile_number = mobile_number;
    if (contact_address !== undefined) update.contact_address = contact_address;
    if (req.userRole === 'admin') {
      // The admin form posts the current role back as free text, so '' means "not
      // supplied" and is left unchanged; anything else must be a real role. Same
      // enum guard as signup — never let an arbitrary string become a role.
      if (role !== undefined && role !== '') {
        if (!isAssignableRole(role)) {
          res.status(400).json(commonResponse(`Invalid role. Expected one of: ${ASSIGNABLE_ROLES.join(', ')}.`, false));
          return;
        }
        update.role = role;
      }
      if (user_id !== undefined) update.user_id = user_id;
    }

    const data = await User.findOneAndUpdate({ _id: id }, update, { new: true, runValidators: true }).exec();
    res.status(data ? 200 : 400).json(commonResponse(data ? 'user updated' : 'user not updated', !!data, data || undefined));
  } catch (error) {
    res.status(500).json(commonResponse('An error occurred', false));
  }
};

export const specificuser = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) { res.status(403).json(commonResponse('id not found', false)); return; }
    // Any role holding customer:read may open a customer's detail page (the admin
    // Customers list links straight here); otherwise callers see only themselves.
    if (!roleCan(req.userRole, 'customer:read') && req.user !== id) { res.status(403).json(commonResponse('Forbidden', false)); return; }
    const data = await User.findOne({ _id: id }).exec();
    res.status(data ? 200 : 400).json(commonResponse(data ? 'user found' : 'user not found', !!data, data || undefined));
  } catch (error) {
    res.status(403).json(commonResponse('Error', false));
  }
};

export const getPrivacyPreferences = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user).select('privacyPreferences').exec();
    if (!user) { res.status(404).json(commonResponse('User not found', false)); return; }
    res.status(200).json(commonResponse('Privacy preferences fetched', true, user.privacyPreferences));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const updatePrivacyPreferences = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const allowed = ['emailNotifications', 'smsNotifications', 'personalizedRecommendations', 'usageAnalytics'] as const;
    // Dot-notation $set updates only the supplied toggles, leaving the rest untouched.
    const update: Record<string, boolean> = {};
    for (const key of allowed) {
      if (typeof req.body[key] === 'boolean') update[`privacyPreferences.${key}`] = req.body[key];
    }
    if (Object.keys(update).length === 0) { res.status(400).json(commonResponse('No valid preferences provided', false)); return; }

    const data = await User.findByIdAndUpdate(req.user, { $set: update }, { new: true, runValidators: true }).select('privacyPreferences').exec();
    res.status(data ? 200 : 404).json(commonResponse(data ? 'Privacy preferences updated' : 'User not found', !!data, data?.privacyPreferences ?? undefined));
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const deleteUser = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.body;
    const ids = Array.isArray(id) ? id : [id];
    const data = await User.deleteMany({ _id: { $in: ids } }).exec();
    res.status(data.deletedCount > 0 ? 200 : 400).json(
      commonResponse(data.deletedCount > 0 ? 'User deleted' : 'User not found', data.deletedCount > 0, data)
    );
  } catch (error) {
    res.status(500).json(commonResponse('Internal Server Error', false));
  }
};

export const searchUsers = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { name, email, number, role, city, zipcode, createdAt } = req.query;
    const query: Record<string, unknown> = {};
    if (name) query.first_name = { $regex: name, $options: 'i' };
    if (email) query.email_address = { $regex: email, $options: 'i' };
    if (number) query.mobile_number = { $regex: number, $options: 'i' };
    if (role) query.role = { $regex: role, $options: 'i' };

    const data = await User.find(query).lean().exec();
    res.status(data.length > 0 ? 200 : 400).json(
      commonResponse(data.length > 0 ? 'users list fetched' : 'users not found', data.length > 0, data)
    );
  } catch (error) {
    res.status(500).json(commonResponse('Internal server error', false));
  }
};

export const CountUsers = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await User.countDocuments({ role: 'user' });
    res.status(200).json(commonResponse('users count fetched', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal server error', false));
  }
};

export const Allusers = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { skip = '0', limit = '10' } = req.query;
    const data = await User.find({ role: 'user' }).skip(parseInt(skip as string, 10)).limit(parseInt(limit as string, 10)).sort({ createdAt: -1 }).lean().exec();
    res.status(200).json(commonResponse('users list fetched', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal server error', false));
  }
};

export const AllAdminRoles = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { skip = '0', limit = '10' } = req.query;
    const data = await User.find({ role: { $ne: 'user' } }).skip(parseInt(skip as string, 10)).limit(parseInt(limit as string, 10)).sort({ createdAt: -1 }).lean().exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Non-user roles fetched' : 'Not found', data.length > 0, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal server error', false));
  }
};

export const totalAdmin = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { skip = '0', limit } = req.query;
    const query = User.find({ role: { $ne: 'user' } }).skip(parseInt(skip as string, 10));
    if (limit) query.limit(parseInt(limit as string, 10));
    const data = await query.lean().exec();
    res.status(data.length > 0 ? 200 : 404).json(commonResponse(data.length > 0 ? 'Admin list fetched' : 'No admin found', data.length > 0, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal server error', false));
  }
};

export const CountAdmin = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const data = await User.countDocuments({ role: { $ne: 'user' } });
    res.status(200).json(commonResponse('users count fetched', true, data));
  } catch (error) {
    res.status(500).json(commonResponse('Internal server error', false));
  }
};

export const verifyEmail = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { otp } = req.body;
    const email_address = normalizeEmail(req.body.email_address);
    if (!email_address || !otp) { res.status(400).json({ message: 'Email and OTP are required' }); return; }
    const user = await User.findOne({ email_address }).exec();
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }
    if (String(user.verification_token).toLowerCase() !== String(otp).toLowerCase()) { res.status(400).json({ message: 'Invalid OTP' }); return; }
    if (user.verification_token_expiry && user.verification_token_expiry < new Date()) { res.status(400).json({ message: 'OTP expired' }); return; }
    user.isVerified = true; await user.save();
    res.status(200).json({ message: 'OTP verified successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const reVerifyEmail = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const email = normalizeEmail(req.body.email);
    const user = await User.findOne({ email_address: email }).exec();
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }
    if (user.isVerified) { res.status(200).json({ message: 'User already verified' }); return; }
    const verificationToken = generateVerificationToken();
    user.verification_token = verificationToken;
    user.verification_token_expiry = new Date(Date.now() + 3600000);
    await user.save();

    const emailSent = await dispatchEmail('send-verification-email', {
      to: user.email_address,
      subject: 'Email verification OTP',
      token: verificationToken,
    });
    if (!emailSent) {
      res.status(502).json({ message: 'Could not send the verification email. Please try again.' });
      return;
    }

    res.status(200).json({ message: 'Verification token sent' });
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const updateField = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const result = await User.updateMany({}, { $set: { isVerified: true } });
    res.status(200).json({ success: true, message: `Updated ${result.modifiedCount} users` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const updateCouponCode = async (req: IAuthRequest, res: Response): Promise<void> => {
  try {
    const { userId, couponCode } = req.body;
    if (!userId || !couponCode) { res.status(400).json({ error: 'userId and couponCode are required' }); return; }

    // Only the authenticated caller may mark their own coupon as used, never another
    // user's. Guards against one person burning another user's single-use coupon.
    if (String(req.user) !== String(userId)) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }

    const normalizedCode = String(couponCode).toUpperCase();

    const user = await User.findOneAndUpdate(
      { _id: userId },
      { $addToSet: { couponUsed: normalizedCode } },
      { new: true },
    ).exec();
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    // Increment the coupon's real usage counter so usageLimit can be enforced.
    const coupon = await Coupon.findOne({ couponCode: normalizedCode }).lean().exec();
    if (coupon) {
      await Coupon.updateOne({ couponCode: normalizedCode }, { $inc: { usedCount: 1 } }).exec();
    }

    res.status(200).json({ message: 'Coupon added successfully', success: true });
  } catch (error) {
    res.status(500).json({ error: 'An error occurred' });
  }
};
