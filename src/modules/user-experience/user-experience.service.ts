// ═══════════════════════════════════════════════════════════════
// user-experience.service — UDF wrappers for /api/v1/user-experience.
//
// Talks to phase-04 UDFs:
//   - udf_get_user_experience      (read / list with filters + sort)
//   - udf_insert_user_experience   (create, 1:M with users)
//   - udf_update_user_experience   (partial update, COALESCE pattern)
//   - udf_delete_user_experience   (soft-delete)
//   - udf_restore_user_experience  (un-soft-delete, admin+ only)
//
// A soft-deleted experience row is hidden by the GET function's
// default WHERE filter. Admin + super_admin can restore via
// POST /:id/restore — instructor/student have no restore path.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateMyUserExperienceBody,
  CreateUserExperienceBody,
  ListUserExperienceQuery,
  UpdateUserExperienceBody
} from './user-experience.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface UserExperienceDesignationDto {
  id: number | null;
  name: string | null;
  code: string | null;
  level: number | null;
  levelBand: string | null;
  isActive: boolean | null;
  isDeleted: boolean | null;
}

export interface UserExperienceOwnerDto {
  firstName: string;
  lastName: string;
  email: string | null;
  role: string | null;
  isActive: boolean;
  isDeleted: boolean;
}

export interface UserExperienceDto {
  id: number;
  userId: number;
  designationId: number | null;
  companyName: string;
  jobTitle: string;
  employmentType: string;
  department: string | null;
  location: string | null;
  workMode: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrentJob: boolean;
  description: string | null;
  keyAchievements: string | null;
  skillsUsed: string | null;
  salaryRange: string | null;
  referenceName: string | null;
  referencePhone: string | null;
  referenceEmail: string | null;

  createdBy: number | null;
  updatedBy: number | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;

  user: UserExperienceOwnerDto;
  designation: UserExperienceDesignationDto;
}

// ─── Row shape returned by udf_get_user_experience ───────────────

interface UserExperienceRow {
  exp_id: number | string;
  exp_user_id: number | string;
  exp_designation_id: number | string | null;
  exp_company_name: string;
  exp_job_title: string;
  exp_employment_type: string;
  exp_department: string | null;
  exp_location: string | null;
  exp_work_mode: string | null;
  exp_start_date: Date | string | null;
  exp_end_date: Date | string | null;
  exp_is_current_job: boolean;
  exp_description: string | null;
  exp_key_achievements: string | null;
  exp_skills_used: string | null;
  exp_salary_range: string | null;
  exp_reference_name: string | null;
  exp_reference_phone: string | null;
  exp_reference_email: string | null;
  exp_created_by: number | string | null;
  exp_updated_by: number | string | null;
  exp_is_active: boolean;
  exp_is_deleted: boolean;
  exp_created_at: Date | string | null;
  exp_updated_at: Date | string | null;
  exp_deleted_at: Date | string | null;

  user_first_name: string;
  user_last_name: string;
  user_email: string | null;
  user_role: string | null;
  user_is_active: boolean;
  user_is_deleted: boolean;

  designation_name: string | null;
  designation_code: string | null;
  designation_level: number | null;
  designation_level_band: string | null;
  designation_is_active: boolean | null;
  designation_is_deleted: boolean | null;
}

// ─── Helpers ─────────────────────────────────────────────────────

const toIso = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

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

const mapUserExperience = (row: UserExperienceRow): UserExperienceDto => ({
  id: Number(row.exp_id),
  userId: Number(row.exp_user_id),
  designationId: toNumOrNull(row.exp_designation_id),
  companyName: row.exp_company_name,
  jobTitle: row.exp_job_title,
  employmentType: row.exp_employment_type,
  department: row.exp_department,
  location: row.exp_location,
  workMode: row.exp_work_mode,
  startDate: toIsoDate(row.exp_start_date),
  endDate: toIsoDate(row.exp_end_date),
  isCurrentJob: row.exp_is_current_job,
  description: row.exp_description,
  keyAchievements: row.exp_key_achievements,
  skillsUsed: row.exp_skills_used,
  salaryRange: row.exp_salary_range,
  referenceName: row.exp_reference_name,
  referencePhone: row.exp_reference_phone,
  referenceEmail: row.exp_reference_email,

  createdBy: toNumOrNull(row.exp_created_by),
  updatedBy: toNumOrNull(row.exp_updated_by),
  isActive: row.exp_is_active,
  isDeleted: row.exp_is_deleted,
  createdAt: toIso(row.exp_created_at),
  updatedAt: toIso(row.exp_updated_at),
  deletedAt: toIso(row.exp_deleted_at),

  user: {
    firstName: row.user_first_name,
    lastName: row.user_last_name,
    email: row.user_email,
    role: row.user_role,
    isActive: row.user_is_active,
    isDeleted: row.user_is_deleted
  },

  designation: {
    id: toNumOrNull(row.exp_designation_id),
    name: row.designation_name,
    code: row.designation_code,
    level: row.designation_level,
    levelBand: row.designation_level_band,
    isActive: row.designation_is_active,
    isDeleted: row.designation_is_deleted
  }
});

// ─── List ────────────────────────────────────────────────────────

