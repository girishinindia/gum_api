// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/user-experience (phase 04).
//
// Mirrors:
//   • udf_get_user_experience
//   • udf_insert_user_experience
//   • udf_update_user_experience
//   • udf_delete_user_experience (soft-delete, no restore)
//
// Same 1:M + soft-delete + no-restore model as user_education.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  bigintIdSchema,
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Enums (match the CHECK constraints in 01_table.sql) ────────

export const USER_EXPERIENCE_EMPLOYMENT_TYPE = [
  'full_time',
  'part_time',
  'contract',
  'internship',
  'freelance',
  'self_employed',
  'volunteer',
  'apprenticeship',
  'other'
] as const;
const employmentTypeSchema = z.enum(USER_EXPERIENCE_EMPLOYMENT_TYPE);

export const USER_EXPERIENCE_WORK_MODE = ['on_site', 'remote', 'hybrid'] as const;
const workModeSchema = z.enum(USER_EXPERIENCE_WORK_MODE);

export const USER_EXPERIENCE_LEVEL_BAND = [
  'entry',
  'junior',
  'mid',
  'senior',
  'lead',
  'executive'
] as const;
const levelBandSchema = z.enum(USER_EXPERIENCE_LEVEL_BAND);

// ─── Atoms ───────────────────────────────────────────────────────

const shortText = z.string().trim().min(1).max(255);
const longText = z.string().trim().min(1).max(8000);

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

const mobileLikeSchema = z
  .string()
  .trim()
  .min(8, 'phone is too short')
  .max(20, 'phone is too long')
  .regex(/^\+?[0-9 ()\-]+$/, 'must be a valid phone number');

const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email('must be a valid email address')
  .transform((v) => v.toLowerCase());

// ─── Sort allowlist ──────────────────────────────────────────────
// Must stay in sync with udf_get_user_experience's CASE whitelist.

export const USER_EXPERIENCE_SORT_TABLES = ['exp', 'designation', 'user'] as const;

export const USER_EXPERIENCE_SORT_COLUMNS = [
  // exp
  'id',
  'company_name',
  'job_title',
  'employment_type',
  'work_mode',
  'start_date',
  'end_date',
  'is_active',
  'is_deleted',
  'created_at',
  'updated_at',
  // designation
  'name',
  'level',
  'level_band',
  // user
  'first_name',
  'last_name',
  'email',
  'role'
] as const;

const sortTableSchema = z.enum(USER_EXPERIENCE_SORT_TABLES).default('exp');
const sortColumnSchema = z.enum(USER_EXPERIENCE_SORT_COLUMNS).default('id');
const sortDirectionSchema = z
  .enum(['asc', 'desc', 'ASC', 'DESC'])
  .default('DESC')
  .transform((v) => v.toUpperCase() as 'ASC' | 'DESC');

// ─── List query ──────────────────────────────────────────────────

export const listUserExperienceQuerySchema = paginationSchema.extend({
  userId: bigintIdSchema.optional(),

  // Experience filters
  designationId: bigintIdSchema.optional(),
  employmentType: employmentTypeSchema.optional(),
  workMode: workModeSchema.optional(),
  levelBand: levelBandSchema.optional(),
  isCurrentJob: queryBooleanSchema.optional(),
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
export type ListUserExperienceQuery = z.infer<typeof listUserExperienceQuerySchema>;

// ─── Shared experience field map ────────────────────────────────

const experienceCoreFields = {
  companyName: shortText,
  jobTitle: shortText,
  startDate: dateSchema,

  // Optional columns (all null-tolerant at the UDF layer via COALESCE)
  designationId: bigintIdSchema.optional(),
  employmentType: employmentTypeSchema.optional(),
  department: shortText.optional(),
  location: shortText.optional(),
  workMode: workModeSchema.optional(),
  endDate: dateSchema.optional(),
  isCurrentJob: z.boolean().optional(),
  description: longText.optional(),
  keyAchievements: longText.optional(),
  skillsUsed: longText.optional(),
  salaryRange: shortText.optional(),
  referenceName: shortText.optional(),
  referencePhone: mobileLikeSchema.optional(),
  referenceEmail: emailSchema.optional(),
  isActive: z.boolean().optional()
};

// ─── Create body (admin — targets any userId) ───────────────────

export const createUserExperienceBodySchema = z
  .object({
    userId: bigintIdSchema,
    ...experienceCoreFields
  })
  .refine(
    (v) => !v.endDate || new Date(v.endDate) >= new Date(v.startDate),
    { message: 'endDate cannot be before startDate', path: ['endDate'] }
  )
  .refine((v) => !(v.isCurrentJob === true && v.endDate), {
    message: 'endDate must be empty when isCurrentJob is true',
    path: ['endDate']
  });
export type CreateUserExperienceBody = z.infer<typeof createUserExperienceBodySchema>;

// ─── Create body (/me) ──────────────────────────────────────────

export const createMyUserExperienceBodySchema = z
  .object({ ...experienceCoreFields })
  .refine(
    (v) => !v.endDate || new Date(v.endDate) >= new Date(v.startDate),
    { message: 'endDate cannot be before startDate', path: ['endDate'] }
  )
  .refine((v) => !(v.isCurrentJob === true && v.endDate), {
    message: 'endDate must be empty when isCurrentJob is true',
    path: ['endDate']
  });
export type CreateMyUserExperienceBody = z.infer<typeof createMyUserExperienceBodySchema>;

// ─── Update body (partial) ──────────────────────────────────────

export const updateUserExperienceBodySchema = z
  .object({
    designationId: bigintIdSchema.optional(),
    companyName: shortText.optional(),
    jobTitle: shortText.optional(),
    employmentType: employmentTypeSchema.optional(),
    department: shortText.optional(),
    location: shortText.optional(),
    workMode: workModeSchema.optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    isCurrentJob: z.boolean().optional(),
    description: longText.optional(),
    keyAchievements: longText.optional(),
    skillsUsed: longText.optional(),
    salaryRange: shortText.optional(),
    referenceName: shortText.optional(),
    referencePhone: mobileLikeSchema.optional(),
    referenceEmail: emailSchema.optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateUserExperienceBody = z.infer<typeof updateUserExperienceBodySchema>;
