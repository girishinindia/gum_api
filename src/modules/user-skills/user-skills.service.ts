// ═══════════════════════════════════════════════════════════════
// user-skills.service — UDF wrappers for /api/v1/user-skills.
//
// Talks to phase-04 UDFs:
//   - udf_get_user_skills    (read / list with filters + sort)
//   - udf_insert_user_skill  (create, 1:M with users)
//   - udf_update_user_skill  (partial update, COALESCE pattern)
//   - udf_delete_user_skill  (soft-delete)
//   - udf_restore_user_skill (un-soft-delete, admin+ only)
//
// Ownership model:
//   user_skills is a 1:M child of users. It has its own
//   is_active / is_deleted flags (soft-delete model). Deleted rows
//   are hidden by the GET function's default WHERE filter. Admin +
//   super_admin can restore via POST /:id/restore — instructor/
//   student roles cannot.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateMyUserSkillBody,
  CreateUserSkillBody,
  ListUserSkillsQuery,
  UpdateUserSkillBody
} from './user-skills.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface UserSkillMasterDto {
  id: number;
  name: string | null;
  category: string | null;
  description: string | null;
  isActive: boolean;
  isDeleted: boolean;
}

export interface UserSkillOwnerDto {
  firstName: string;
  lastName: string;
  email: string | null;
  role: string | null;
  isActive: boolean;
  isDeleted: boolean;
}

export interface UserSkillDto {
  id: number;
  userId: number;
  skillId: number;
  proficiencyLevel: string | null;
  yearsOfExperience: number | null;
  isPrimary: boolean;
  certificateUrl: string | null;
  endorsementCount: number;

  createdBy: number | null;
  updatedBy: number | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;

  user: UserSkillOwnerDto;
  skill: UserSkillMasterDto;
}

// ─── Row shape from udf_get_user_skills ──────────────────

interface UserSkillRow {
  uskill_id: number | string;
  uskill_user_id: number | string;
  uskill_skill_id: number | string;
  uskill_proficiency_level: string | null;
  uskill_years_of_experience: number | string | null;
  uskill_is_primary: boolean;
  uskill_certificate_url: string | null;
  uskill_endorsement_count: number | string;
  uskill_created_by: number | string | null;
  uskill_updated_by: number | string | null;
  uskill_is_active: boolean;
  uskill_is_deleted: boolean;
  uskill_created_at: Date | string | null;
  uskill_updated_at: Date | string | null;
  uskill_deleted_at: Date | string | null;

  user_first_name: string;
  user_last_name: string;
  user_email: string | null;
  user_role: string | null;
  user_is_active: boolean;
  user_is_deleted: boolean;

