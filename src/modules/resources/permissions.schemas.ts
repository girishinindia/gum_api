// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/permissions router.
// Mirrors udf_permissions_insert / udf_permissions_update.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  isDeletedFilterSchema,
  codeSchema,
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────

const permNameSchema = z
  .string()
  .trim()
  .min(2, 'name is too short')
  .max(128, 'name is too long');

/** lowercased identifiers — match the DB normalization */
const lowercaseIdentifier = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9_]+$/, 'must be lowercase alphanumerics or underscore')
  .transform((v) => v.toLowerCase());

const displayOrderSchema = z
  .number({ invalid_type_error: 'displayOrder must be a number' })
  .int('displayOrder must be an integer')
  .min(0, 'displayOrder must be ≥ 0');

// ─── Sort allowlist ──────────────────────────────────────────────

export const PERMISSION_SORT_COLUMNS = [
  'id',
  'display_order',
  'name',
  'code',
  'resource',
  'action',
  'scope',
  'is_active',
  'created_at',
  'updated_at'
] as const;

const sortColumnSchema = z.enum(PERMISSION_SORT_COLUMNS).default('display_order');

// ─── List query ──────────────────────────────────────────────────

export const listPermissionsQuerySchema = paginationSchema.extend({
  isActive: queryBooleanSchema.optional(),
  isDeleted: isDeletedFilterSchema.optional(),
  resource: lowercaseIdentifier.optional(),
  action: lowercaseIdentifier.optional(),
  scope: lowercaseIdentifier.optional(),
  code: codeSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: sortColumnSchema,
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListPermissionsQuery = z.infer<typeof listPermissionsQuerySchema>;

// ─── Create body ─────────────────────────────────────────────────

export const createPermissionBodySchema = z.object({
  name: permNameSchema,
  code: codeSchema,
  resource: lowercaseIdentifier,
  action: lowercaseIdentifier,
  scope: lowercaseIdentifier.default('global'),
  description: z.string().trim().max(512).optional(),
  displayOrder: displayOrderSchema.default(0),
  isActive: z.boolean().optional()
});
export type CreatePermissionBody = z.infer<typeof createPermissionBodySchema>;

// ─── Update body ─────────────────────────────────────────────────

export const updatePermissionBodySchema = z
  .object({
    name: permNameSchema.optional(),
    code: codeSchema.optional(),
    description: z.string().trim().max(512).optional(),
    resource: lowercaseIdentifier.optional(),
    action: lowercaseIdentifier.optional(),
    scope: lowercaseIdentifier.optional(),
    displayOrder: displayOrderSchema.optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdatePermissionBody = z.infer<typeof updatePermissionBodySchema>;