export interface ListUserExperienceResult {
  rows: UserExperienceDto[];
  meta: PaginationMeta;
}

export const listUserExperience = async (
  q: ListUserExperienceQuery
): Promise<ListUserExperienceResult> => {
  const { rows, totalCount } = await db.callTableFunction<UserExperienceRow>(
    'udf_get_user_experience',
    {
      p_user_id: q.userId ?? null,
      p_sort_table: q.sortTable,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_designation_id: q.designationId ?? null,
      p_filter_employment_type: q.employmentType ?? null,
      p_filter_work_mode: q.workMode ?? null,
      p_filter_level_band: q.levelBand ?? null,
      p_filter_is_current_job: q.isCurrentJob ?? null,
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
    rows: rows.map(mapUserExperience),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ───────────────────────────────────────────────────

export const getUserExperienceById = async (
  id: number
): Promise<UserExperienceDto | null> => {
  const { rows } = await db.callTableFunction<UserExperienceRow>(
    'udf_get_user_experience',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapUserExperience(row) : null;
};

// ─── Create ──────────────────────────────────────────────────────

export interface CreateUserExperienceResult {
  id: number;
}

const buildInsertParams = (
  userId: number,
  body: Partial<CreateUserExperienceBody>,
  callerId: number | null
): Record<string, unknown> => ({
  p_user_id: userId,
  p_company_name: body.companyName ?? null,
  p_job_title: body.jobTitle ?? null,
  p_start_date: body.startDate ?? null,
  p_designation_id: body.designationId ?? null,
  p_employment_type: body.employmentType ?? null,
  p_department: body.department ?? null,
  p_location: body.location ?? null,
  p_work_mode: body.workMode ?? null,
  p_end_date: body.endDate ?? null,
  p_is_current_job: body.isCurrentJob ?? null,
  p_description: body.description ?? null,
  p_key_achievements: body.keyAchievements ?? null,
  p_skills_used: body.skillsUsed ?? null,
  p_salary_range: body.salaryRange ?? null,
  p_reference_name: body.referenceName ?? null,
  p_reference_phone: body.referencePhone ?? null,
  p_reference_email: body.referenceEmail ?? null,
  p_is_active: body.isActive ?? null,
  p_actor_id: callerId
});

export const createUserExperience = async (
  body: CreateUserExperienceBody,
  callerId: number | null
): Promise<CreateUserExperienceResult> => {
  const result = await db.callFunction(
    'udf_insert_user_experience',
    buildInsertParams(body.userId, body, callerId)
  );
  return { id: Number(result.id) };
};

export const createMyUserExperience = async (
  userId: number,
  body: CreateMyUserExperienceBody
): Promise<CreateUserExperienceResult> => {
  const result = await db.callFunction(
    'udf_insert_user_experience',
    buildInsertParams(userId, body, userId)
  );
  return { id: Number(result.id) };
};

// ─── Update ──────────────────────────────────────────────────────

export const updateUserExperience = async (
  id: number,
  body: UpdateUserExperienceBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_user_experience', {
    p_id: id,
    p_designation_id: body.designationId ?? null,
    p_company_name: body.companyName ?? null,
    p_job_title: body.jobTitle ?? null,
    p_employment_type: body.employmentType ?? null,
    p_department: body.department ?? null,
    p_location: body.location ?? null,
    p_work_mode: body.workMode ?? null,
    p_start_date: body.startDate ?? null,
    p_end_date: body.endDate ?? null,
    p_is_current_job: body.isCurrentJob ?? null,
    p_description: body.description ?? null,
    p_key_achievements: body.keyAchievements ?? null,
    p_skills_used: body.skillsUsed ?? null,
    p_salary_range: body.salaryRange ?? null,
    p_reference_name: body.referenceName ?? null,
    p_reference_phone: body.referencePhone ?? null,
    p_reference_email: body.referenceEmail ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

// ─── Delete (soft) ──────────────────────────────────────────────

export const deleteUserExperience = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_user_experience', {
    p_id: id,
    p_actor_id: callerId
  });
};

// ─── Restore (un-soft-delete) ───────────────────────────────────
//
// Admin + super_admin only (gated at the route layer via the
// 'user_experience.restore' permission). The UDF also validates
// that the owning user is still active and that the optional
// designation reference — if present — is still active.

export const restoreUserExperience = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_user_experience', {
    p_id: id,
    p_actor_id: callerId
  });
};

// Helper used by the restore route — fetches a row even if it is
// still soft-deleted (for the pre-restore preview case). First
// tries the default visible query; if nothing comes back, fetches
// with p_filter_is_deleted = true.
export const getUserExperienceByIdIncludingDeleted = async (
  id: number
): Promise<UserExperienceDto | null> => {
  const visible = await db.callTableFunction<UserExperienceRow>(
    'udf_get_user_experience',
    { p_id: id }
  );
  if (visible.rows.length > 0) return mapUserExperience(visible.rows[0]!);

  const deleted = await db.callTableFunction<UserExperienceRow>(
    'udf_get_user_experience',
    { p_id: id, p_filter_is_deleted: true }
  );
  return deleted.rows[0] ? mapUserExperience(deleted.rows[0]) : null;
};
