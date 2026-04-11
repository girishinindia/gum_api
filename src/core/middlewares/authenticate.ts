// ═══════════════════════════════════════════════════════════════
// authenticate — turn a Bearer access token into req.user.
//
// Contract:
//   1. Extract the token from the Authorization header
//        (`Authorization: Bearer <token>`). Missing / malformed → 401.
//   2. Verify signature + expiration using JWT_ACCESS_SECRET.
//        Expired → 401 TOKEN_EXPIRED.
//        Bad signature / malformed → 401 INVALID_TOKEN.
//   3. Check the jti against the Redis revocation list.
//        Revoked → 401 TOKEN_REVOKED.
//   4. Attach the AuthUser payload to req.user and call next().
//
// This middleware is deliberately thin: it does NOT re-fetch
// permissions from the database on every request. Permissions are
// baked into the short-lived access token (15 min by default) and
// revocation is handled by the blocklist, so we avoid a DB round-trip
// on every authenticated call.
// ═══════════════════════════════════════════════════════════════

import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { redisRevoked } from '../../database/redis';
import { verifyAccessToken } from '../auth/jwt';
import { AppError } from '../errors/app-error';
import type { AuthUser } from '../types/auth.types';

const BEARER_PREFIX = /^Bearer\s+/i;

const extractToken = (req: Request): string => {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') {
    throw AppError.unauthorized('Missing Authorization header');
  }
  if (!BEARER_PREFIX.test(header)) {
    throw AppError.unauthorized('Authorization header must be "Bearer <token>"');
  }
  const token = header.replace(BEARER_PREFIX, '').trim();
  if (!token) {
    throw AppError.unauthorized('Missing bearer token');
  }
  return token;
};

export const authenticate: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);
    const payload = verifyAccessToken(token);

    // Per-session revocation check
    if (await redisRevoked.isRevoked(payload.jti ?? '')) {
      throw new AppError('Token has been revoked', 401, 'TOKEN_REVOKED');
    }

    const user: AuthUser = {
      id: payload.sub,
      email: payload.email,
      firstName: null,
      lastName: null,
      roles: payload.roles,
      permissions: payload.permissions
    };
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Optional variant — decode the token if present but do not require
 * it. Handy for endpoints that personalize their response for logged-
 * in users but are still reachable anonymously.
 */
export const authenticateOptional: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const header = req.headers.authorization;
    if (!header || !BEARER_PREFIX.test(header)) {
      return next();
    }
    // Fall through to the strict authenticator's logic
    const token = header.replace(BEARER_PREFIX, '').trim();
    if (!token) return next();

    const payload = verifyAccessToken(token);
    if (await redisRevoked.isRevoked(payload.jti ?? '')) {
      return next();
    }
    req.user = {
      id: payload.sub,
      email: payload.email,
      firstName: null,
      lastName: null,
      roles: payload.roles,
      permissions: payload.permissions
    };
    next();
  } catch {
    // Soft-fail: bad token on an optional route is just "anonymous".
    next();
  }
};
