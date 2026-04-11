// ═══════════════════════════════════════════════════════════════
// education-levels.service — UDF wrappers for the /api/v1/education-levels module.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateEducationLevelBody,
  ListEducationLevelsQuery,
  UpdateEducationLevelBody
} from './education-levels.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface EducationLevelDto {
  id: number;
  name: string;
  levelOrder: number;
  levelCategory: string;
  abbreviation: string | null;
  description: string | null;
  typicalDuration: string | null;
  typicalAgeRange: string | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

interface EducationLevelRow {
  education_level_id: number | string;
  education_level_name: string;
  education_level_order: number;
  education_level_category: string;
  education_level_abbreviation: string | null;
  education_level_description: string | null;
  education_level_typical_duration: string | null;
  education_level_typical_age_range: string | null;
  education_level_is_active: boolean;
  education_level_is_deleted: boolean;
  education_level_created_at: Date | string | null;
  education_level_updated_at: Date | string | null;
  education_level_deleted_at: Date | string | null;
}

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapEducationLevel = (row: EducationLevelRow): EducationLevelDto => ({
  id: Number(row.education_level_id),
  name: row.education_level_name,
  levelOrder: Number(row.education_level_order),
  levelCategory: row.education_level_category,
  abbreviation: row.education_level_abbreviation,
  description: row.education_level_description,
  typicalDuration: row.education_level_typical_duration,
  typicalAgeRange: row.education_level_typical_age_range,
  isActive: row.education_level_is_active,
  isDeleted: row.education_level_is_deleted,
  createdAt: toIsoString(row.education_level_created_at),
  updatedAt: toIsoString(row.education_level_updated_at),
  deletedAt: toIsoString(row.education_level_deleted_at)
});

// ─── List ────────────────────────────────────────────────────────

export interface ListEducationLevelsResult {
  rows: EducationLevelDto[];
  meta: PaginationMeta;
}

export const listEducationLevels = async (
  q: ListEducationLevelsQuery
): Promise<ListEducationLevelsResult> => {
  const { rows, totalCount } = await db.callTableFunction<EducationLevelRow>(
    'udf_get_education_levels',
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
    rows: rows.map(mapEducationLevel),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ───────────────────────────────────────────────────

export const getEducationLevelById = async (
  id: number
): Promise<EducationLevelDto | null> => {
  const { rows } = await db.callTableFunction<EducationLevelRow>(
    'udf_get_education_levels',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapEducationLevel(row) : null;
};

// ─── Create ──────────────────────────────────────────────────────

export interface CreateEducationLevelResult {
  id: number;
}

export const createEducationLevel = async (
  body: CreateEducationLevelBody,
  callerId: number | null
): Promise<CreateEducationLevelResult> => {
  const result = await db.callFunction('udf_education_levels_insert', {
    p_name: body.name,
    p_level_order: body.levelOrder,
    p_level_category: body.levelCategory,
    p_abbreviation: body.abbreviation ?? null,
    p_description: body.description ?? null,
    p_typical_duration: body.typicalDuration ?? null,
    p_typical_age_range: body.typicalAgeRange ?? null,
    p_is_active: body.isActive ?? true,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

// ─── Update ──────────────────────────────────────────────────────

export const updateEducationLevel = async (
  id: number,
  body: UpdateEducationLevelBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_education_levels_update', {
    p_id: id,
    p_name: body.name ?? null,
    p_level_order: body.levelOrder ?? null,
    p_level_category: body.levelCategory ?? null,
    p_abbreviation: body.abbreviation ?? null,
    p_description: body.description ?? null,
    p_typical_duration: body.typicalDuration ?? null,
    p_typical_age_range: body.typicalAgeRange ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

// ─── Delete (soft) ───────────────────────────────────────────────

export const deleteEducationLevel = async (id: number): Promise<void> => {
  await db.callFunction('udf_education_levels_delete', { p_id: id });
};

// ─── Restore ─────────────────────────────────────────────────────

export const restoreEducationLevel = async (id: number): Promise<void> => {
  await db.callFunction('udf_education_levels_restore', { p_id: id });
};
