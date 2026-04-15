// ═══════════════════════════════════════════════════════════════
// designations.service — UDF wrappers for /api/v1/designations
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';
import { resolveIsDeletedFilter } from '../../core/utils/visibility';

import type {
  CreateDesignationBody,
  ListDesignationsQuery,
  UpdateDesignationBody
} from './designations.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface DesignationDto {
  id: number;
  name: string;
  code: string | null;
  level: number;
  levelBand: string;
  description: string | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

interface DesignationRow {
  designation_id: number | string;
  designation_name: string;
  designation_code: string | null;
  designation_level: number;
  designation_level_band: string;
  designation_description: string | null;
  designation_created_by: number | string | null;
  designation_updated_by: number | string | null;
  designation_is_active: boolean;
  designation_is_deleted: boolean;
  designation_created_at: Date | string | null;
  designation_updated_at: Date | string | null;
  designation_deleted_at: Date | string | null;
}

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapDesignation = (row: DesignationRow): DesignationDto => ({
  id: Number(row.designation_id),
  name: row.designation_name,
  code: row.designation_code,
  level: Number(row.designation_level),
  levelBand: row.designation_level_band,
  description: row.designation_description,
  isActive: row.designation_is_active,
  isDeleted: row.designation_is_deleted,
  createdAt: toIsoString(row.designation_created_at),
  updatedAt: toIsoString(row.designation_updated_at),
  deletedAt: toIsoString(row.designation_deleted_at)
});

// ─── List ────────────────────────────────────────────────────────

export interface ListDesignationsResult {
  rows: DesignationDto[];
  meta: PaginationMeta;
}

export const listDesignations = async (
  q: ListDesignationsQuery
): Promise<ListDesignationsResult> => {
  const { filterIsDeleted, hideDeleted } = resolveIsDeletedFilter(q.isDeleted);
  const { rows, totalCount } = await db.callTableFunction<DesignationRow>(
    'udf_get_designations',
    {
      p_is_active: q.isActive ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_level_band: q.levelBand ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: filterIsDeleted,
      p_hide_deleted: hideDeleted,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapDesignation),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ───────────────────────────────────────────────────

export const getDesignationById = async (
  id: number
): Promise<DesignationDto | null> => {
  const { rows } = await db.callTableFunction<DesignationRow>(
    'udf_get_designations',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapDesignation(row) : null;
};

// ─── Create ──────────────────────────────────────────────────────

export interface CreateDesignationResult {
  id: number;
}

export const createDesignation = async (
  body: CreateDesignationBody,
  callerId: number | null
): Promise<CreateDesignationResult> => {
  const result = await db.callFunction('udf_designations_insert', {
    p_name: body.name,
    p_code: body.code ?? null,
    p_level: body.level,
    p_level_band: body.levelBand,
    p_description: body.description ?? null,
    p_is_active: body.isActive ?? true,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

// ─── Update ──────────────────────────────────────────────────────

export const updateDesignation = async (
  id: number,
  body: UpdateDesignationBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_designations_update', {
    p_id: id,
    p_name: body.name ?? null,
    p_code: body.code ?? null,
    p_level: body.level ?? null,
    p_level_band: body.levelBand ?? null,
    p_description: body.description ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

// ─── Delete (soft) ───────────────────────────────────────────────

export const deleteDesignation = async (id: number): Promise<void> => {
  await db.callFunction('udf_designations_delete', { p_id: id });
};

// ─── Restore ─────────────────────────────────────────────────────

export const restoreDesignation = async (id: number): Promise<void> => {
  await db.callFunction('udf_designations_restore', { p_id: id });
};
