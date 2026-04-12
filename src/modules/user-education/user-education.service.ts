// ═══════════════════════════════════════════════════════════════
// user-education.service — UDF wrappers for /api/v1/user-education.
//
// Talks to phase-04 UDFs:
//   - udf_get_user_education       (read / list with filters + sort)
//   - udf_insert_user_education    (create, 1:M with users)
//   - udf_update_user_education    (partial update, COALESCE pattern)
//   - udf_delete_user_education    (soft-delete)
//   - udf_restore_user_education   (un-soft-delete, admin+ only)
//
// Ownership model:
//   user_education is a 1:M child of users. It has its own
//   is_active / is_deleted flags (soft-delete model). A deleted
//   education row is hidden by the GET function's default WHERE
//   filter. Admins + super admins can restore a soft-deleted row
//   via POST /:id/restore — instructor/student roles cannot (they
//   never see the deleted row and have no own-scope restore).
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateMyUserEducationBody,
  CreateUserEducationBody,
  ListUserEducationQuery,
  UpdateUserEducationBody
} from './user-education.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface UserEducationLevelDto {
  id: number;
  name: string | null;
  abbreviation: string | null;
  levelOrder: number | null;
  levelCategory: string | null;
  typicalDuration: string | null;
  isActive: boolean;
  isDeleted: boolean;
}

export interface UserEducationOwnerDto {
  firstName: string;
  lastName: string;
  email: string | null;
  role: string | null;
  isActive: boolean;
  isDeleted: boolean;
}

export interface UserEducationDto {
  id: number;
  userId: number;
  educationLevelId: number;
  institutionName: string;
  boardOrUniversity: string | null;
  fieldOfStudy: string | null;
  specialization: string | null;
  gradeOrPercentage: string | null;
  gradeType: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrentlyStudying: boolean;
  isHighestQualification: boolean;
  certificateUrl: string | null;
  description: string | null;

  createdBy: number | null;
  updatedBy: number | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;

  user: UserEducationOwnerDto;
  level: UserEducationLevelDto;
}

// ─── Row shape returned by udf_get_user_education ────────────────

interface UserEducationRow {
  edu_id: number | string;
  edu_user_id: number | string;
  edu_level_id: number | string;
  edu_institution_name: string;
  edu_board_or_university: string | null;
  edu_field_of_study: string | null;
  edu_specialization: string | null;
  edu_grade_or_percentage: string | null;
  edu_grade_type: string | null;
  edu_start_date: Date | string | null;
  edu_end_date: Date | string | null;
  edu_is_currently_studying: boolean;
  edu_is_highest_qualification: boolean;
  edu_certificate_url: string | null;
  edu_description: string | null;
  edu_created_by: number | string | null;
  edu_updated_by: number | string | null;
  edu_is_active: boolean;
  edu_is_deleted: boolean;
  edu_created_at: Date | string | null;
  edu_updated_at: Date | string | null;
  edu_deleted_at: Date | string | null;

  user_first_name: string;
  user_last_name: string;
  user_email: string | null;
  user_role: string | null;
  user_is_active: boolean;
  user_is_deleted: boolean;

  education_level_name: string | null;
  education_level_abbreviation: string | null;
  education_level_level_order: number | null;
  education_level_level_category: string | null;
  education_level_typical_duration: string | null;
  education_level_is_active: boolean;
  education_level_is_deleted: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────

const toIso = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

// Start/end dates are DATE columns — keep the wire format date-only.
const toIsoDate = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dt = new Date(s);
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, '0');
  const dy = String(dt.getDate()).padStart(2, '0');
  return `${y}-${mo}-${dy}`;
};

const toNumOrNull = (v: number | string | null | undefined): number | null =>
  v == null ? null : Number(v);

const mapUserEducation = (row: UserEducationRow): UserEducationDto => ({
  id: Number(row.edu_id),
  userId: Number(row.edu_user_id),
  educationLevelId: Number(row.edu_level_id),
  institutionName: row.edu_institution_name,
  boardOrUniversity: row.edu_board_or_university,
  fieldOfStudy: row.edu_field_of_study,
  specialization: row.edu_specialization,
  gradeOrPercentage: row.edu_grade_or_percentage,
  gradeType: row.edu_grade_type,
  startDate: toIsoDate(row.edu_start_date),
  endDate: toIsoDate(row.edu_end_date),
  isCurrentlyStudying: row.edu_is_currently_studying,
  isHighestQualification: row.edu_is_highest_qualification,
  certificateUrl: row.edu_certificate_url,
  description: row.edu_description,

  createdBy: toNumOrNull(row.edu_created_by),
  updatedBy: toNumOrNull(row.edu_updated_by),
  isActive: row.edu_is_active,
  isDeleted: row.edu_is_deleted,
  createdAt: toIso(row.edu_created_at),
  updatedAt: toIso(row.edu_updated_at),
  deletedAt: toIso(row.edu_deleted_at),

  user: {
    firstName: row.user_first_name,
    lastName: row.user_last_name,
    email: row.user_email,
    role: row.user_role,
    isActive: row.user_is_active,
    isDeleted: row.user_is_deleted
  },

  level: {
    id: Number(row.edu_level_id),
    name: row.education_level_name,
    abbreviation: row.education_level_abbreviation,
    levelOrder: row.education_level_level_order,
    levelCategory: row.education_level_level_category,
    typicalDuration: row.education_level_typical_duration,
    isActive: row.education_level_is_active,
    isDeleted: row.education_level_is_deleted
  }
});

