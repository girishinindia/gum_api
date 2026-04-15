// ═══════════════════════════════════════════════════════════════
// user-projects.service — UDF wrappers for /api/v1/user-projects.
//
// Talks to phase-04 UDFs:
//   - udf_get_user_projects    (read / list with filters + sort)
//   - udf_insert_user_project  (create, 1:M with users)
//   - udf_update_user_project  (partial update, COALESCE pattern)
//   - udf_delete_user_project  (soft-delete)
//   - udf_restore_user_project (un-soft-delete, admin+ only)
//
// Ownership model:
//   user_projects is a 1:M child of users. It has its own
//   is_active / is_deleted flags (soft-delete model). Deleted rows
//   are hidden by the GET function's default WHERE filter. Admin +
//   super_admin can restore via POST /:id/restore — instructor and
//   student roles cannot.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateMyUserProjectBody,
  CreateUserProjectBody,
  ListUserProjectsQuery,
  UpdateUserProjectBody
} from './user-projects.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface UserProjectOwnerDto {
  firstName: string;
  lastName: string;
  email: string | null;
  role: string | null;
  isActive: boolean;
  isDeleted: boolean;
}

export interface UserProjectDto {
  id: number;
  userId: number;

  projectTitle: string;
  projectCode: string | null;
  projectType: string;
  description: string | null;
  objectives: string | null;
  roleInProject: string | null;
  responsibilities: string | null;
  teamSize: number | null;
  isSoloProject: boolean;

  organizationName: string | null;
  clientName: string | null;
  industry: string | null;

  technologiesUsed: string | null;
  toolsUsed: string | null;
  programmingLanguages: string | null;
  frameworks: string | null;
  databasesUsed: string | null;
  platform: string | null;

  startDate: string | null;
  endDate: string | null;
  isOngoing: boolean;
  durationMonths: number | null;
  projectStatus: string;

  keyAchievements: string | null;
  challengesFaced: string | null;
  lessonsLearned: string | null;
  impactSummary: string | null;
  usersServed: string | null;

  projectUrl: string | null;
  repositoryUrl: string | null;
  demoUrl: string | null;
  documentationUrl: string | null;
  thumbnailUrl: string | null;
  caseStudyUrl: string | null;

  isFeatured: boolean;
  isPublished: boolean;
  awards: string | null;
  certifications: string | null;

  referenceName: string | null;
  referenceEmail: string | null;
  referencePhone: string | null;

  displayOrder: number;
  createdBy: number | null;
  updatedBy: number | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;

  user: UserProjectOwnerDto;
}

// ─── Row shape from udf_get_user_projects ─────────────────────

interface UserProjectRow {
  proj_id: number | string;
  proj_user_id: number | string;
  proj_project_title: string;
  proj_project_code: string | null;
  proj_project_type: string;
  proj_description: string | null;
  proj_objectives: string | null;
  proj_role_in_project: string | null;
  proj_responsibilities: string | null;
  proj_team_size: number | string | null;
  proj_is_solo_project: boolean;
  proj_organization_name: string | null;
  proj_client_name: string | null;
  proj_industry: string | null;
  proj_technologies_used: string | null;
  proj_tools_used: string | null;
  proj_programming_languages: string | null;
  proj_frameworks: string | null;
  proj_databases_used: string | null;
  proj_platform: string | null;
  proj_start_date: Date | string | null;
  proj_end_date: Date | string | null;
  proj_is_ongoing: boolean;
  proj_duration_months: number | string | null;
  proj_project_status: string;
  proj_key_achievements: string | null;
  proj_challenges_faced: string | null;
  proj_lessons_learned: string | null;
  proj_impact_summary: string | null;
  proj_users_served: string | null;
  proj_project_url: string | null;
  proj_repository_url: string | null;
  proj_demo_url: string | null;
  proj_documentation_url: string | null;
  proj_thumbnail_url: string | null;
  proj_case_study_url: string | null;
  proj_is_featured: boolean;
  proj_is_published: boolean;
  proj_awards: string | null;
  proj_certifications: string | null;
  proj_reference_name: string | null;
  proj_reference_email: string | null;
  proj_reference_phone: string | null;
  proj_display_order: number | string;
  proj_created_by: number | string | null;
  proj_updated_by: number | string | null;
  proj_is_active: boolean;
  proj_is_deleted: boolean;
  proj_created_at: Date | string | null;
  proj_updated_at: Date | string | null;
  proj_deleted_at: Date | string | null;

