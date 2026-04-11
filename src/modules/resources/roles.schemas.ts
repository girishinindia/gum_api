// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/roles router.
// Mirrors the udf_roles_insert / udf_roles_update parameter set.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  bigintIdSchema,
  codeSchema,
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────

const roleNameSchema = z
  .string()
  .trim()
  .min(2, 'name is too short')
  .max(128, 'name is too long');

const levelSchema = z
  .number({ invalid_type_error: 'level must be a number' })
  .int('level must be an integer')
  .min(0, 'level must be ≥ 0')
  .max(99, 'level must be ≤ 99');

const displayOrderSchema = z
  .number({ invalid_type_error: 'displayOrder must be a number' })
  .int('displayOrder must be an integer')
  .min(0, 'displayOrder must be ≥ 0');

// Hex color (#fff or #ffffff) — keeps the DB's TEXT column tidy.
const colorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'color must be a hex code (#fff or #ffffff)');

// ─── Sort allowlist ──────────────────────────────────────────────

export const ROLE_SORT_COLUMNS = [
  'display_order',
  'name',
  'code',
  'level',
  'created_at'
] as const;

const sortColumnSchema = z.enum(ROLE_SORT_COLUMNS).default('display_order');

// ─── List query ──────────────────────────────────────────────────

export const listRolesQuerySchema = paginationSchema.extend({
  isActive: queryBooleanSchema.optional(),
  level: z.coerce.number().int().min(0).max(99).optional(),
  parentRoleId: bigintIdSchema.optional(),
  isSystemRole: queryBooleanSchema.optional(),
  code: codeSchema.optional(),
  searchTerm: searchTermSchema,
  sortColumn: sortColumnSchema,
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListRolesQuery = z.infer<typeof listRolesQuerySchema>;

// ─── Create body ─────────────────────────────────────────────────

export const createRoleBodySchema = z.object({
  name: roleNameSchema,
  code: codeSchema,
  description: z.string().trim().max(512).optional(),
  parentRoleId: bigintIdSchema.optional(),
  level: levelSchema.default(99),
  isSystemRole: z.boolean().optional(),
  displayOrder: displayOrderSchema.default(0),
  icon: z.string().trim().min(1).max(64).optional(),
  color: colorSchema.optional(),
  isActive: z.boolean().optional()
});
export type CreateRoleBody = z.infer<typeof createRoleBodySchema>;

// ─── Update body ─────────────────────────────────────────────────

export const updateRoleBodySchema = z
  .object({
    name: roleNameSchema.optional(),
    code: codeSchema.optional(),
    description: z.string().trim().max(512).optional(),
    parentRoleId: bigintIdSchema.optional(),
    level: levelSchema.optional(),
    displayOrder: displayOrderSchema.optional(),
    icon: z.string().trim().min(1).max(64).optional(),
    color: colorSchema.optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateRoleBody = z.infer<typeof updateRoleBodySchema>;
