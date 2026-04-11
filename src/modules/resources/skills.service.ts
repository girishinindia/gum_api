// ═══════════════════════════════════════════════════════════════
// skills.service — UDF wrappers for the /api/v1/skills module.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateSkillBody,
  ListSkillsQuery,
  UpdateSkillBody
} from './skills.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface SkillDto {
  id: number;
  name: string;
  category: string;
  description: string | null;
  iconUrl: string | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

interface SkillRow {
  skill_id: number | string;
  skill_name: string;
  skill_category: string;
  skill_description: string | null;
  skill_icon_url: string | null;
  skill_is_active: boolean;
  skill_is_deleted: boolean;
  skill_created_at: Date | string | null;
  skill_updated_at: Date | string | null;
  skill_deleted_at: Date | string | null;
}

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapSkill = (row: SkillRow): SkillDto => ({
  id: Number(row.skill_id),
  name: row.skill_name,
  category: row.skill_category,
  description: row.skill_description,
  iconUrl: row.skill_icon_url,
  isActive: row.skill_is_active,
  isDeleted: row.skill_is_deleted,
  createdAt: toIsoString(row.skill_created_at),
  updatedAt: toIsoString(row.skill_updated_at),
  deletedAt: toIsoString(row.skill_deleted_at)
});

// ─── List ────────────────────────────────────────────────────────

export interface ListSkillsResult {
  rows: SkillDto[];
  meta: PaginationMeta;
}

export const listSkills = async (q: ListSkillsQuery): Promise<ListSkillsResult> => {
  const { rows, totalCount } = await db.callTableFunction<SkillRow>(
    'udf_get_skills',
    {
      p_is_active: q.isActive ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_category: q.category ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? null,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapSkill),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ───────────────────────────────────────────────────

export const getSkillById = async (id: number): Promise<SkillDto | null> => {
  const { rows } = await db.callTableFunction<SkillRow>('udf_get_skills', {
    p_id: id
  });
  const row = rows[0];
  return row ? mapSkill(row) : null;
};

// ─── Create ──────────────────────────────────────────────────────

export interface CreateSkillResult {
  id: number;
}

export const createSkill = async (
  body: CreateSkillBody,
  callerId: number | null
): Promise<CreateSkillResult> => {
  const result = await db.callFunction('udf_skills_insert', {
    p_name: body.name,
    p_category: body.category,
    p_description: body.description ?? null,
    p_icon_url: body.iconUrl ?? null,
    p_is_active: body.isActive ?? true,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

// ─── Update ──────────────────────────────────────────────────────

export const updateSkill = async (
  id: number,
  body: UpdateSkillBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_skills_update', {
    p_id: id,
    p_name: body.name ?? null,
    p_category: body.category ?? null,
    p_description: body.description ?? null,
    p_icon_url: body.iconUrl ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

// ─── Delete (soft) ───────────────────────────────────────────────

export const deleteSkill = async (id: number): Promise<void> => {
  await db.callFunction('udf_skills_delete', { p_id: id });
};

// ─── Restore ─────────────────────────────────────────────────────

export const restoreSkill = async (id: number): Promise<void> => {
  await db.callFunction('udf_skills_restore', { p_id: id });
};
