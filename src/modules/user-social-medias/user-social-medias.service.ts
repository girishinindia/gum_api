// ═══════════════════════════════════════════════════════════════
// user-social-medias.service — UDF wrappers for
// /api/v1/user-social-medias.
//
// Talks to phase-04 UDFs:
//   - udf_get_user_social_medias   (read / list with filters + sort)
//   - udf_insert_user_social_media (create, 1:M with users)
//   - udf_update_user_social_media (partial update, COALESCE pattern)
//   - udf_delete_user_social_media (soft-delete)
//   - udf_restore_user_social_media (un-soft-delete, admin+ only)
//
// Ownership model:
//   user_social_medias is a 1:M child of users. It has its own
//   is_active / is_deleted flags (soft-delete model). Deleted rows
//   are hidden by the GET function's default WHERE filter. Admin +
//   super_admin can restore via POST /:id/restore — instructor/
//   student roles cannot.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateMyUserSocialMediaBody,
  CreateUserSocialMediaBody,
  ListUserSocialMediasQuery,
  UpdateUserSocialMediaBody
} from './user-social-medias.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface UserSocialMediaPlatformDto {
  id: number;
  name: string | null;
  code: string | null;
  baseUrl: string | null;
  platformType: string | null;
  displayOrder: number | null;
  isActive: boolean;
  isDeleted: boolean;
}

export interface UserSocialMediaOwnerDto {
  firstName: string;
  lastName: string;
  email: string | null;
  role: string | null;
  isActive: boolean;
  isDeleted: boolean;
}

export interface UserSocialMediaDto {
  id: number;
  userId: number;
  socialMediaId: number;
  profileUrl: string;
  username: string | null;
  isPrimary: boolean;
  isVerified: boolean;

  createdBy: number | null;
  updatedBy: number | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;

  user: UserSocialMediaOwnerDto;
  platform: UserSocialMediaPlatformDto;
}

// ─── Row shape from udf_get_user_social_medias ──────────────────

interface UserSocialMediaRow {
  usm_id: number | string;
  usm_user_id: number | string;
  usm_social_media_id: number | string;
  usm_profile_url: string;
  usm_username: string | null;
  usm_is_primary: boolean;
  usm_is_verified: boolean;
  usm_created_by: number | string | null;
  usm_updated_by: number | string | null;
  usm_is_active: boolean;
  usm_is_deleted: boolean;
  usm_created_at: Date | string | null;
  usm_updated_at: Date | string | null;
  usm_deleted_at: Date | string | null;

  user_first_name: string;
  user_last_name: string;
  user_email: string | null;
  user_role: string | null;
  user_is_active: boolean;
  user_is_deleted: boolean;