  skill_name: string | null;
  skill_category: string | null;
  skill_description: string | null;
  skill_is_active: boolean;
  skill_is_deleted: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────

const toIso = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const toNumOrNull = (v: number | string | null | undefined): number | null =>
  v == null ? null : Number(v);

const mapUserSkill = (row: UserSkillRow): UserSkillDto => ({
  id: Number(row.uskill_id),
  userId: Number(row.uskill_user_id),
  skillId: Number(row.uskill_skill_id),
  proficiencyLevel: row.uskill_proficiency_level,
  yearsOfExperience: toNumOrNull(row.uskill_years_of_experience),
  isPrimary: row.uskill_is_primary,
  certificateUrl: row.uskill_certificate_url,
  endorsementCount: Number(row.uskill_endorsement_count),

  createdBy: toNumOrNull(row.uskill_created_by),
  updatedBy: toNumOrNull(row.uskill_updated_by),
  isActive: row.uskill_is_active,
  isDeleted: row.uskill_is_deleted,
  createdAt: toIso(row.uskill_created_at),
  updatedAt: toIso(row.uskill_updated_at),
  deletedAt: toIso(row.uskill_deleted_at),

  user: {
    firstName: row.user_first_name,
    lastName: row.user_last_name,
    email: row.user_email,
    role: row.user_role,
    isActive: row.user_is_active,
    isDeleted: row.user_is_deleted
  },

  skill: {
    id: Number(row.uskill_skill_id),
    name: row.skill_name,
    category: row.skill_category,
    description: row.skill_description,
    isActive: row.skill_is_active,
    isDeleted: row.skill_is_deleted
  }
});

// ─── List ────────────────────────────────────────────────────────

export interface ListUserSkillsResult {
  rows: UserSkillDto[];
  meta: PaginationMeta;
}

export const listUserSkills = async (
  q: ListUserSkillsQuery
): Promise<ListUserSkillsResult> => {
  const { rows, totalCount } = await db.callTableFunction<UserSkillRow>(
    'udf_get_user_skills',
    {
      p_user_id: q.userId ?? null,
      p_sort_table: q.sortTable,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_skill_id: q.skillId ?? null,
      p_filter_proficiency_level: q.proficiencyLevel ?? null,
      p_filter_skill_category: q.skillCategory ?? null,
      p_filter_is_primary: q.isPrimary ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? null,
      p_filter_min_experience: q.minExperience ?? null,
      p_filter_user_role: q.userRole ?? null,
      p_filter_user_is_active: q.userIsActive ?? null,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapUserSkill),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ──────────────────────────────────────────────────

export const getUserSkillById = async (
  id: number
): Promise<UserSkillDto | null> => {
  const { rows } = await db.callTableFunction<UserSkillRow>(
    'udf_get_user_skills',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapUserSkill(row) : null;
};

// ─── Create ─────────────────────────────────────────────────────

export interface CreateUserSkillResult {
  id: number;
}

const buildInsertParams = (
  userId: number,
  body: Partial<CreateUserSkillBody>,
  callerId: number | null
): Record<string, unknown> => ({
  p_user_id: userId,
  p_skill_id: body.skillId ?? null,
  p_proficiency_level: body.proficiencyLevel ?? null,
  p_years_of_experience: body.yearsOfExperience ?? null,
  p_is_primary: body.isPrimary ?? null,
  p_certificate_url: body.certificateUrl ?? null,
  p_endorsement_count: body.endorsementCount ?? null,
  p_is_active: body.isActive ?? null,
  p_actor_id: callerId
});

export const createUserSkill = async (
  body: CreateUserSkillBody,
  callerId: number | null
): Promise<CreateUserSkillResult> => {
  const result = await db.callFunction(
    'udf_insert_user_skill',
    buildInsertParams(body.userId, body, callerId)
  );
  return { id: Number(result.id) };
};

export const createMyUserSkill = async (
  userId: number,
  body: CreateMyUserSkillBody
): Promise<CreateUserSkillResult> => {
  const result = await db.callFunction(
    'udf_insert_user_skill',
    buildInsertParams(userId, body, userId)
  );
  return { id: Number(result.id) };
};

// ─── Update ─────────────────────────────────────────────────────

export const updateUserSkill = async (
  id: number,
  body: UpdateUserSkillBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_user_skill', {
    p_id: id,
    p_skill_id: body.skillId ?? null,
    p_proficiency_level: body.proficiencyLevel ?? null,
    p_years_of_experience: body.yearsOfExperience ?? null,
    p_is_primary: body.isPrimary ?? null,
    p_certificate_url: body.certificateUrl ?? null,
    p_endorsement_count: body.endorsementCount ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

// ─── Delete (soft) ──────────────────────────────────────────────

export const deleteUserSkill = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_user_skill', {
    p_id: id,
    p_actor_id: callerId
  });
};

// ─── Restore (un-soft-delete) ───────────────────────────────────

export const restoreUserSkill = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_user_skill', {
    p_id: id,
    p_actor_id: callerId
  });
};

// Helper used by the restore route — the default get-UDF hides
// soft-deleted rows, so we fall back to an explicit
// p_filter_is_deleted=true lookup if the visible query comes back
// empty. This lets the restore route surface a clean 404.
export const getUserSkillByIdIncludingDeleted = async (
  id: number
): Promise<UserSkillDto | null> => {
  const visible = await db.callTableFunction<UserSkillRow>(
    'udf_get_user_skills',
    { p_id: id }
  );
  if (visible.rows.length > 0) return mapUserSkill(visible.rows[0]!);

  const deleted = await db.callTableFunction<UserSkillRow>(
    'udf_get_user_skills',
    { p_id: id, p_filter_is_deleted: true }
  );
  return deleted.rows[0] ? mapUserSkill(deleted.rows[0]) : null;
};
