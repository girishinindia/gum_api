// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/user-projects (phase 04).
//
// Mirrors:
//   • udf_get_user_projects
//   • udf_insert_user_project
//   • udf_update_user_project
//   • udf_delete_user_project  (soft-delete)
//   • udf_restore_user_project (admin+ un-soft-delete)
//
// user_projects has no admin-workflow fields — isFeatured and
// isPublished are student-settable, unlike user_documents'
// verification workflow. A single body schema therefore covers
// both lanes; the admin /, / lane targets any userId while the
// self /me lane derives userId from req.user.id.
//
// user_projects is 1:M with users and has its own is_active +
// is_deleted columns (soft-delete model). Deleted rows hidden by
// default; admin+ can restore via POST /:id/restore.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  bigintIdSchema,
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Enums (match the CHECK constraints in 01_table.sql) ────────

export const USER_PROJECT_TYPES = [
  'personal',
  'academic',
  'professional',
  'freelance',
  'open_source',
  'research',
  'hackathon',
  'internship',
  'client',
  'government',
  'ngo',
  'other'
] as const;
const projectTypeSchema = z.enum(USER_PROJECT_TYPES);

export const USER_PROJECT_STATUSES = [
  'planning',
  'in_progress',
  'completed',
  'on_hold',
  'cancelled',
  'abandoned'
] as const;
const projectStatusSchema = z.enum(USER_PROJECT_STATUSES);

// ─── Atoms ───────────────────────────────────────────────────────

const shortText = z.string().trim().min(1).max(255);
const mediumText = z.string().trim().min(1).max(2048);
const longText = z.string().trim().min(1).max(8000);
const urlText = z.string().trim().min(1).max(2048);

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

const emailLikeSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email('must be a valid email address')
  .transform((v) => v.toLowerCase());

const mobileLikeSchema = z
  .string()
  .trim()
  .min(8, 'phone is too short')
  .max(20, 'phone is too long')
  .regex(/^\+?[0-9 ()\-]+$/, 'must be a valid phone number');

// ─── Sort allowlist ──────────────────────────────────────────────
// Must stay in sync with udf_get_user_projects' CASE whitelist.

export const USER_PROJECT_SORT_TABLES = ['proj', 'user'] as const;

export const USER_PROJECT_SORT_COLUMNS = [
  // proj
  'id',
  'project_title',
  'project_type',
  'project_status',
  'organization_name',
  'industry',
  'start_date',
  'end_date',
  'is_ongoing',
  'is_featured',
  'is_published',
  'display_order',
  'is_active',
  'created_at',
  'updated_at',
  // user
  'first_name',
  'last_name',
  'email',
  'role'
] as const;

const sortTableSchema = z.enum(USER_PROJECT_SORT_TABLES).default('proj');
const sortColumnSchema = z.enum(USER_PROJECT_SORT_COLUMNS).default('id');
const sortDirectionSchema = z
  .enum(['asc', 'desc', 'ASC', 'DESC'])
  .default('DESC')
  .transform((v) => v.toUpperCase() as 'ASC' | 'DESC');

// ─── List query ──────────────────────────────────────────────────

export const listUserProjectsQuerySchema = paginationSchema.extend({
  userId: bigintIdSchema.optional(),

  // Project filters
  projectType: projectTypeSchema.optional(),
  projectStatus: projectStatusSchema.optional(),
  industry: z.string().trim().min(2).max(128).optional(),
  isOngoing: queryBooleanSchema.optional(),
  isFeatured: queryBooleanSchema.optional(),
  isPublished: queryBooleanSchema.optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: queryBooleanSchema.optional(),

  // User filters
  userRole: z.string().trim().min(2).max(64).optional(),
  userIsActive: queryBooleanSchema.optional(),

  searchTerm: searchTermSchema,
  sortTable: sortTableSchema,
  sortColumn: sortColumnSchema,
  sortDirection: sortDirectionSchema
});
export type ListUserProjectsQuery = z.infer<typeof listUserProjectsQuerySchema>;

// ─── Shared core field map (create + update share this) ────────

