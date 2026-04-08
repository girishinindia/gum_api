import { NextFunction, Request, Response } from 'express';

import { AppError } from '../errors/app-error';
import { db } from '../../database/db';

// ─── Types ──────────────────────────────────────────────────

interface PermissionCheckRow {
  has_permission: boolean;
}

// ─── Authorize Middleware ────────────────────────────────────

/**
 * RBAC permission gate.
 * Checks if the authenticated user has the required permission code
 * via their assigned roles (calls udf_user_has_permission).
 *
 * Must be used AFTER authMiddleware (requires req.user).
 *
 * @example
 * router.post('/roles', authMiddleware, authorize('role.create'), controller.create);
 * router.delete('/users/:id', authMiddleware, authorize('user.delete'), controller.delete);
 */
export const authorize = (permissionCode: string) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = req.user;

      if (!user || !user.userId) {
        return next(
          new AppError('Authentication required', 401, 'UNAUTHORIZED')
        );
      }

      // Call the UDF to check permission
      const result = await db.queryOne<PermissionCheckRow>(
        'SELECT udf_user_has_permission($1, $2) AS has_permission',
        [user.userId, permissionCode]
      );

      if (!result?.has_permission) {
        return next(
          new AppError(
            'You do not have permission to perform this action',
            403,
            'FORBIDDEN'
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// ─── Multi-Permission Helpers ───────────────────────────────

/**
 * Require ALL of the listed permissions.
 *
 * @example
 * router.put('/roles/:id/permissions', authMiddleware, authorizeAll('role.update', 'permission.read'), controller.update);
 */
export const authorizeAll = (...permissionCodes: string[]) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = req.user;

      if (!user || !user.userId) {
        return next(
          new AppError('Authentication required', 401, 'UNAUTHORIZED')
        );
      }

      for (const code of permissionCodes) {
        const result = await db.queryOne<PermissionCheckRow>(
          'SELECT udf_user_has_permission($1, $2) AS has_permission',
          [user.userId, code]
        );

        if (!result?.has_permission) {
          return next(
            new AppError(
              'You do not have permission to perform this action',
              403,
              'FORBIDDEN'
            )
          );
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Require ANY ONE of the listed permissions.
 *
 * @example
 * router.get('/reports', authMiddleware, authorizeAny('report.read', 'report.export'), controller.list);
 */
export const authorizeAny = (...permissionCodes: string[]) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = req.user;

      if (!user || !user.userId) {
        return next(
          new AppError('Authentication required', 401, 'UNAUTHORIZED')
        );
      }

      for (const code of permissionCodes) {
        const result = await db.queryOne<PermissionCheckRow>(
          'SELECT udf_user_has_permission($1, $2) AS has_permission',
          [user.userId, code]
        );

        if (result?.has_permission) {
          return next(); // At least one permission matched
        }
      }

      return next(
        new AppError(
          'You do not have permission to perform this action',
          403,
          'FORBIDDEN'
        )
      );
    } catch (error) {
      next(error);
    }
  };
};
