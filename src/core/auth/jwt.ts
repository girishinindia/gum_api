// ═══════════════════════════════════════════════════════════════
// JWT sign / verify helpers.
//
// Claim shape (JwtPayload in auth.types):
//   sub          — user id (bigint → number, safe up to 2^53)
//   email        — user email (lowercased)
//   roles[]      — role codes the user holds
//   permissions[]— permission codes the user holds
//   jti          — session identifier (UUID). Minted at login and
//                  PRESERVED across refresh so session-level revocation
//                  (redisRevoked.add(jti, ttl)) kills the whole session
//                  in one operation.
//   ati          — access-token identifier (UUID). Minted FRESH on every
//                  call to signAccessToken, guaranteeing every issuance
//                  is uniquely identifiable even when refresh fires
//                  inside the same clock second as the previous one.
//                  Required for commercial audit / per-issuance revoke
//                  (see comment in auth.types.ts for the full rationale).
//                  Refresh tokens do NOT carry ati — their uniqueness is
//                  already provided by jti + long expiry, and keeping
//                  them ati-free preserves the "refresh token may be
//                  returned unchanged" contract.
//   iat / exp    — standard JWT timestamps (added by jsonwebtoken)
//
// Access tokens are short-lived (env.JWT_ACCESS_EXPIRES_IN, e.g. 15m).
// Refresh tokens are long-lived (env.JWT_REFRESH_EXPIRES_IN, e.g. 7d).
// They use *different* secrets so leaking one does not compromise the
// other.
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';

import jwt, { type JwtPayload as RawJwtPayload, type SignOptions } from 'jsonwebtoken';

import { env } from '../../config/env';
import { AppError } from '../errors/app-error';
import type { AuthUser, JwtPayload, TokenPair } from '../types/auth.types';

// ─── Sign ────────────────────────────────────────────────────

interface SignInput {
  user: Pick<AuthUser, 'id' | 'email' | 'roles' | 'permissions'>;
  jti?: string; // Allow caller to provide a session id; otherwise we mint one.
}

export const signAccessToken = (
  { user, jti }: SignInput
): { token: string; jti: string; ati: string } => {
  const sessionId = jti ?? crypto.randomUUID();
  // Mint a fresh access-token id on EVERY call. This is what makes
  // refresh-within-the-same-second produce a distinguishable token,
  // and it is what production auth systems (Auth0, Okta, Cognito) rely
  // on to attach audit logs to a specific issuance rather than to the
  // whole session.
  const accessTokenId = crypto.randomUUID();
  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: user.id,
    email: user.email,
    roles: user.roles,
    permissions: user.permissions,
    jti: sessionId,
    ati: accessTokenId
  };
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn']
  };
  const token = jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
  return { token, jti: sessionId, ati: accessTokenId };
};

export const signRefreshToken = ({ user, jti }: SignInput): { token: string; jti: string } => {
  const sessionId = jti ?? crypto.randomUUID();
  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: user.id,
    email: user.email,
    roles: user.roles,
    permissions: user.permissions,
    jti: sessionId
  };
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn']
  };
  const token = jwt.sign(payload, env.JWT_REFRESH_SECRET, options);
  return { token, jti: sessionId };
};

/**
 * Sign an access+refresh pair that share the same `jti`. This is the
 * idiomatic login flow: one session id lets us revoke both tokens in
 * one operation, because revocation keys by jti.
 */
export const signTokenPair = (
  user: Pick<AuthUser, 'id' | 'email' | 'roles' | 'permissions'>
): TokenPair & { jti: string } => {
  const jti = crypto.randomUUID();
  const { token: accessToken } = signAccessToken({ user, jti });
  const { token: refreshToken } = signRefreshToken({ user, jti });
  return {
    accessToken,
    refreshToken,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    jti
  };
};

// ─── Verify ──────────────────────────────────────────────────

/**
 * Verify + decode. Maps the two common jsonwebtoken error classes to
 * typed AppError so the terminal error handler renders them as clean
 * 401 envelopes. Anything else is rethrown as a 500.
 */
const verify = (token: string, secret: string): JwtPayload => {
  try {
    const decoded = jwt.verify(token, secret) as RawJwtPayload | string;
    if (typeof decoded === 'string' || decoded === null) {
      throw new AppError('Invalid token payload', 401, 'INVALID_TOKEN');
    }
    // jsonwebtoken returns the exact payload we signed, plus iat/exp.
    // Cast through unknown because the @types/jsonwebtoken JwtPayload
    // only declares the standard claims, not our custom fields.
    const payload = decoded as unknown as JwtPayload;
    if (
      typeof payload.sub !== 'number' ||
      typeof payload.email !== 'string' ||
      !Array.isArray(payload.roles) ||
      !Array.isArray(payload.permissions) ||
      typeof payload.jti !== 'string'
    ) {
      throw new AppError('Malformed token payload', 401, 'INVALID_TOKEN');
    }
    return payload;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError('Token has expired', 401, 'TOKEN_EXPIRED');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new AppError('Invalid token', 401, 'INVALID_TOKEN');
    }
    throw err;
  }
};

export const verifyAccessToken = (token: string): JwtPayload =>
  verify(token, env.JWT_ACCESS_SECRET);

export const verifyRefreshToken = (token: string): JwtPayload =>
  verify(token, env.JWT_REFRESH_SECRET);

/**
 * Compute the seconds remaining until a decoded payload's `exp`.
 * Useful when adding a jti to the revocation list — we only need
 * to keep the entry alive until the token would have expired anyway.
 */
export const secondsUntilExpiry = (payload: JwtPayload): number => {
  if (!payload.exp) return 0;
  const now = Math.floor(Date.now() / 1000);
  return Math.max(payload.exp - now, 0);
};
