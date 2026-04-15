// ═══════════════════════════════════════════════════════════════
// departments.service — UDF wrappers for the /api/v1/departments
// module.
//
// Talks to phase-03 UDFs:
//   - udf_get_departments      (read/list)
//   - udf_departments_insert   (create)
//   - udf_departments_update   (update)
//   - udf_departments_delete   (soft delete)
//   - udf_departments_restore  (restore)
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';
import { resolveIsDeletedFilter } from '../../core/utils/visibility';

import type {
  CreateDepartmentBody,
  ListDepartmentsQuery,
  UpdateDepartmentBody
} from './departments.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface DepartmentParentDto {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
  isActive: boolean;
  isDeleted: boolean;
}

export interface DepartmentDto {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
  parentDepartmentId: number | null;
  headUserId: number | null;
  createdBy: number | null;
  updatedBy: number | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  parent: DepartmentParentDto | null;
}

// ─── Row shape returned by udf_get_departments ───────────────────

interface DepartmentRow {
  department_id: number | string;
  department_name: string;
  department_code: string | null;
  department_description: string | null;
  department_parent_department_id: number | string | null;
  department_head_user_id: number | string | null;
  department_created_by: number | string | null;
  department_updated_by: number | string | null;
  department_is_active: boolean;
  department_is_deleted: boolean;
  department_created_at: Date | string | null;
  department_updated_at: Date | string | null;
  department_deleted_at: Date | string | null;

  parent_department_id: number | string | null;
  parent_department_name: string | null;
  parent_department_code: string | null;
  parent_department_description: string | null;
  parent_department_is_active: boolean | null;
  parent_department_is_deleted: boolean | null;
}

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const toNumOrNull = (v: number | string | null | undefined): number | null =>
  v == null ? null : Number(v);

const mapDepartment = (row: DepartmentRow): DepartmentDto => ({
  id: Number(row.department_id),
  name: row.department_name,
  code: row.department_code,
  description: row.department_description,
  parentDepartmentId: toNumOrNull(row.department_parent_department_id),
  headUserId: toNumOrNull(row.department_head_user_id),
  createdBy: toNumOrNull(row.department_created_by),
  updatedBy: toNumOrNull(row.department_updated_by),
  isActive: row.department_is_active,
  isDeleted: row.department_is_deleted,
  createdAt: toIsoString(row.department_created_at),
  updatedAt: toIsoString(row.department_updated_at),
  deletedAt: toIsoString(row.department_deleted_at),
  parent:
    row.parent_department_id != null
      ? {
          id: Number(row.parent_department_id),
          name: row.parent_department_name ?? '',
          code: row.parent_department_code,
          description: row.parent_department_description,
          isActive: row.parent_department_is_active ?? false,
          isDeleted: row.parent_department_is_deleted ?? false
        }
      : null
});

// ─── List ────────────────────────────────────────────────────────

export interface ListDepartmentsResult {
  rows: DepartmentDto[];
  meta: PaginationMeta;
}

export const listDepartments = async (
  q: ListDepartmentsQuery
): Promise<ListDepartmentsResult> => {
  const deptActive = q.isActive ?? null;
  const { filterIsDeleted: deptDeleted, hideDeleted } = resolveIsDeletedFilter(q.isDeleted);

  const { rows, totalCount } = await db.callTableFunction<DepartmentRow>(
    'udf_get_departments',
    {
      p_department_is_active: deptActive,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_parent_department_id: q.parentDepartmentId ?? null,
      p_filter_top_level_only: q.topLevelOnly ?? null,
      p_filter_code: q.code ?? null,
      p_filter_department_is_active: deptActive,
      p_filter_department_is_deleted: deptDeleted,
      p_hide_deleted: hideDeleted,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapDepartment),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ───────────────────────────────────────────────────

export const getDepartmentById = async (
  id: number
): Promise<DepartmentDto | null> => {
  const { rows } = await db.callTableFunction<DepartmentRow>(
    'udf_get_departments',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapDepartment(row) : null;
};

// ─── Create ──────────────────────────────────────────────────────

export interface CreateDepartmentResult {
  id: number;
}

export const createDepartment = async (
  body: CreateDepartmentBody,
  callerId: number | null
): Promise<CreateDepartmentResult> => {
  const result = await db.callFunction('udf_departments_insert', {
    p_name: body.name,
    p_code: body.code ?? null,
    p_description: body.description ?? null,
    p_parent_department_id: body.parentDepartmentId ?? null,
    p_head_user_id: body.headUserId ?? null,
    p_is_active: body.isActive ?? false,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

// ─── Update ──────────────────────────────────────────────────────

export const updateDepartment = async (
  id: number,
  body: UpdateDepartmentBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_departments_update', {
    p_id: id,
    p_name: body.name ?? null,
    p_code: body.code ?? null,
    p_description: body.description ?? null,
    p_parent_department_id: body.parentDepartmentId ?? null,
    p_head_user_id: body.headUserId ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId,
    p_clear_parent: body.clearParent ?? false
  });
};

// ─── Delete (soft) ───────────────────────────────────────────────

export const deleteDepartment = async (id: number): Promise<void> => {
  await db.callFunction('udf_departments_delete', { p_id: id });
};

// ─── Restore ─────────────────────────────────────────────────────

export const restoreDepartment = async (id: number): Promise<void> => {
  await db.callFunction('udf_departments_restore', { p_id: id });
};
