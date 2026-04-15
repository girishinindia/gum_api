// ═══════════════════════════════════════════════════════════════
// user-languages.service — UDF wrappers for /api/v1/user-languages.
//
// Talks to phase-04 UDFs:
//   - udf_get_user_languages    (read / list with filters + sort)
//   - udf_insert_user_language  (create, 1:M with users)
//   - udf_update_user_language  (partial update, COALESCE pattern)
//   - udf_delete_user_language  (soft-delete)
//   - udf_restore_user_language (un-soft-delete, admin+ only)
//
// Ownership model:
//   user_languages is a 1:M child of users. It has its own
//   is_active / is_deleted flags (soft-delete model). Deleted rows
//   are hidden by the GET function's default WHERE filter. Admin +
//   super_admin can restore via POST /:id/restore — instructor/
//   student roles cannot.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateMyUserLanguageBody,
  CreateUserLanguageBody,
  ListUserLanguagesQuery,
  UpdateUserLanguageBody
} from './user-languages.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface UserLanguageMasterDto {
  id: number;
  name: string | null;
  nativeName: string | null;
  isoCode: string | null;
  script: string | null;
  isActive: boolean;
  isDeleted: boolean;
}

export interface UserLanguageOwnerDto {
  firstName: string;
  lastName: string;
  email: string | null;
  role: string | null;
  isActive: boolean;
  isDeleted: boolean;
}

export interface UserLanguageDto {
  id: number;
  userId: number;
  languageId: number;
  proficiencyLevel: string | null;
  canRead: boolean;
  canWrite: boolean;
  canSpeak: boolean;
  isPrimary: boolean;
  isNative: boolean;

  createdBy: number | null;
  updatedBy: number | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;

  user: UserLanguageOwnerDto;
  language: UserLanguageMasterDto;
}

// ─── Row shape from udf_get_user_languages ──────────────────

interface UserLanguageRow {
  ulang_id: number | string;
  ulang_user_id: number | string;
  ulang_language_id: number | string;
  ulang_proficiency_level: string | null;
  ulang_can_read: boolean;
  ulang_can_write: boolean;
  ulang_can_speak: boolean;
  ulang_is_primary: boolean;
  ulang_is_native: boolean;
  ulang_created_by: number | string | null;
  ulang_updated_by: number | string | null;
  ulang_is_active: boolean;
  ulang_is_deleted: boolean;
  ulang_created_at: Date | string | null;
  ulang_updated_at: Date | string | null;
  ulang_deleted_at: Date | string | null;

  user_first_name: string;
  user_last_name: string;
  user_email: string | null;
  user_role: string | null;
  user_is_active: boolean;
  user_is_deleted: boolean;

