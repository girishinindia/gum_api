// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/user-social-medias (phase 04).
//
// Mirrors:
//   • udf_get_user_social_medias
//   • udf_insert_user_social_media
//   • udf_update_user_social_media
//   • udf_delete_user_social_media (soft-delete)
//   • udf_restore_user_social_media (admin+ un-soft-delete)
//
// Two mutation bodies are exported:
//
//   createUserSocialMediaBodySchema      — admin body (targets any userId).
//   createMyUserSocialMediaBodySchema    — self body (POST /me), userId
//                                          is derived from req.user.id.
//
//   updateUserSocialMediaBodySchema      — admin / self partial patch.
//
// user_social_medias is 1:M with users and has its own is_active +
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

const shortText = z.string().trim().min(1).max(255);
const urlSchema = z.string().trim().url('must be a valid URL').max(1024);

// Platform type is a free-form text column on social_medias; the table
// has no CHECK constraint but the seeded values are 'social',
// 'professional', 'code', 'messaging'. Keep the filter open.
const platformTypeSchema = z.string().trim().min(2).max(64);

// ─── Sort allowlist ──────────────────────────────────────────────
// Must stay in sync with udf_get_user_social_medias' CASE whitelist.

export const USER_SOCIAL_MEDIA_SORT_TABLES = ['usm', 'social_media', 'user'] as const;

export const USER_SOCIAL_MEDIA_SORT_COLUMNS = [
  // usm
  'id',
  'profile_url',
  'username',
  'is_primary',
  'is_verified',
  'is_active',
  'is_deleted',
  'created_at',
  'updated_at',
  // social_media
  'name',
  'code',
  'platform_type',
  'display_order',
  // user
  'first_name',
  'last_name',
  'email',
  'role'
] as const;

const sortTableSchema = z.enum(USER_SOCIAL_MEDIA_SORT_TABLES).default('usm');
const sortColumnSchema = z.enum(USER_SOCIAL_MEDIA_SORT_COLUMNS).default('id');

const sortDirectionSchema = z
  .enum(['asc', 'desc', 'ASC', 'DESC'])
  .default('DESC')
  .transform((v) => v.toUpperCase() as 'ASC' | 'DESC');

// ─── List query ──────────────────────────────────────────────────

export const listUserSocialMediasQuerySchema = paginationSchema.extend({
  userId: bigintIdSchema.optional(),

  // user_social_media filters
  socialMediaId: bigintIdSchema.optional(),
  platformType: platformTypeSchema.optional(),
  isPrimary: queryBooleanSchema.optional(),
  isVerified: queryBooleanSchema.optional(),
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
export type ListUserSocialMediasQuery = z.infer<typeof listUserSocialMediasQuerySchema>;

// ─── Shared field map (create + update) ─────────────────────────

const coreFields = {
  socialMediaId: bigintIdSchema,
  profileUrl: urlSchema,
  username: shortText.optional(),
  isPrimary: z.boolean().optional(),
  isVerified: z.boolean().optional(),
  isActive: z.boolean().optional()
};

// ─── Create body (admin — targets any userId) ───────────────────

export const createUserSocialMediaBodySchema = z.object({
  userId: bigintIdSchema,
  ...coreFields
});
export type CreateUserSocialMediaBody = z.infer<typeof createUserSocialMediaBodySchema>;

// ─── Create body (/me — userId derived from req.user.id) ────────

export const createMyUserSocialMediaBodySchema = z.object({ ...coreFields });
export type CreateMyUserSocialMediaBody = z.infer<typeof createMyUserSocialMediaBodySchema>;

// ─── Update body (partial) ──────────────────────────────────────

export const updateUserSocialMediaBodySchema = z
  .object({
    socialMediaId: bigintIdSchema.optional(),
    profileUrl: urlSchema.optional(),
    username: shortText.optional(),
    isPrimary: z.boolean().optional(),
    isVerified: z.boolean().optional(),
    isActive: z.boolean().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update'
  });
export type UpdateUserSocialMediaBody = z.infer<typeof updateUserSocialMediaBodySchema>;
