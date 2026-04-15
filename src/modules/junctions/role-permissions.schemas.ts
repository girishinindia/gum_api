// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/role-permissions router.
// Mirrors udf_get_role_permissions / udf_role_permissions_assign /
// udf_role_permissions_revoke / udf_role_permissions_delete /
// udf_role_permissions_restore.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  bigintIdSchema,
  codeSchema,
  isDeletedFilterSchema,
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Sort allowlist ──────────────────────────────────────────────
// Must stay in sync with udf_get_role_permissions' whitelist.

export const ROLE_PERMISSION_SORT_COLUMNS = [
  'id',
  'role_id',
  'role_name',
  'role_level',
  'perm_name',
  'perm_code',
  'resource',
  'created_at'
] as const;

const sortColumnSchema = z
  .enum(ROLE_PERMISSION_SORT_COLUMNS)
  .default('role_level');

// ─── Lowercase identifier atom (resource / action / scope filters)

const lowercaseIdentifier = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9_]+$/, 'must be lowercase alphanumerics or underscore')
  .transform((v) => v.toLowerCase());

// ─── List query ──────────────────────────────────────────────────

export const listRolePermissionsQuerySchema = paginationSchema.extend({
  roleId: bigintIdSchema.optional(),
  roleCode: codeSchema.optional(),
  permissionId: bigintIdSchema.optional(),
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
export type ListRolePermissionsQuery = z.infer<
  typeof listRolePermissionsQuerySchema
>;

// ─── Assign body ─────────────────────────────────────────────────

export const assignRolePermissionBodySchema = z.object({
  roleId: bigintIdSchema,
  permissionId: bigintIdSchema
});
export type AssignRolePermissionBody = z.infer<
  typeof assignRolePermissionBodySchema
>;

// ─── Revoke body (by role+permission pair, no junction id) ──────

export const revokeRolePermissionBodySchema = z.object({
  roleId: bigintIdSchema,
  permissionId: bigintIdSchema
});
export type RevokeRolePermissionBody = z.infer<
  typeof revokeRolePermissionBodySchema
>;
