// ═══════════════════════════════════════════════════════════════
// authorize — permission gates, assumed to run AFTER authenticate.
//
//   authorize('users.read')                    — single permission
//   authorize(['users.read', 'users.write'])   — ALL of these
//   authorizeAny(['users.read', 'users.write'])— AT LEAST ONE
//   authorizeRole('admin')                     — by role code
//   authorizeRoleAny(['admin', 'instructor'])  — any role match
//
// Missing req.user → 401 UNAUTHENTICATED (defensive; pairs with
// authenticate which should have short-circuited).
// User present but permission missing → 403 FORBIDDEN.
// ═══════════════════════════════════════════════════════════════

import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { AppError } from '../errors/app-error';

type PermissionInput = string | readonly string[];

const toArray = (p: PermissionInput): readonly string[] => (Array.isArray(p) ? p : [p as string]);

const requireUser = (req: Request): NonNullable<Request['user']> => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
  }
  return req.user;
};

/**
 * Require the user to hold *all* of the given permissions.
 * `authorize('users.read')` is shorthand for `authorize(['users.read'])`.
 */
export const authorize = (required: PermissionInput): RequestHandler => {
  const needed = toArray(required);
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const user = requireUser(req);
      const missing = needed.filter((p) => !user.permissions.includes(p));
      if (missing.length > 0) {
        throw new AppError(
          `Missing required permission${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
          403,
          'FORBIDDEN',
          { required: needed, missing }
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

/** Require at least one of the given permissions. */
export const authorizeAny = (options: readonly string[]): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const user = requireUser(req);
      const matched = options.some((p) => user.permissions.includes(p));
      if (!matched) {
        throw new AppError(
          `Requires at least one of: ${options.join(', ')}`,
          403,
          'FORBIDDEN',
          { requiredAny: options }
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

/** Require the user to hold one of the given role codes. */
export const authorizeRole = (role: string | readonly string[]): RequestHandler => {
  const accepted = toArray(role);
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const user = requireUser(req);
      const matched = accepted.some((r) => user.roles.includes(r));
      if (!matched) {
        throw new AppError(
          `Requires role: ${accepted.join(' or ')}`,
          403,
          'FORBIDDEN',
          { requiredRoles: accepted, userRoles: user.roles }
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};