  language_name: string | null;
  language_native_name: string | null;
  language_iso_code: string | null;
  language_script: string | null;
  language_is_active: boolean;
  language_is_deleted: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────

const toIso = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const toNumOrNull = (v: number | string | null | undefined): number | null =>
  v == null ? null : Number(v);

const mapUserLanguage = (row: UserLanguageRow): UserLanguageDto => ({
  id: Number(row.ulang_id),
  userId: Number(row.ulang_user_id),
  languageId: Number(row.ulang_language_id),
  proficiencyLevel: row.ulang_proficiency_level,
  canRead: row.ulang_can_read,
  canWrite: row.ulang_can_write,
  canSpeak: row.ulang_can_speak,
  isPrimary: row.ulang_is_primary,
  isNative: row.ulang_is_native,

  createdBy: toNumOrNull(row.ulang_created_by),
  updatedBy: toNumOrNull(row.ulang_updated_by),
  isActive: row.ulang_is_active,
  isDeleted: row.ulang_is_deleted,
  createdAt: toIso(row.ulang_created_at),
  updatedAt: toIso(row.ulang_updated_at),
  deletedAt: toIso(row.ulang_deleted_at),

  user: {
    firstName: row.user_first_name,
    lastName: row.user_last_name,
    email: row.user_email,
    role: row.user_role,
    isActive: row.user_is_active,
    isDeleted: row.user_is_deleted
  },

  language: {
    id: Number(row.ulang_language_id),
    name: row.language_name,
    nativeName: row.language_native_name,
    isoCode: row.language_iso_code,
    script: row.language_script,
    isActive: row.language_is_active,
    isDeleted: row.language_is_deleted
  }
});

// ─── List ────────────────────────────────────────────────────────

export interface ListUserLanguagesResult {
  rows: UserLanguageDto[];
  meta: PaginationMeta;
}

export const listUserLanguages = async (
  q: ListUserLanguagesQuery
): Promise<ListUserLanguagesResult> => {
  const { rows, totalCount } = await db.callTableFunction<UserLanguageRow>(
    'udf_get_user_languages',
    {
      p_user_id: q.userId ?? null,
      p_sort_table: q.sortTable,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_language_id: q.languageId ?? null,
      p_filter_proficiency_level: q.proficiencyLevel ?? null,
      p_filter_language_script: q.languageScript ?? null,
      p_filter_is_primary: q.isPrimary ?? null,
      p_filter_is_native: q.isNative ?? null,
      p_filter_can_read: q.canRead ?? null,
      p_filter_can_write: q.canWrite ?? null,
      p_filter_can_speak: q.canSpeak ?? null,
      p_filter_is_active: q.isActive ?? null,
      // Tri-state: 'all' (super-admin default) → no equality filter; true/false → equality;
      // undefined → callTableFunction strips null and the UDF default-hides.
      p_filter_is_deleted: q.isDeleted === 'all' ? null : (q.isDeleted ?? null),
      p_filter_user_role: q.userRole ?? null,
      p_filter_user_is_active: q.userIsActive ?? null,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapUserLanguage),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ──────────────────────────────────────────────────

export const getUserLanguageById = async (
  id: number
): Promise<UserLanguageDto | null> => {
  const { rows } = await db.callTableFunction<UserLanguageRow>(
    'udf_get_user_languages',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapUserLanguage(row) : null;
};

// ─── Create ─────────────────────────────────────────────────────

export interface CreateUserLanguageResult {
  id: number;
}

const buildInsertParams = (
  userId: number,
  body: Partial<CreateUserLanguageBody>,
  callerId: number | null
): Record<string, unknown> => ({
  p_user_id: userId,
  p_language_id: body.languageId ?? null,
  p_proficiency_level: body.proficiencyLevel ?? null,
  p_can_read: body.canRead ?? null,
  p_can_write: body.canWrite ?? null,
  p_can_speak: body.canSpeak ?? null,
  p_is_primary: body.isPrimary ?? null,
  p_is_native: body.isNative ?? null,
  p_is_active: body.isActive ?? null,
  p_actor_id: callerId
});

export const createUserLanguage = async (
  body: CreateUserLanguageBody,
  callerId: number | null
): Promise<CreateUserLanguageResult> => {
  const result = await db.callFunction(
    'udf_insert_user_language',
    buildInsertParams(body.userId, body, callerId)
  );
  return { id: Number(result.id) };
};

export const createMyUserLanguage = async (
  userId: number,
  body: CreateMyUserLanguageBody
): Promise<CreateUserLanguageResult> => {
  const result = await db.callFunction(
    'udf_insert_user_language',
    buildInsertParams(userId, body, userId)
  );
  return { id: Number(result.id) };
};

// ─── Update ─────────────────────────────────────────────────────

export const updateUserLanguage = async (
  id: number,
  body: UpdateUserLanguageBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_user_language', {
    p_id: id,
    p_language_id: body.languageId ?? null,
    p_proficiency_level: body.proficiencyLevel ?? null,
    p_can_read: body.canRead ?? null,
    p_can_write: body.canWrite ?? null,
    p_can_speak: body.canSpeak ?? null,
    p_is_primary: body.isPrimary ?? null,
    p_is_native: body.isNative ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

// ─── Delete (soft) ──────────────────────────────────────────────

export const deleteUserLanguage = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_user_language', {
    p_id: id,
    p_actor_id: callerId
  });
};

// ─── Restore (un-soft-delete) ───────────────────────────────────

export const restoreUserLanguage = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_user_language', {
    p_id: id,
    p_actor_id: callerId
  });
};

// Helper used by the restore route — the default get-UDF hides
// soft-deleted rows, so we fall back to an explicit
// p_filter_is_deleted=true lookup if the visible query comes back
// empty. This lets the restore route surface a clean 404.
export const getUserLanguageByIdIncludingDeleted = async (
  id: number
): Promise<UserLanguageDto | null> => {
  const visible = await db.callTableFunction<UserLanguageRow>(
    'udf_get_user_languages',
    { p_id: id }
  );
  if (visible.rows.length > 0) return mapUserLanguage(visible.rows[0]!);

  const deleted = await db.callTableFunction<UserLanguageRow>(
    'udf_get_user_languages',
    { p_id: id, p_filter_is_deleted: true }
  );
  return deleted.rows[0] ? mapUserLanguage(deleted.rows[0]) : null;
};
