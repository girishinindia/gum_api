// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/user-permissions router.
// Mirrors udf_get_user_permissions / udf_user_permissions_assign /
// udf_user_permissions_revoke / udf_user_permissions_delete /
// udf_user_permissions_restore.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  bigintIdSchema,
  isDeletedFilterSchema,
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Grant type ─────────────────────────────────────────────────

export const grantTypeSchema = z.enum(['grant', 'deny']);
export type GrantType = z.infer<typeof grantTypeSchema>;

// ─── Sort allowlist ──────────────────────────────────────────────
// Must stay in sync with udf_get_user_permissions' whitelist.

export const USER_PERMISSION_SORT_COLUMNS = [
  'id',
  'user_id',
  'user_name',
  'perm_name',
  'perm_code',
  'resource',
  'grant_type',
  'created_at'
] as const;

const sortColumnSchema = z.enum(USER_PERMISSION_SORT_COLUMNS).default('id');

// ─── Lowercase identifier atom (resource / action / scope filters)

const lowercaseIdentifier = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9_]+$/, 'must be lowercase alphanumerics or underscore')
  .transform((v) => v.toLowerCase());

// ─── List query ──────────────────────────────────────────────────

export const listUserPermissionsQuerySchema = paginationSchema.extend({
  userId: bigintIdSchema.optional(),
  permissionId: bigintIdSchema.optional(),
  grantType: grantTypeSchema.optional(),
  resource: lowercaseIdentifier.optional(),
  action: lowercaseIdentifier.optional(),
  scope: lowercaseIdentifier.optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: isDeletedFilterSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: sortColumnSchema,
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListUserPermissionsQuery = z.infer<
  typeof listUserPermissionsQuerySchema
>;

// ─── Assign body (grant | deny) ─────────────────────────────────

export const assignUserPermissionBodySchema = z.object({
  userId: bigintIdSchema,
  permissionId: bigintIdSchema,
  grantType: grantTypeSchema.default('grant')
});
export type AssignUserPermissionBody = z.infer<
  typeof assignUserPermissionBodySchema
>;

// ─── Revoke body ────────────────────────────────────────────────

export const revokeUserPermissionBodySchema = z.object({
  userId: bigintIdSchema,
  permissionId: bigintIdSchema
});
export type RevokeUserPermissionBody = z.infer<
  typeof revokeUserPermissionBodySchema
>;