  user_first_name: string;
  user_last_name: string;
  user_email: string | null;
  user_role: string | null;
  user_is_active: boolean;
  user_is_deleted: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────

const toIso = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const toDateOnly = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (typeof v === 'string') return v.length >= 10 ? v.slice(0, 10) : v;
  // Use local date components to avoid UTC offset shifting dates by -1 day
  const y = v.getFullYear();
  const m = String(v.getMonth() + 1).padStart(2, '0');
  const d = String(v.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const toNumOrNull = (v: number | string | null | undefined): number | null =>
  v == null ? null : Number(v);

const mapUserProject = (row: UserProjectRow): UserProjectDto => ({
  id: Number(row.proj_id),
  userId: Number(row.proj_user_id),

  projectTitle: row.proj_project_title,
  projectCode: row.proj_project_code,
  projectType: row.proj_project_type,
  description: row.proj_description,
  objectives: row.proj_objectives,
  roleInProject: row.proj_role_in_project,
  responsibilities: row.proj_responsibilities,
  teamSize: toNumOrNull(row.proj_team_size),
  isSoloProject: row.proj_is_solo_project,

  organizationName: row.proj_organization_name,
  clientName: row.proj_client_name,
  industry: row.proj_industry,

  technologiesUsed: row.proj_technologies_used,
  toolsUsed: row.proj_tools_used,
  programmingLanguages: row.proj_programming_languages,
  frameworks: row.proj_frameworks,
  databasesUsed: row.proj_databases_used,
  platform: row.proj_platform,

  startDate: toDateOnly(row.proj_start_date),
  endDate: toDateOnly(row.proj_end_date),
  isOngoing: row.proj_is_ongoing,
  durationMonths: toNumOrNull(row.proj_duration_months),
  projectStatus: row.proj_project_status,

  keyAchievements: row.proj_key_achievements,
  challengesFaced: row.proj_challenges_faced,
  lessonsLearned: row.proj_lessons_learned,
  impactSummary: row.proj_impact_summary,
  usersServed: row.proj_users_served,

  projectUrl: row.proj_project_url,
  repositoryUrl: row.proj_repository_url,
  demoUrl: row.proj_demo_url,
  documentationUrl: row.proj_documentation_url,
  thumbnailUrl: row.proj_thumbnail_url,
  caseStudyUrl: row.proj_case_study_url,

  isFeatured: row.proj_is_featured,
  isPublished: row.proj_is_published,
  awards: row.proj_awards,
  certifications: row.proj_certifications,

  referenceName: row.proj_reference_name,
  referenceEmail: row.proj_reference_email,
  referencePhone: row.proj_reference_phone,

  displayOrder: Number(row.proj_display_order),
  createdBy: toNumOrNull(row.proj_created_by),
  updatedBy: toNumOrNull(row.proj_updated_by),
  isActive: row.proj_is_active,
  isDeleted: row.proj_is_deleted,
  createdAt: toIso(row.proj_created_at),
  updatedAt: toIso(row.proj_updated_at),
  deletedAt: toIso(row.proj_deleted_at),

  user: {
    firstName: row.user_first_name,
    lastName: row.user_last_name,
    email: row.user_email,
    role: row.user_role,
    isActive: row.user_is_active,
    isDeleted: row.user_is_deleted
  }
});

// ─── List ────────────────────────────────────────────────────────

export interface ListUserProjectsResult {
  rows: UserProjectDto[];
  meta: PaginationMeta;
}

export const listUserProjects = async (
  q: ListUserProjectsQuery
): Promise<ListUserProjectsResult> => {
  const { rows, totalCount } = await db.callTableFunction<UserProjectRow>(
    'udf_get_user_projects',
    {
      p_user_id: q.userId ?? null,
      p_sort_table: q.sortTable,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_project_type: q.projectType ?? null,
      p_filter_project_status: q.projectStatus ?? null,
      p_filter_platform: q.platform ?? null,
      p_filter_is_ongoing: q.isOngoing ?? null,
      p_filter_is_featured: q.isFeatured ?? null,
      p_filter_is_published: q.isPublished ?? null,
      p_filter_is_solo_project: q.isSoloProject ?? null,
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
    rows: rows.map(mapUserProject),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id (visible lane) ──────────────────────────────────

export const getUserProjectById = async (
  id: number
): Promise<UserProjectDto | null> => {
  const { rows } = await db.callTableFunction<UserProjectRow>(
    'udf_get_user_projects',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapUserProject(row) : null;
};

// ─── Get by id (admin lane — includes soft-deleted) ───────────

export const getUserProjectByIdIncludingDeleted = async (
  id: number
): Promise<UserProjectDto | null> => {
  const visible = await db.callTableFunction<UserProjectRow>(
    'udf_get_user_projects',
    { p_id: id }
  );
  if (visible.rows.length > 0) return mapUserProject(visible.rows[0]!);

  const deleted = await db.callTableFunction<UserProjectRow>(
    'udf_get_user_projects',
    { p_id: id, p_filter_is_deleted: true }
  );
  return deleted.rows[0] ? mapUserProject(deleted.rows[0]) : null;
};

// ─── Create ─────────────────────────────────────────────────────

export interface CreateUserProjectResult {
  id: number;
}

const buildInsertParams = (
  userId: number,
  body: Partial<CreateUserProjectBody>,
  callerId: number | null
): Record<string, unknown> => ({
  p_user_id: userId,
  p_project_title: body.projectTitle ?? null,
  p_project_code: body.projectCode ?? null,
  p_project_type: body.projectType ?? null,
  p_description: body.description ?? null,
  p_objectives: body.objectives ?? null,
  p_role_in_project: body.roleInProject ?? null,
  p_responsibilities: body.responsibilities ?? null,
  p_team_size: body.teamSize ?? null,
  p_is_solo_project: body.isSoloProject ?? null,
  p_organization_name: body.organizationName ?? null,
  p_client_name: body.clientName ?? null,
  p_industry: body.industry ?? null,
  p_technologies_used: body.technologiesUsed ?? null,
  p_tools_used: body.toolsUsed ?? null,
  p_programming_languages: body.programmingLanguages ?? null,
  p_frameworks: body.frameworks ?? null,
  p_databases_used: body.databasesUsed ?? null,
  p_platform: body.platform ?? null,
  p_start_date: body.startDate ?? null,
  p_end_date: body.endDate ?? null,
  p_is_ongoing: body.isOngoing ?? null,
  p_duration_months: body.durationMonths ?? null,
  p_project_status: body.projectStatus ?? null,
  p_key_achievements: body.keyAchievements ?? null,
  p_challenges_faced: body.challengesFaced ?? null,
  p_lessons_learned: body.lessonsLearned ?? null,
  p_impact_summary: body.impactSummary ?? null,
  p_users_served: body.usersServed ?? null,
  p_project_url: body.projectUrl ?? null,
  p_repository_url: body.repositoryUrl ?? null,
  p_demo_url: body.demoUrl ?? null,
  p_documentation_url: body.documentationUrl ?? null,
  p_thumbnail_url: body.thumbnailUrl ?? null,
  p_case_study_url: body.caseStudyUrl ?? null,
  p_is_featured: body.isFeatured ?? null,
  p_is_published: body.isPublished ?? null,
  p_awards: body.awards ?? null,
  p_certifications: body.certifications ?? null,
  p_reference_name: body.referenceName ?? null,
  p_reference_email: body.referenceEmail ?? null,
  p_reference_phone: body.referencePhone ?? null,
  p_display_order: body.displayOrder ?? null,
  p_is_active: body.isActive ?? null,
  p_actor_id: callerId
});

export const createUserProject = async (
  body: CreateUserProjectBody,
  callerId: number | null
): Promise<CreateUserProjectResult> => {
  const result = await db.callFunction(
    'udf_insert_user_project',
    buildInsertParams(body.userId, body, callerId)
  );
  return { id: Number(result.id) };
};

export const createMyUserProject = async (
  userId: number,
  body: CreateMyUserProjectBody
): Promise<CreateUserProjectResult> => {
  const result = await db.callFunction(
    'udf_insert_user_project',
    buildInsertParams(userId, body, userId)
  );
  return { id: Number(result.id) };
};

// ─── Update ─────────────────────────────────────────────────────

export const updateUserProject = async (
  id: number,
  body: UpdateUserProjectBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_user_project', {
    p_id: id,
    p_project_title: body.projectTitle ?? null,
    p_project_code: body.projectCode ?? null,
    p_project_type: body.projectType ?? null,
    p_description: body.description ?? null,
    p_objectives: body.objectives ?? null,
    p_role_in_project: body.roleInProject ?? null,
    p_responsibilities: body.responsibilities ?? null,
    p_team_size: body.teamSize ?? null,
    p_is_solo_project: body.isSoloProject ?? null,
    p_organization_name: body.organizationName ?? null,
    p_client_name: body.clientName ?? null,
    p_industry: body.industry ?? null,
    p_technologies_used: body.technologiesUsed ?? null,
    p_tools_used: body.toolsUsed ?? null,
    p_programming_languages: body.programmingLanguages ?? null,
    p_frameworks: body.frameworks ?? null,
    p_databases_used: body.databasesUsed ?? null,
    p_platform: body.platform ?? null,
    p_start_date: body.startDate ?? null,
    p_end_date: body.endDate ?? null,
    p_is_ongoing: body.isOngoing ?? null,
    p_duration_months: body.durationMonths ?? null,
    p_project_status: body.projectStatus ?? null,
    p_key_achievements: body.keyAchievements ?? null,
    p_challenges_faced: body.challengesFaced ?? null,
    p_lessons_learned: body.lessonsLearned ?? null,
    p_impact_summary: body.impactSummary ?? null,
    p_users_served: body.usersServed ?? null,
    p_project_url: body.projectUrl ?? null,
    p_repository_url: body.repositoryUrl ?? null,
    p_demo_url: body.demoUrl ?? null,
    p_documentation_url: body.documentationUrl ?? null,
    p_thumbnail_url: body.thumbnailUrl ?? null,
    p_case_study_url: body.caseStudyUrl ?? null,
    p_is_featured: body.isFeatured ?? null,
    p_is_published: body.isPublished ?? null,
    p_awards: body.awards ?? null,
    p_certifications: body.certifications ?? null,
    p_reference_name: body.referenceName ?? null,
    p_reference_email: body.referenceEmail ?? null,
    p_reference_phone: body.referencePhone ?? null,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

// ─── Delete (soft) ──────────────────────────────────────────────

export const deleteUserProject = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_user_project', {
    p_id: id,
    p_actor_id: callerId
  });
};

// ─── Restore (un-soft-delete) ───────────────────────────────────

export const restoreUserProject = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_user_project', {
    p_id: id,
    p_actor_id: callerId
  });
};
