// ═══════════════════════════════════════════════════════════════
// authorizeSelfOr — "global permission OR own-scope permission if
// the target belongs to the caller."
//
// Usage:
//
//   router.get(
//     '/:id',
//     authorizeSelfOr({
//       globalPermission: 'user_profile.read',
//       ownPermission:    'user_profile.read.own',
//       resolveTargetUserId: async (req) => {
//         const profile = await service.getUserProfileById(
//           Number(req.params.id)
//         );
//         return profile ? profile.userId : null;
//       }
//     }),
//     ...
//   );
//
// Contract:
//   1. Requires req.user (assumes `authenticate` ran first).
//   2. If the caller holds the global permission → pass unconditionally.
//   3. Else if the caller holds the own permission AND the resolved
//      target user id matches req.user.id → pass.
//   4. Otherwise → 403 FORBIDDEN.
//
// If resolveTargetUserId returns null (e.g. the target record does
// not exist) the middleware falls through to 403. The downstream
// handler is then free to surface a 404 via its own lookup if the
// caller does hold the global permission.
// ═══════════════════════════════════════════════════════════════

import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { AppError } from '../errors/app-error';

export interface AuthorizeSelfOrOptions {
  /** Permission that lets the caller act on *any* record. */
  globalPermission: string;
  /** Permission that lets the caller act only on rows they own. */
  ownPermission: string;
  /**
   * Resolve which user id owns the target record for this request.
   * Return null if the target cannot be resolved — the middleware
   * will then fall through to 403 (unless the caller has the global
   * permission, in which case that branch already short-circuited).
   */
  resolveTargetUserId: (req: Request) => Promise<number | null> | number | null;
}

const requireUser = (req: Request): NonNullable<Request['user']> => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
  }
  return req.user;
};

export const authorizeSelfOr = (
  options: AuthorizeSelfOrOptions
): RequestHandler => {
  const { globalPermission, ownPermission, resolveTargetUserId } = options;

  return async (
    req: Request,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = requireUser(req);

      // ── Fast path: global permission ────────────────────────
      if (user.permissions.includes(globalPermission)) {
        return next();
      }

      // ── Own-scope path ──────────────────────────────────────
      if (!user.permissions.includes(ownPermission)) {
        throw new AppError(
          `Missing required permission: ${globalPermission} or ${ownPermission}`,
          403,
          'FORBIDDEN',
          {
            requiredAny: [globalPermission, ownPermission]
          }
        );
      }

      const targetUserId = await Promise.resolve(resolveTargetUserId(req));
      if (targetUserId == null || targetUserId !== user.id) {
        throw new AppError(
          `Forbidden: ${ownPermission} only grants access to your own record`,
          403,
          'FORBIDDEN',
          {
            requiredAny: [globalPermission, ownPermission],
            scope: 'own'
          }
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};
