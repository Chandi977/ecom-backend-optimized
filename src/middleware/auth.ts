import { Response, NextFunction } from 'express';
import { commonResponse } from '../utils/response';
import { IAuthRequest, IAuthPayload } from '../types';
import { isTokenDenylisted, TokenRevocationStoreError, verifyAccessToken } from '../utils/auth-tokens';

const extractToken = (req: IAuthRequest): string | null => {
  const header = req.headers.authorization;
  if (!header) return null;

  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;

  return parts[1];
};

const verifyToken = async (token: string): Promise<IAuthPayload> => {
  const decoded = verifyAccessToken(token);
  if (await isTokenDenylisted('access', token)) {
    throw new Error('Token has been revoked');
  }
  return decoded;
};

const fullName = (decoded: IAuthPayload): string =>
  [decoded.first_name, decoded.last_name].filter(Boolean).join(' ').trim();

const sendAuthError = (
  res: Response,
  error: unknown,
  fallbackMessage = 'Invalid or expired token.'
): void => {
  if (error instanceof TokenRevocationStoreError) {
    res.status(503).json(commonResponse('Authentication revocation store unavailable. Please try again later.', false));
    return;
  }
  res.status(401).json(commonResponse(fallbackMessage, false));
};

export const userMiddleware = (
  req: IAuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json(commonResponse('Access denied. No token provided.', false));
    return;
  }

  verifyToken(token).then((decoded) => {
    req.user = decoded.id;
    req.userRole = decoded.role;
    req.userName = fullName(decoded);
    next();
  }).catch((error) => sendAuthError(res, error));
};

export const adminMiddleware = (
  req: IAuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json(commonResponse('Access denied. No token provided.', false));
    return;
  }

  verifyToken(token).then((decoded) => {
    req.user = decoded.id;
    req.userRole = decoded.role;
    req.userName = fullName(decoded);

    if (decoded.role === 'user') {
      res.status(403).json(commonResponse('Access denied. Admin only.', false));
      return;
    }

    next();
  }).catch((error) => sendAuthError(res, error));
};

export const optionalAuth = (
  req: IAuthRequest,
  _res: Response,
  next: NextFunction
): void => {
  const token = extractToken(req);

  if (!token) {
    next();
    return;
  }

  verifyToken(token).then((decoded) => {
    req.user = decoded.id;
    req.userRole = decoded.role;
    req.userName = fullName(decoded);
    next();
  }).catch(() => {
    // Invalid auth should not make public endpoints fail.
    next();
  });
};
