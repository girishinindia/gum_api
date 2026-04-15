// ═══════════════════════════════════════════════════════════════
// Zod schemas for the /api/v1/departments router (phase 03).
//
// Departments have a self-FK parent_department_id and are
// validated in the DB by `udf_departments_insert/update/delete/
// restore`. These schemas reject obvious bad input at the API
// edge before hitting Postgres.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  bigintIdSchema,
  isDeletedFilterSchema,
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema,
  nameSchema as sharedNameSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────

// Department codes are short uppercase slugs like 'TECH', 'HR', 'FIN'.
const departmentCodeSchema = z
  .string()
  .trim()
  .min(2, 'code must be at least 2 characters')
  .max(32, 'code must be at most 32 characters')
  .regex(
    /^[A-Za-z0-9_.-]+$/,
    'code may contain letters, digits, dot, underscore or hyphen'
  )
  .transform((v) => v.toUpperCase());

const descriptionSchema = z
  .string()
  .trim()
  .min(2, 'description is too short')
  .max(1000, 'description is too long');

// ─── Sort allowlist ──────────────────────────────────────────────

export const DEPARTMENT_SORT_COLUMNS = [
  'id',
  'name',
  'code',
  'parent_department_id',
  'is_active',
  'is_deleted',
  'created_at',
  'updated_at'
] as const;

// ─── List query ──────────────────────────────────────────────────

export const listDepartmentsQuerySchema = paginationSchema.extend({
  // Top-level convenience (maps to the department layer).
  isActive: queryBooleanSchema.optional(),
  isDeleted: isDeletedFilterSchema.optional(),

  // Hierarchy filters
  parentDepartmentId: bigintIdSchema.optional(),
  topLevelOnly: queryBooleanSchema.optional(),
  code: z.string().trim().min(1).max(64).optional(),

  searchTerm: searchTermSchema,

  sortColumn: z.enum(DEPARTMENT_SORT_COLUMNS).default('id'),
  sortDirection: z
    .enum(['asc', 'desc', 'ASC', 'DESC'])
    .default('ASC')
    .transform((v) => v.toUpperCase() as 'ASC' | 'DESC')
});
export type ListDepartmentsQuery = z.infer<typeof listDepartmentsQuerySchema>;

// ─── Create body ─────────────────────────────────────────────────

export const createDepartmentBodySchema = z.object({
  name: sharedNameSchema,
  code: departmentCodeSchema.optional(),
  description: descriptionSchema.optional(),
  parentDepartmentId: bigintIdSchema.optional(),
  headUserId: bigintIdSchema.optional(),
  isActive: z.boolean().optional()
});
export type CreateDepartmentBody = z.infer<typeof createDepartmentBodySchema>;

// ─── Update body ─────────────────────────────────────────────────

export const updateDepartmentBodySchema = z
  .object({
    name: sharedNameSchema.optional(),
    code: departmentCodeSchema.optional(),
    description: descriptionSchema.optional(),
    parentDepartmentId: bigintIdSchema.optional(),
    headUserId: bigintIdSchema.optional(),
    isActive: z.boolean().optional(),
    // Explicit "make top-level" switch. The UDF distinguishes
    // "field not provided" (leave parent alone) from "clear
    // parent to NULL" via this separate flag.
    clearParent: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateDepartmentBody = z.infer<typeof updateDepartmentBodySchema>;
