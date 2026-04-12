// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/branch-departments router
// (phase 03 junction table between branches and departments).
//
// The DB UDFs (`udf_branch_departments_insert/update/delete/
// restore`, `udf_get_branch_departments`) already do their own
// validation; these schemas exist so the API rejects bad input
// loudly with 400 VALIDATION_ERROR before the request ever
// reaches PostgreSQL.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  bigintIdSchema,
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

import { BRANCH_TYPES } from './branches.schemas';

// ─── Atoms ───────────────────────────────────────────────────────

const floorOrWingSchema = z
  .string()
  .trim()
  .min(1, 'floor or wing is too short')
  .max(64, 'floor or wing is too long');

const extensionSchema = z
  .string()
  .trim()
  .min(1, 'extension is too short')
  .max(16, 'extension is too long')
  .regex(/^[0-9+\-() ]+$/, 'extension may only contain digits, +, -, parentheses and spaces');

const capacitySchema = z
  .number()
  .int('capacity must be an integer')
  .min(0, 'capacity cannot be negative')
  .max(100_000, 'capacity is too large');

const branchTypeSchema = z.enum(BRANCH_TYPES);

// ─── Sort allowlist ──────────────────────────────────────────────

export const BD_SORT_TABLES = ['bd', 'branch', 'department'] as const;

// Matches the raw column names the UDF forwards to the query.
// NB: udf_get_branch_departments concatenates these into dynamic
// SQL without a whitelist — this schema *is* the whitelist.
export const BD_SORT_COLUMNS = [
  'id',
  'branch_id',
  'department_id',
  'is_active',
  'is_deleted',
  'created_at',
  'updated_at',
  'name',
  'code'
] as const;

// ─── List query ──────────────────────────────────────────────────

export const listBranchDepartmentsQuerySchema = paginationSchema.extend({
  // Top-level convenience (maps to the bd layer).
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),

  // Junction filters
  branchId: bigintIdSchema.optional(),
  departmentId: bigintIdSchema.optional(),
  branchType: branchTypeSchema.optional(),
  branchName: z.string().trim().min(1).max(128).optional(),
  departmentName: z.string().trim().min(1).max(128).optional(),

  searchTerm: searchTermSchema,

  sortTable: z.enum(BD_SORT_TABLES).default('bd'),
  sortColumn: z.enum(BD_SORT_COLUMNS).default('id'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListBranchDepartmentsQuery = z.infer<
  typeof listBranchDepartmentsQuerySchema
>;

// ─── Create body ─────────────────────────────────────────────────

export const createBranchDepartmentBodySchema = z.object({
  branchId: bigintIdSchema,
  departmentId: bigintIdSchema,
  localHeadUserId: bigintIdSchema.optional(),
  employeeCapacity: capacitySchema.optional(),
  floorOrWing: floorOrWingSchema.optional(),
  extensionNumber: extensionSchema.optional(),
  isActive: z.boolean().optional()
});
export type CreateBranchDepartmentBody = z.infer<
  typeof createBranchDepartmentBodySchema
>;

// ─── Update body ─────────────────────────────────────────────────
//
// Note: the UDF deliberately does NOT allow changing branch_id
// or department_id on an existing row — doing so is semantically
// equivalent to deleting + re-inserting and breaks the uniqueness
// invariant in confusing ways. Use delete + create instead.

export const updateBranchDepartmentBodySchema = z
  .object({
    localHeadUserId: bigintIdSchema.optional(),
    employeeCapacity: capacitySchema.optional(),
    floorOrWing: floorOrWingSchema.optional(),
    extensionNumber: extensionSchema.optional(),
    isActive: z.boolean().optional(),
    // Explicit "unassign local head" switch — distinguishes
    // "field not provided" from "clear local head to NULL".
    clearLocalHead: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateBranchDepartmentBody = z.infer<
  typeof updateBranchDepartmentBodySchema
>;
