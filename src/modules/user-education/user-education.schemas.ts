// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/user-education (phase 04).
//
// Mirrors:
//   • udf_get_user_education
//   • udf_insert_user_education
//   • udf_update_user_education
//   • udf_delete_user_education (soft-delete, no restore)
//
// Two mutation bodies are exported:
//
//   createUserEducationBodySchema      — admin body (targets any userId).
//   createMyUserEducationBodySchema    — self body (POST /me), userId
//                                        is derived from req.user.id.
//
//   updateUserEducationBodySchema      — admin / self full-write.
//
// user_education is 1:M with users and HAS its own is_active +
// is_deleted columns (soft-delete model). Restore is disabled by
// design — phase-04 policy for CV history records.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  bigintIdSchema,
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Enums / atoms ───────────────────────────────────────────────

// Free-form grade-type: the table does not CHECK this, but the
// phase-04 walkthrough standardised on these values, so we keep
// the API-facing set small to help client autocomplete.
export const USER_EDUCATION_GRADE_TYPE = [
  'percentage',
  'cgpa',
  'gpa',
  'grade',
  'pass_fail',
  'other'
] as const;
const gradeTypeSchema = z.enum(USER_EDUCATION_GRADE_TYPE);

const shortText = z.string().trim().min(1).max(255);
const longText = z.string().trim().min(1).max(4000);

// ISO date (YYYY-MM-DD). The column is DATE, so we keep strings.
const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

const urlSchema = z.string().trim().url('must be a valid URL').max(1024);

// ─── Sort allowlist ──────────────────────────────────────────────
// Must stay in sync with udf_get_user_education's CASE whitelist.

export const USER_EDUCATION_SORT_TABLES = ['edu', 'level', 'user'] as const;

// Single flat list that includes every legal (table, column) combo.
// The routes layer passes (sortTable, sortColumn) separately.
export const USER_EDUCATION_SORT_COLUMNS = [
  // edu
  'id',
  'institution_name',
  'field_of_study',
  'start_date',
  'end_date',
  'grade_type',
  'is_active',
  'is_deleted',
  'created_at',
  'updated_at',
  // level
  'name',
  'level_order',
  'category',
  // user
  'first_name',
  'last_name',
  'email',
  'role'
] as const;

const sortTableSchema = z.enum(USER_EDUCATION_SORT_TABLES).default('edu');
const sortColumnSchema = z.enum(USER_EDUCATION_SORT_COLUMNS).default('id');

const sortDirectionSchema = z
  .enum(['asc', 'desc', 'ASC', 'DESC'])
  .default('DESC')
  .transform((v) => v.toUpperCase() as 'ASC' | 'DESC');

// ─── List query ──────────────────────────────────────────────────

export const listUserEducationQuerySchema = paginationSchema.extend({
  // Single-row lookups
  userId: bigintIdSchema.optional(),

  // Education filters
  educationLevelId: bigintIdSchema.optional(),
  levelCategory: z.string().trim().min(2).max(64).optional(),
  gradeType: gradeTypeSchema.optional(),
  isCurrentlyStudying: queryBooleanSchema.optional(),
  isHighest: queryBooleanSchema.optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),

  // User (inherited) filters
  userRole: z.string().trim().min(2).max(64).optional(),
  userIsActive: queryBooleanSchema.optional(),

  searchTerm: searchTermSchema,
  sortTable: sortTableSchema,
  sortColumn: sortColumnSchema,
  sortDirection: sortDirectionSchema
});
export type ListUserEducationQuery = z.infer<typeof listUserEducationQuerySchema>;

// ─── Shared education field map (used by create + update) ───────

const educationCoreFields = {
  educationLevelId: bigintIdSchema,
  institutionName: shortText,
  boardOrUniversity: shortText.optional(),
  fieldOfStudy: shortText.optional(),
  specialization: shortText.optional(),
  gradeOrPercentage: shortText.optional(),
  gradeType: gradeTypeSchema.optional(),
  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  isCurrentlyStudying: z.boolean().optional(),
  isHighestQualification: z.boolean().optional(),
  certificateUrl: urlSchema.optional(),
  description: longText.optional(),
  isActive: z.boolean().optional()
};

// ─── Create body (admin — targets any userId) ───────────────────

export const createUserEducationBodySchema = z
  .object({
    userId: bigintIdSchema,
    ...educationCoreFields
  })
  .refine(
    (v) =>
      !(v.startDate && v.endDate) ||
      new Date(v.endDate) >= new Date(v.startDate),
    { message: 'endDate cannot be before startDate', path: ['endDate'] }
  )
  .refine((v) => !(v.isCurrentlyStudying === true && v.endDate), {
    message: 'endDate must be empty when isCurrentlyStudying is true',
    path: ['endDate']
  });
export type CreateUserEducationBody = z.infer<typeof createUserEducationBodySchema>;

// ─── Create body (/me — userId derived from req.user.id) ────────

export const createMyUserEducationBodySchema = z
  .object({ ...educationCoreFields })
  .refine(
    (v) =>
      !(v.startDate && v.endDate) ||
      new Date(v.endDate) >= new Date(v.startDate),
    { message: 'endDate cannot be before startDate', path: ['endDate'] }
  )
  .refine((v) => !(v.isCurrentlyStudying === true && v.endDate), {
    message: 'endDate must be empty when isCurrentlyStudying is true',
    path: ['endDate']
  });
export type CreateMyUserEducationBody = z.infer<typeof createMyUserEducationBodySchema>;

// ─── Update body (partial) ──────────────────────────────────────
// Every field is optional. The DB re-validates the merged
// (current + patch) start/end/isCurrentlyStudying triplet, so
// we don't duplicate the cross-field refine here — a patch that
// only sets end_date still needs the existing start_date from
// the DB to be valid.

export const updateUserEducationBodySchema = z
  .object({
    educationLevelId: bigintIdSchema.optional(),
    institutionName: shortText.optional(),
    boardOrUniversity: shortText.optional(),
    fieldOfStudy: shortText.optional(),
    specialization: shortText.optional(),
    gradeOrPercentage: shortText.optional(),
    gradeType: gradeTypeSchema.optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    isCurrentlyStudying: z.boolean().optional(),
    isHighestQualification: z.boolean().optional(),
    certificateUrl: urlSchema.optional(),
    description: longText.optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateUserEducationBody = z.infer<typeof updateUserEducationBodySchema>;