  social_media_name: string | null;
  social_media_code: string | null;
  social_media_base_url: string | null;
  social_media_platform_type: string | null;
  social_media_display_order: number | null;
  social_media_is_active: boolean;
  social_media_is_deleted: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────

const toIso = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const toNumOrNull = (v: number | string | null | undefined): number | null =>
  v == null ? null : Number(v);

const mapUserSocialMedia = (row: UserSocialMediaRow): UserSocialMediaDto => ({
  id: Number(row.usm_id),
  userId: Number(row.usm_user_id),
  socialMediaId: Number(row.usm_social_media_id),
  profileUrl: row.usm_profile_url,
  username: row.usm_username,
  isPrimary: row.usm_is_primary,
  isVerified: row.usm_is_verified,

  createdBy: toNumOrNull(row.usm_created_by),
  updatedBy: toNumOrNull(row.usm_updated_by),
  isActive: row.usm_is_active,
  isDeleted: row.usm_is_deleted,
  createdAt: toIso(row.usm_created_at),
  updatedAt: toIso(row.usm_updated_at),
  deletedAt: toIso(row.usm_deleted_at),

  user: {
    firstName: row.user_first_name,
    lastName: row.user_last_name,
    email: row.user_email,
    role: row.user_role,
    isActive: row.user_is_active,
    isDeleted: row.user_is_deleted
  },

  platform: {
    id: Number(row.usm_social_media_id),
    name: row.social_media_name,
    code: row.social_media_code,
    baseUrl: row.social_media_base_url,
    platformType: row.social_media_platform_type,
    displayOrder: row.social_media_display_order,
    isActive: row.social_media_is_active,
    isDeleted: row.social_media_is_deleted
  }
});

// ─── List ────────────────────────────────────────────────────────

export interface ListUserSocialMediasResult {
  rows: UserSocialMediaDto[];
  meta: PaginationMeta;
}

export const listUserSocialMedias = async (
  q: ListUserSocialMediasQuery
): Promise<ListUserSocialMediasResult> => {
  const { rows, totalCount } = await db.callTableFunction<UserSocialMediaRow>(
    'udf_get_user_social_medias',
    {
      p_user_id: q.userId ?? null,
      p_sort_table: q.sortTable,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_social_media_id: q.socialMediaId ?? null,
      p_filter_platform_type: q.platformType ?? null,
      p_filter_is_primary: q.isPrimary ?? null,
      p_filter_is_verified: q.isVerified ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? null,
      p_filter_user_role: q.userRole ?? null,
      p_filter_user_is_active: q.userIsActive ?? null,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapUserSocialMedia),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ──────────────────────────────────────────────────

export const getUserSocialMediaById = async (
  id: number
): Promise<UserSocialMediaDto | null> => {
  const { rows } = await db.callTableFunction<UserSocialMediaRow>(
    'udf_get_user_social_medias',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapUserSocialMedia(row) : null;
};

// ─── Create ─────────────────────────────────────────────────────

export interface CreateUserSocialMediaResult {
  id: number;
}

const buildInsertParams = (
  userId: number,
  body: Partial<CreateUserSocialMediaBody>,
  callerId: number | null
): Record<string, unknown> => ({
  p_user_id: userId,
  p_social_media_id: body.socialMediaId ?? null,
  p_profile_url: body.profileUrl ?? null,
  p_username: body.username ?? null,
  p_is_primary: body.isPrimary ?? null,
  p_is_verified: body.isVerified ?? null,
  p_is_active: body.isActive ?? null,
  p_actor_id: callerId
});

export const createUserSocialMedia = async (
  body: CreateUserSocialMediaBody,
  callerId: number | null
): Promise<CreateUserSocialMediaResult> => {
  const result = await db.callFunction(
    'udf_insert_user_social_media',
    buildInsertParams(body.userId, body, callerId)
  );
  return { id: Number(result.id) };
};

export const createMyUserSocialMedia = async (
  userId: number,
  body: CreateMyUserSocialMediaBody
): Promise<CreateUserSocialMediaResult> => {
  const result = await db.callFunction(
    'udf_insert_user_social_media',
    buildInsertParams(userId, body, userId)
  );
  return { id: Number(result.id) };
};

// ─── Update ─────────────────────────────────────────────────────

export const updateUserSocialMedia = async (
  id: number,
  body: UpdateUserSocialMediaBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_user_social_media', {
    p_id: id,
    p_social_media_id: body.socialMediaId ?? null,
    p_profile_url: body.profileUrl ?? null,
    p_username: body.username ?? null,
    p_is_primary: body.isPrimary ?? null,
    p_is_verified: body.isVerified ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

// ─── Delete (soft) ──────────────────────────────────────────────

export const deleteUserSocialMedia = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_user_social_media', {
    p_id: id,
    p_actor_id: callerId
  });
};

// ─── Restore (un-soft-delete) ───────────────────────────────────

export const restoreUserSocialMedia = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_user_social_media', {
    p_id: id,
    p_actor_id: callerId
  });
};

// Helper used by the restore route — the default get-UDF hides
// soft-deleted rows, so we fall back to an explicit
// p_filter_is_deleted=true lookup if the visible query comes back
// empty. This lets the restore route surface a clean 404.
export const getUserSocialMediaByIdIncludingDeleted = async (
  id: number
): Promise<UserSocialMediaDto | null> => {
  const visible = await db.callTableFunction<UserSocialMediaRow>(
    'udf_get_user_social_medias',
    { p_id: id }
  );
  if (visible.rows.length > 0) return mapUserSocialMedia(visible.rows[0]!);

  const deleted = await db.callTableFunction<UserSocialMediaRow>(
    'udf_get_user_social_medias',
    { p_id: id, p_filter_is_deleted: true }
  );
  return deleted.rows[0] ? mapUserSocialMedia(deleted.rows[0]) : null;
};
