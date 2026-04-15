// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/user-languages (phase 04).
//
// Mirrors:
//   • udf_get_user_languages
//   • udf_insert_user_language
//   • udf_update_user_language
//   • udf_delete_user_language  (soft-delete)
//   • udf_restore_user_language (admin+ un-soft-delete)
//
// Two mutation bodies are exported:
//
//   createUserLanguageBodySchema     — admin body (targets any userId).
//   createMyUserLanguageBodySchema   — self body (POST /me), userId
//                                      is derived from req.user.id.
//
//   updateUserLanguageBodySchema     — admin / self partial patch.
//
// user_languages is 1:M with users and has its own is_active +
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

// Proficiency level is constrained by the DB CHECK constraint on
// user_languages.proficiency_level. Keep in sync with the table DDL.
export const LANGUAGE_PROFICIENCY_LEVELS = [
  'basic',
  'conversational',
  'professional',
  'fluent',
  'native'
] as const;
const proficiencyLevelSchema = z.enum(LANGUAGE_PROFICIENCY_LEVELS);

// Free-form language script filter (values like 'Latin', 'Devanagari').
const languageScriptSchema = z.string().trim().min(2).max(64);

// ─── Sort allowlist ──────────────────────────────────────────────
// Must stay in sync with udf_get_user_languages' CASE whitelist.

export const USER_LANGUAGE_SORT_TABLES = ['ulang', 'language', 'user'] as const;

export const USER_LANGUAGE_SORT_COLUMNS = [
  // ulang
  'id',
  'proficiency_level',
  'is_primary',
  'is_native',
  'is_active',
  'created_at',
  'updated_at',
  // language
  'name',
  'native_name',
  'iso_code',
  'script',
  // user
  'first_name',
  'last_name',
  'email',
  'role'
] as const;

const sortTableSchema = z.enum(USER_LANGUAGE_SORT_TABLES).default('ulang');
const sortColumnSchema = z.enum(USER_LANGUAGE_SORT_COLUMNS).default('id');

const sortDirectionSchema = z
  .enum(['asc', 'desc', 'ASC', 'DESC'])
  .default('DESC')
  .transform((v) => v.toUpperCase() as 'ASC' | 'DESC');

// ─── List query ──────────────────────────────────────────────────

export const listUserLanguagesQuerySchema = paginationSchema.extend({
  userId: bigintIdSchema.optional(),

  // user_language filters
  languageId: bigintIdSchema.optional(),
  proficiencyLevel: proficiencyLevelSchema.optional(),
  languageScript: languageScriptSchema.optional(),
  isPrimary: queryBooleanSchema.optional(),
  isNative: queryBooleanSchema.optional(),
  canRead: queryBooleanSchema.optional(),
  canWrite: queryBooleanSchema.optional(),
  canSpeak: queryBooleanSchema.optional(),
  isActive: queryBooleanSchema.optional(),
  isDeleted: isDeletedFilterSchema.optional(),

  // User filters
  userRole: z.string().trim().min(2).max(64).optional(),
  userIsActive: queryBooleanSchema.optional(),

  searchTerm: searchTermSchema,
  sortTable: sortTableSchema,
  sortColumn: sortColumnSchema,
  sortDirection: sortDirectionSchema
});
export type ListUserLanguagesQuery = z.infer<typeof listUserLanguagesQuerySchema>;

// ─── Shared field map (create + update) ─────────────────────────

const coreFields = {
  languageId: bigintIdSchema,
  proficiencyLevel: proficiencyLevelSchema.optional(),
  canRead: z.boolean().optional(),
  canWrite: z.boolean().optional(),
  canSpeak: z.boolean().optional(),
  isPrimary: z.boolean().optional(),
  isNative: z.boolean().optional(),
  isActive: z.boolean().optional()
};

// ─── Create body (admin — targets any userId) ───────────────────

export const createUserLanguageBodySchema = z.object({
  userId: bigintIdSchema,
  ...coreFields
});
export type CreateUserLanguageBody = z.infer<typeof createUserLanguageBodySchema>;

// ─── Create body (/me — userId derived from req.user.id) ────────

export const createMyUserLanguageBodySchema = z.object({ ...coreFields });
export type CreateMyUserLanguageBody = z.infer<typeof createMyUserLanguageBodySchema>;

// ─── Update body (partial) ──────────────────────────────────────

export const updateUserLanguageBodySchema = z
  .object({
    languageId: bigintIdSchema.optional(),
    proficiencyLevel: proficiencyLevelSchema.optional(),
    canRead: z.boolean().optional(),
    canWrite: z.boolean().optional(),
    canSpeak: z.boolean().optional(),
    isPrimary: z.boolean().optional(),
    isNative: z.boolean().optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateUserLanguageBody = z.infer<typeof updateUserLanguageBodySchema>;
