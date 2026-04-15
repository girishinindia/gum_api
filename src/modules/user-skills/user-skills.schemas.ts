// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/user-skills (phase 04).
//
// Mirrors:
//   • udf_get_user_skills
//   • udf_insert_user_skill
//   • udf_update_user_skill
//   • udf_delete_user_skill  (soft-delete)
//   • udf_restore_user_skill (admin+ un-soft-delete)
//
// Two mutation bodies are exported:
//
//   createUserSkillBodySchema      — admin body (targets any userId).
//   createMyUserSkillBodySchema    — self body (POST /me), userId
//                                    is derived from req.user.id.
//
//   updateUserSkillBodySchema      — admin / self partial patch.
//
// user_skills is 1:M with users and has its own is_active +
// is_deleted columns (soft-delete model). Deleted rows hidden by
// default; admin+ can restore via POST /:id/restore.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  bigintIdSchema,
  isDeletedFilterSchema,
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────

const urlSchema = z.string().trim().url('must be a valid URL').max(1024);

// Proficiency level is constrained by the DB CHECK constraint on
// user_skills.proficiency_level. Keep in sync with the table DDL.
export const PROFICIENCY_LEVELS = [
  'beginner',
  'intermediate',
  'advanced',
  'expert'
] as const;
const proficiencyLevelSchema = z.enum(PROFICIENCY_LEVELS);

// Years of experience — NUMERIC, non-negative. Allow up to 1 decimal
// place precision; the UDF guards against negatives regardless.
const yearsSchema = z
  .number({ invalid_type_error: 'yearsOfExperience must be a number' })
  .nonnegative('yearsOfExperience must be >= 0')
  .max(99, 'yearsOfExperience must be <= 99');

const endorsementCountSchema = z
  .number({ invalid_type_error: 'endorsementCount must be a number' })
  .int('endorsementCount must be an integer')
  .nonnegative('endorsementCount must be >= 0');

// Query-string variants (URL params arrive as strings)
const yearsQuerySchema = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'string' ? Number(v) : v))
  .refine((v) => Number.isFinite(v) && v >= 0, {
    message: 'minExperience must be a non-negative number'
  });

// Skill category is a free-form text column on skills; we accept any
// short string for filtering.
const skillCategorySchema = z.string().trim().min(2).max(64);

// ─── Sort allowlist ──────────────────────────────────────────────
// Must stay in sync with udf_get_user_skills' CASE whitelist.

export const USER_SKILL_SORT_TABLES = ['uskill', 'skill', 'user'] as const;

export const USER_SKILL_SORT_COLUMNS = [
  // uskill
  'id',
  'proficiency_level',
  'years_of_experience',
  'endorsement_count',
  'is_primary',
  'is_active',
  'created_at',
  'updated_at',
  // skill
  'name',
  'category',
  // user
  'first_name',
  'last_name',
  'email',
  'role'
] as const;

const sortTableSchema = z.enum(USER_SKILL_SORT_TABLES).default('uskill');
const sortColumnSchema = z.enum(USER_SKILL_SORT_COLUMNS).default('id');

const sortDirectionSchema = z
  .enum(['asc', 'desc', 'ASC', 'DESC'])
  .default('DESC')
  .transform((v) => v.toUpperCase() as 'ASC' | 'DESC');

// ─── List query ──────────────────────────────────────────────────

export const listUserSkillsQuerySchema = paginationSchema.extend({
  userId: bigintIdSchema.optional(),

  // user_skill filters
  skillId: bigintIdSchema.optional(),
  proficiencyLevel: proficiencyLevelSchema.optional(),
  skillCategory: skillCategorySchema.optional(),
  isPrimary: queryBooleanSchema.optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: isDeletedFilterSchema.optional(),
  minExperience: yearsQuerySchema.optional(),

  // User filters
  userRole: z.string().trim().min(2).max(64).optional(),
  userIsActive: queryBooleanSchema.optional(),

  searchTerm: searchTermSchema,
  sortTable: sortTableSchema,
  sortColumn: sortColumnSchema,
  sortDirection: sortDirectionSchema
});
export type ListUserSkillsQuery = z.infer<typeof listUserSkillsQuerySchema>;

// ─── Shared field map (create + update) ─────────────────────────

const coreFields = {
  skillId: bigintIdSchema,
  proficiencyLevel: proficiencyLevelSchema.optional(),
  yearsOfExperience: yearsSchema.optional(),
  isPrimary: z.boolean().optional(),
  certificateUrl: urlSchema.optional(),
  endorsementCount: endorsementCountSchema.optional(),
  isActive: z.boolean().optional()
};

// ─── Create body (admin — targets any userId) ───────────────────

export const createUserSkillBodySchema = z.object({
  userId: bigintIdSchema,
  ...coreFields
});
export type CreateUserSkillBody = z.infer<typeof createUserSkillBodySchema>;

// ─── Create body (/me — userId derived from req.user.id) ────────

export const createMyUserSkillBodySchema = z.object({ ...coreFields });
export type CreateMyUserSkillBody = z.infer<typeof createMyUserSkillBodySchema>;

// ─── Update body (partial) ──────────────────────────────────────

export const updateUserSkillBodySchema = z
  .object({
    skillId: bigintIdSchema.optional(),
    proficiencyLevel: proficiencyLevelSchema.optional(),
    yearsOfExperience: yearsSchema.optional(),
    isPrimary: z.boolean().optional(),
    certificateUrl: urlSchema.optional(),
    endorsementCount: endorsementCountSchema.optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateUserSkillBody = z.infer<typeof updateUserSkillBodySchema>;