const projectCoreFields = {
  projectTitle: shortText,

  // Optional
  projectCode: shortText.optional(),
  projectType: projectTypeSchema.optional(),
  description: longText.optional(),
  objectives: longText.optional(),
  roleInProject: shortText.optional(),
  responsibilities: longText.optional(),
  teamSize: z.number().int().min(1).max(10_000).optional(),
  isSoloProject: z.boolean().optional(),

  organizationName: shortText.optional(),
  clientName: shortText.optional(),
  industry: shortText.optional(),

  technologiesUsed: mediumText.optional(),
  toolsUsed: mediumText.optional(),
  programmingLanguages: mediumText.optional(),
  frameworks: mediumText.optional(),
  databasesUsed: mediumText.optional(),
  platform: shortText.optional(),

  startDate: dateSchema.optional(),
  endDate: dateSchema.optional(),
  isOngoing: z.boolean().optional(),
  durationMonths: z.number().int().min(0).max(1_200).optional(),
  projectStatus: projectStatusSchema.optional(),

  keyAchievements: longText.optional(),
  challengesFaced: longText.optional(),
  lessonsLearned: longText.optional(),
  impactSummary: longText.optional(),
  usersServed: shortText.optional(),

  projectUrl: urlText.optional(),
  repositoryUrl: urlText.optional(),
  demoUrl: urlText.optional(),
  documentationUrl: urlText.optional(),
  thumbnailUrl: urlText.optional(),
  caseStudyUrl: urlText.optional(),

  // Recognition (student-settable, not admin-gated)
  isFeatured: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  awards: longText.optional(),
  certifications: longText.optional(),

  referenceName: shortText.optional(),
  referenceEmail: emailLikeSchema.optional(),
  referencePhone: mobileLikeSchema.optional(),

  displayOrder: z.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional()
};

// ─── Cross-field refinements (create + update share these) ─────

const validateDateRange = <T extends { startDate?: string; endDate?: string }>(
  v: T
): boolean => !v.endDate || !v.startDate || new Date(v.endDate) >= new Date(v.startDate);

const validateOngoingNoEnd = <T extends { isOngoing?: boolean; endDate?: string }>(
  v: T
): boolean => !(v.isOngoing === true && !!v.endDate);

// ─── Create body (admin — targets any userId) ───────────────────

export const createUserProjectBodySchema = z
  .object({
    userId: bigintIdSchema,
    ...projectCoreFields
  })
  .refine(validateDateRange, {
    message: 'endDate cannot be before startDate',
    path: ['endDate']
  })
  .refine(validateOngoingNoEnd, {
    message: 'endDate must be empty when isOngoing is true',
    path: ['endDate']
  });
export type CreateUserProjectBody = z.infer<typeof createUserProjectBodySchema>;

// ─── Create body (/me — userId derived from req.user.id) ───────

export const createMyUserProjectBodySchema = z
  .object({ ...projectCoreFields })
  .refine(validateDateRange, {
    message: 'endDate cannot be before startDate',
    path: ['endDate']
  })
  .refine(validateOngoingNoEnd, {
    message: 'endDate must be empty when isOngoing is true',
    path: ['endDate']
  });
export type CreateMyUserProjectBody = z.infer<typeof createMyUserProjectBodySchema>;

// ─── Update body (partial) ──────────────────────────────────────

// Update body uses the same field map but with projectTitle also
// optional. The DB UDF validates the effective values against the
// current row, so cross-field checks here only fire when both sides
// are supplied in the same request.

export const updateUserProjectBodySchema = z
  .object({
    projectTitle: shortText.optional(),
    projectCode: shortText.optional(),
    projectType: projectTypeSchema.optional(),
    description: longText.optional(),
    objectives: longText.optional(),
    roleInProject: shortText.optional(),
    responsibilities: longText.optional(),
    teamSize: z.number().int().min(1).max(10_000).optional(),
    isSoloProject: z.boolean().optional(),
    organizationName: shortText.optional(),
    clientName: shortText.optional(),
    industry: shortText.optional(),
    technologiesUsed: mediumText.optional(),
    toolsUsed: mediumText.optional(),
    programmingLanguages: mediumText.optional(),
    frameworks: mediumText.optional(),
    databasesUsed: mediumText.optional(),
    platform: shortText.optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    isOngoing: z.boolean().optional(),
    durationMonths: z.number().int().min(0).max(1_200).optional(),
    projectStatus: projectStatusSchema.optional(),
    keyAchievements: longText.optional(),
    challengesFaced: longText.optional(),
    lessonsLearned: longText.optional(),
    impactSummary: longText.optional(),
    usersServed: shortText.optional(),
    projectUrl: urlText.optional(),
    repositoryUrl: urlText.optional(),
    demoUrl: urlText.optional(),
    documentationUrl: urlText.optional(),
    thumbnailUrl: urlText.optional(),
    caseStudyUrl: urlText.optional(),
    isFeatured: z.boolean().optional(),
    isPublished: z.boolean().optional(),
    awards: longText.optional(),
    certifications: longText.optional(),
    referenceName: shortText.optional(),
    referenceEmail: emailLikeSchema.optional(),
    referencePhone: mobileLikeSchema.optional(),
    displayOrder: z.number().int().min(0).max(10_000).optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  })
  .refine(validateDateRange, {
    message: 'endDate cannot be before startDate',
    path: ['endDate']
  })
  .refine(validateOngoingNoEnd, {
    message: 'endDate must be empty when isOngoing is true',
    path: ['endDate']
  });
export type UpdateUserProjectBody = z.infer<typeof updateUserProjectBodySchema>;
