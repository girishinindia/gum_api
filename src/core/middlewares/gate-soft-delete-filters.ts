// ═══════════════════════════════════════════════════════════════
// gate-soft-delete-filters — drop deleted-row query params unless
// the caller is allowed to see soft-deleted data.
//
// Many list endpoints expose a filter flag that, when set to TRUE,
// surfaces rows where `is_deleted = TRUE`. Examples of the param
// names used across the codebase:
//
//   - isDeleted           (junctions, resources with soft delete)
//   - filterIsDeleted     (employee/student/instructor profiles)
//   - includeDeletedUser  (user-profiles)
//
// Product rule (confirmed 2026-04-14): only super-admin callers
// may see deleted rows. This middleware runs AFTER authenticate
// and BEFORE the request reaches the Zod validator; for non-
// super-admin callers it strips the flag from `req.query` so the
// downstream service falls back to the UDF default (hide deleted).
//
// For super-admin callers the middleware is a no-op, and the
// query param continues to flow through validation + service.
// ═══════════════════════════════════════════════════════════════

import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { canSeeDeletedRows } from '../utils/visibility';

const DELETED_FLAG_KEYS = [
  'isDeleted',
  'filterIsDeleted',
  'includeDeletedUser'
] as const;

export const gateSoftDeleteFilters: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (canSeeDeletedRows(req.user)) {
    next();
    return;
  }
  const q = req.query as Record<string, unknown>;
  for (const key of DELETED_FLAG_KEYS) {
    if (key in q) delete q[key];
  }
  next();
};
