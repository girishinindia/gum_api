// ═══════════════════════════════════════════════════════════════
// gate-soft-delete-filters — drop deleted-row query params unless
// the caller is allowed to see soft-deleted data, AND inject the
// "show everything" default for super-admin callers.
//
// Many list endpoints expose a filter flag that surfaces rows where
// `is_deleted = TRUE`. Examples of the param names used across the
// codebase:
//
//   - isDeleted           (junctions, resources with soft delete) — tri-state: true|false|all
//   - filterIsDeleted     (employee/student/instructor profiles)  — tri-state: true|false|all
//   - includeDeletedUser  (user-profiles)                         — boolean toggle
//
// Product rule (confirmed 2026-04-14, expanded 2026-04-15):
//   - Only super-admin callers may see deleted rows.
//   - For super-admin callers, the DEFAULT list view should include
//     deleted rows (no extra query param required) — this middleware
//     achieves that by injecting `isDeleted=all` / `filterIsDeleted=all`
//     when the param was not provided.
//   - For non-super-admin callers, this middleware strips any deleted-
//     surfacing param so the downstream service falls back to the UDF
//     default (hide deleted).
// ═══════════════════════════════════════════════════════════════

import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { canSeeDeletedRows } from '../utils/visibility';

const DELETED_FLAG_KEYS = [
  'isDeleted',
  'filterIsDeleted',
  'includeDeletedUser'
] as const;

// Subset of DELETED_FLAG_KEYS that accept the tri-state value 'all'
// in addition to a boolean. `includeDeletedUser` is a binary toggle
// (already-true means include, false / missing means exclude) so we
// do not auto-inject for it.
const TRI_STATE_KEYS = ['isDeleted', 'filterIsDeleted'] as const;

export const gateSoftDeleteFilters: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const q = req.query as Record<string, unknown>;

  if (canSeeDeletedRows(req.user)) {
    // Super-admin: default to "show everything" by injecting 'all' for
    // any tri-state param the caller did not explicitly set. Existing
    // values pass through untouched.
    for (const key of TRI_STATE_KEYS) {
      if (!(key in q)) q[key] = 'all';
    }
    next();
    return;
  }

  // Non-super-admin: strip every deleted-surfacing param.
  for (const key of DELETED_FLAG_KEYS) {
    if (key in q) delete q[key];
  }
  next();
};