// ─── List ────────────────────────────────────────────────────────

export interface ListUserEducationResult {
  rows: UserEducationDto[];
  meta: PaginationMeta;
}

export const listUserEducation = async (
  q: ListUserEducationQuery
): Promise<ListUserEducationResult> => {
  const { rows, totalCount } = await db.callTableFunction<UserEducationRow>(
    'udf_get_user_education',
    {
      p_user_id: q.userId ?? null,
      p_sort_table: q.sortTable,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_education_level_id: q.educationLevelId ?? null,
      p_filter_level_category: q.levelCategory ?? null,
      p_filter_grade_type: q.gradeType ?? null,
      p_filter_is_currently_studying: q.isCurrentlyStudying ?? null,
      p_filter_is_highest: q.isHighest ?? null,
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
    rows: rows.map(mapUserEducation),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ──────────────────────────────────────────────────

export const getUserEducationById = async (
  id: number
): Promise<UserEducationDto | null> => {
  const { rows } = await db.callTableFunction<UserEducationRow>(
    'udf_get_user_education',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapUserEducation(row) : null;
};

// ─── Create ─────────────────────────────────────────────────────

export interface CreateUserEducationResult {
  id: number;
}

const buildInsertParams = (
  userId: number,
  body: Partial<CreateUserEducationBody>,
  callerId: number | null
): Record<string, unknown> => ({
  p_user_id: userId,
  p_education_level_id: body.educationLevelId ?? null,
  p_institution_name: body.institutionName ?? null,
  p_board_or_university: body.boardOrUniversity ?? null,
  p_field_of_study: body.fieldOfStudy ?? null,
  p_specialization: body.specialization ?? null,
  p_grade_or_percentage: body.gradeOrPercentage ?? null,
  p_grade_type: body.gradeType ?? null,
  p_start_date: body.startDate ?? null,
  p_end_date: body.endDate ?? null,
  p_is_currently_studying: body.isCurrentlyStudying ?? null,
  p_is_highest_qualification: body.isHighestQualification ?? null,
  p_certificate_url: body.certificateUrl ?? null,
  p_description: body.description ?? null,
  p_is_active: body.isActive ?? null,
  p_actor_id: callerId
});

export const createUserEducation = async (
  body: CreateUserEducationBody,
  callerId: number | null
): Promise<CreateUserEducationResult> => {
  const result = await db.callFunction(
    'udf_insert_user_education',
    buildInsertParams(body.userId, body, callerId)
  );
  return { id: Number(result.id) };
};

export const createMyUserEducation = async (
  userId: number,
  body: CreateMyUserEducationBody
): Promise<CreateUserEducationResult> => {
  const result = await db.callFunction(
    'udf_insert_user_education',
    buildInsertParams(userId, body, userId)
  );
  return { id: Number(result.id) };
};

// ─── Update ─────────────────────────────────────────────────────

export const updateUserEducation = async (
  id: number,
  body: UpdateUserEducationBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_user_education', {
    p_id: id,
    p_education_level_id: body.educationLevelId ?? null,
    p_institution_name: body.institutionName ?? null,
    p_board_or_university: body.boardOrUniversity ?? null,
    p_field_of_study: body.fieldOfStudy ?? null,
    p_specialization: body.specialization ?? null,
    p_grade_or_percentage: body.gradeOrPercentage ?? null,
    p_grade_type: body.gradeType ?? null,
    p_start_date: body.startDate ?? null,
    p_end_date: body.endDate ?? null,
    p_is_currently_studying: body.isCurrentlyStudying ?? null,
    p_is_highest_qualification: body.isHighestQualification ?? null,
    p_certificate_url: body.certificateUrl ?? null,
    p_description: body.description ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

// ─── Delete (soft) ──────────────────────────────────────────────
//
// Soft-delete — sets is_deleted = TRUE, is_active = FALSE,
// deleted_at = now(). Row is hidden from default GET, but can be
// un-deleted via restoreUserEducation (admin+ only).

export const deleteUserEducation = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_user_education', {
    p_id: id,
    p_actor_id: callerId
  });
};

// ─── Restore (un-soft-delete) ───────────────────────────────────
//
// Admin + super_admin only (gated at the route layer via the
// 'user_education.restore' permission). The UDF also validates
// that the owning user and the referenced education_level are
// both still active — orphan restores are rejected.
//
// After restore the row is visible again by default GET.

export const restoreUserEducation = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_user_education', {
    p_id: id,
    p_actor_id: callerId
  });
};

// Helper used by the restore route — the default get-UDF hides
// soft-deleted rows (phase-04 policy), so we fall back to an
// explicit p_filter_is_deleted=true lookup if the visible query
// comes back empty. This lets the restore route surface a clean
// 404 before calling the restore UDF.
export const getUserEducationByIdIncludingDeleted = async (
  id: number
): Promise<UserEducationDto | null> => {
  const visible = await db.callTableFunction<UserEducationRow>(
    'udf_get_user_education',
    { p_id: id }
  );
  if (visible.rows.length > 0) return mapUserEducation(visible.rows[0]!);

  const deleted = await db.callTableFunction<UserEducationRow>(
    'udf_get_user_education',
    { p_id: id, p_filter_is_deleted: true }
  );
  return deleted.rows[0] ? mapUserEducation(deleted.rows[0]) : null;
};
