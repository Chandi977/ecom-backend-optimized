import crypto from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { config } from '../config';
import { IAuthPayload } from '../types';
import { logger } from './logger';
import { strictRedisGet, strictRedisSet, strictRedisSetNx } from './redis';

const ACCESS_TOKEN_EXPIRES_IN = '1d';
const REFRESH_TOKEN_EXPIRES_IN = '10d';

type TokenKind = 'access' | 'refresh';

export interface IAuthTokenPayload extends IAuthPayload, JwtPayload {
  email_address?: string;
  tokenType?: TokenKind;
  jti?: string;
}

export class TokenRevocationStoreError extends Error {
  constructor() {
    super('Token revocation store unavailable');
    this.name = 'TokenRevocationStoreError';
  }
}

const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

const denylistKey = (kind: TokenKind, token: string): string => {
  return `auth:denylist:${kind}:${hashToken(token)}`;
};

export const getTokenTtlSeconds = (payload: JwtPayload): number => {
  if (!payload.exp) return 0;
  return Math.max(payload.exp - Math.floor(Date.now() / 1000), 0);
};

export const signAccessToken = (payload: IAuthPayload): string => {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
};

export const signRefreshToken = (payload: IAuthPayload, emailAddress: string): string => {
  return jwt.sign(
    {
      ...payload,
      email_address: emailAddress,
      tokenType: 'refresh',
      jti: crypto.randomUUID(),
    },
    config.jwt.secret,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
};

export const signAuthTokenPair = (payload: IAuthPayload, emailAddress: string): { token: string; refreshToken: string } => {
  return {
    token: signAccessToken(payload),
    refreshToken: signRefreshToken(payload, emailAddress),
  };
};

export const verifyAccessToken = (token: string): IAuthTokenPayload => {
  return jwt.verify(token, config.jwt.secret) as IAuthTokenPayload;
};

export const verifyRefreshToken = (token: string): IAuthTokenPayload => {
  const payload = jwt.verify(token, config.jwt.secret) as IAuthTokenPayload;
  if (payload.tokenType && payload.tokenType !== 'refresh') {
    throw new Error('Invalid refresh token type');
  }
  if (!payload.email_address) {
    throw new Error('Invalid refresh token payload');
  }
  return payload;
};

let warnedDenylistUnavailable = false;

// Fail OPEN when the revocation store is down: the denylist is defense-in-depth
// for explicit logout/rotation, and a Redis outage must not 503 every
// authenticated request (JWT signature + expiry are still fully enforced).
// This matches the codebase's fail-open stance for locks/caching. Writes
// (blacklistToken / claimRefreshTokenForRotation) stay fail-closed because
// failing open there would let a revoked or replayed token be re-accepted.
export const isTokenDenylisted = async (kind: TokenKind, token: string): Promise<boolean> => {
  try {
    return Boolean(await strictRedisGet(denylistKey(kind, token)));
  } catch (error) {
    if (!warnedDenylistUnavailable) {
      warnedDenylistUnavailable = true;
      logger.warn('Token denylist store unavailable — skipping revocation check (fail-open)', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return false;
  }
};

export const blacklistToken = async (kind: TokenKind, token: string, payload: JwtPayload): Promise<void> => {
  const ttlSeconds = getTokenTtlSeconds(payload);
  if (ttlSeconds <= 0) return;
  try {
    await strictRedisSet(denylistKey(kind, token), '1', ttlSeconds);
  } catch {
    throw new TokenRevocationStoreError();
  }
};

export const claimRefreshTokenForRotation = async (refreshToken: string, payload: JwtPayload): Promise<boolean> => {
  const ttlSeconds = getTokenTtlSeconds(payload);
  if (ttlSeconds <= 0) return false;
  try {
    return strictRedisSetNx(denylistKey('refresh', refreshToken), '1', ttlSeconds);
  } catch {
    throw new TokenRevocationStoreError();
  }
};
