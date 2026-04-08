import { NextFunction, Request, Response } from 'express';

import { AppError } from '../errors/app-error';
import { verifyAccessToken } from '../utils/jwt';
import { redisSession } from '../../database/redis';

/**
 * Auth middleware — verifies JWT AND checks Redis session is still active.
 *
 * Why both checks?
 *   JWT verification alone is stateless — a valid access token keeps working
 *   even after password/email/mobile change or logout. By also checking Redis,
 *   we can immediately invalidate all tokens when redisSession.revoke() is called.
 *
 * Flow:
 *   1. Extract Bearer token from Authorization header
 *   2. Verify JWT signature + expiry (fast, no I/O)
 *   3. Check Redis for active session (ensures token hasn't been revoked)
 *   4. Attach user payload to req.user
 */
export const authMiddleware = async (req: Request, _res: Response, next: NextFunction) => {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return next(new AppError('Authorization token is required', 401, 'UNAUTHORIZED'));
  }

  const token = authorization.slice(7);

  try {
    const payload = verifyAccessToken(token);

    // Check if user's session is still active in Redis.
    // After password/email/mobile change or logout, redisSession.revoke()
    // deletes the key — so this check will fail, forcing re-login.
    const activeSession = await redisSession.get(String(payload.userId));
    if (!activeSession) {
      return next(new AppError(
        'Session has been revoked. Please login again.',
        401,
        'SESSION_REVOKED'
      ));
    }

    req.user = payload;
    next();
  } catch (error) {
    // If it's already an AppError (from session check above), pass it through
    if (error instanceof AppError) {
      return next(error);
    }
    next(new AppError('Invalid or expired access token', 401, 'UNAUTHORIZED'));
  }
};
