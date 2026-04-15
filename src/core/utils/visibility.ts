// ═══════════════════════════════════════════════════════════════
// visibility — soft-delete visibility guards for API callers.
//
// Product rule (confirmed 2026-04-14):
//
//   Only super-admin callers may see soft-deleted rows. Every other
//   role must get a clean 404 when they hit GET /:id for a deleted
//   resource, and list endpoints must never leak deleted rows to
//   them regardless of the `isDeleted` / `filterIsDeleted` query
//   param they pass.
//
// The underlying UDFs already return deleted rows via `p_id` so
// super-admin "view deleted / restore" flows keep working; this
// file is the API-layer gate that decides whether to forward that
// row to the caller or pretend it doesn't exist.
//
// Two primitives are exported:
//
//   canSeeDeletedRows(user)    — boolean test, for list handlers
//                                that need to choose between
//                                `p_filter_is_deleted := NULL`
//                                (hide deleted by default) and the
//                                query-param driven value.
//
//   assertVisibleToCaller(...) — wraps the standard GET /:id
//                                pattern: null → 404; present but
//                                deleted + caller isn't super-admin
//                                → also 404, same message shape, so
//                                the two cases are indistinguishable
//                                from outside.
// ═══════════════════════════════════════════════════════════════

import { AppError } from '../errors/app-error';
import type { AuthUser } from '../types/auth.types';

/**
 * Roles that are permitted to see soft-deleted rows. Kept as a
 * const array so future expansions (e.g. an auditor role) can be
 * added in one place.
 */
const DELETED_VISIBLE_ROLES: readonly string[] = ['super_admin'];

/**
 * True when the given authenticated user should be able to see
 * rows where `isDeleted = true`. Undefined / missing users are
 * treated as not-privileged.
 */
export const canSeeDeletedRows = (user: AuthUser | undefined | null): boolean => {
  if (!user || !Array.isArray(user.roles)) return false;
  return user.roles.some((r) => DELETED_VISIBLE_ROLES.includes(r));
};

/**
 * Resolve a tri-state `isDeleted` query value into the two parameters
 * the list UDFs / raw-SQL list services need:
 *
 *   p_filter_is_deleted: BOOLEAN — strict equality filter (TRUE only,
 *                         FALSE only). NULL means "no equality filter".
 *   p_hide_deleted:      BOOLEAN — when TRUE and p_filter is NULL,
 *                         enforce `is_deleted = FALSE`. When FALSE and
 *                         p_filter is NULL, surface live + deleted rows.
 *
 * Caller contract:
 *   undefined → behave as the legacy default (hide deleted)
 *   true      → only deleted rows
 *   false     → only live rows
 *   'all'     → live + deleted rows
 *
 * The `gateSoftDeleteFilters` middleware injects `'all'` for super-admin
 * callers when no `isDeleted` param was sent, so super-admin lists default
 * to "show everything"; non-super-admin callers cannot reach this helper
 * with anything other than `undefined` (the middleware strips the param).
 */
export const resolveIsDeletedFilter = (
  q: boolean | 'all' | undefined | null
): { filterIsDeleted: boolean | null; hideDeleted: boolean | null } => {
  // 'all' → request UDF to NOT hide deleted rows. UDFs that have been
  // migrated to accept p_hide_deleted will honour this; older UDFs lack
  // the param, so callTableFunction would normally crash. We send NULL
  // instead of FALSE so callTableFunction filters it out — older UDFs
  // then fall back to their own default-hide behaviour (regression
  // tracked: super-admin 'all' list view shows only live rows for
  // unmigrated UDFs).
  if (q === 'all') return { filterIsDeleted: null, hideDeleted: false };
  // For explicit equality (true / false) and the default-hide case, we
  // intentionally pass NULL for hideDeleted. callTableFunction strips
  // NULL params so the UDF call works against both migrated UDFs (which
  // would receive default TRUE) AND legacy UDFs that don't have the
  // param at all. The legacy UDFs already default to hiding deleted
  // rows when p_filter_is_deleted IS NULL, which matches the desired
  // behaviour.
  if (q === true || q === false) return { filterIsDeleted: q, hideDeleted: null };
  return { filterIsDeleted: null, hideDeleted: null };
};

/**
 * Shape the helper expects any "row" object to have. DTOs across
 * the codebase expose `isDeleted` on the top level (camelCase), so
 * this is the one contract we rely on.
 */
interface MaybeDeletable {
  isDeleted?: boolean | null;
}

/**
 * Guard for `GET /:id` handlers:
 *
 *   const row = await service.getById(id);
 *   assertVisibleToCaller(row, req.user, 'Role', id);
 *   return ok(res, row, 'OK');
 *
 * Behaviour:
 *   - row == null                                 → 404 NOT_FOUND
 *   - row present, isDeleted && !superAdmin       → 404 NOT_FOUND
 *     (intentionally same shape as the missing-row 404 so callers
 *      can't distinguish "deleted but hidden" from "never existed")
 *   - otherwise                                    → row returned (typed)
 *
 * Type-narrowed via `asserts` so callers can drop their own null
 * check after calling this helper.
 */
export function assertVisibleToCaller<T extends MaybeDeletable>(
  row: T | null | undefined,
  user: AuthUser | undefined | null,
  resourceLabel: string,
  id: number | string
): asserts row is T {
  if (!row) {
    throw AppError.notFound(`${resourceLabel} ${id} not found`);
  }
  if (row.isDeleted === true && !canSeeDeletedRows(user)) {
    throw AppError.notFound(`${resourceLabel} ${id} not found`);
  }
}
