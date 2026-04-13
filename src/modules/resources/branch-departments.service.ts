// ═══════════════════════════════════════════════════════════════
// branch-departments.service — UDF wrappers for
// /api/v1/branch-departments (phase 03 junction table).
//
// Talks to phase-03 UDFs:
//   - udf_get_branch_departments      (read/list)
//   - udf_branch_departments_insert   (create)
//   - udf_branch_departments_update   (update)
//   - udf_branch_departments_delete   (soft delete)
//   - udf_branch_departments_restore  (restore)
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateBranchDepartmentBody,
  ListBranchDepartmentsQuery,
  UpdateBranchDepartmentBody
} from './branch-departments.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface BdBranchDto {
  id: number;
  name: string;
  code: string | null;
  branchType: string;
  isActive: boolean;
}

export interface BdDepartmentDto {
  id: number;
  name: string;
  code: string | null;
  parentDepartmentId: number | null;
  parentDepartmentName: string | null;
  isActive: boolean;
}

export interface BdLocationDto {
  cityName: string | null;
  stateName: string | null;
  countryName: string | null;
}

export interface BranchDepartmentDto {
  id: number;
  branchId: number;
  departmentId: number;
  localHeadUserId: number | null;
  employeeCapacity: number | null;
  floorOrWing: string | null;
  extensionNumber: string | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  branch: BdBranchDto;
  department: BdDepartmentDto;
  location: BdLocationDto;
}

// ─── Row shape returned by udf_get_branch_departments ────────────

interface BranchDepartmentRow {
  bd_id: number | string;
  bd_branch_id: number | string;
  bd_department_id: number | string;
  bd_local_head_user_id: number | string | null;
  bd_employee_capacity: number | string | null;
  bd_floor_or_wing: string | null;
  bd_extension_number: string | null;
  bd_is_active: boolean;
  bd_is_deleted: boolean;
  bd_created_at: Date | string | null;
  bd_updated_at: Date | string | null;
  bd_deleted_at: Date | string | null;

  branch_id: number | string;
  branch_name: string;
  branch_code: string | null;
  branch_branch_type: string;
  branch_is_active: boolean;

  department_id: number | string;
  department_name: string;
  department_code: string | null;
  department_parent_department_id: number | string | null;
  parent_department_name: string | null;
  department_is_active: boolean;

  city_name: string | null;
  state_name: string | null;
  country_name: string | null;
}

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const toNumOrNull = (v: number | string | null | undefined): number | null =>
  v == null ? null : Number(v);

const mapBranchDepartment = (row: BranchDepartmentRow): BranchDepartmentDto => ({
  id: Number(row.bd_id),
  branchId: Number(row.bd_branch_id),
  departmentId: Number(row.bd_department_id),
  localHeadUserId: toNumOrNull(row.bd_local_head_user_id),
  employeeCapacity: toNumOrNull(row.bd_employee_capacity),
  floorOrWing: row.bd_floor_or_wing,
  extensionNumber: row.bd_extension_number,
  isActive: row.bd_is_active,
  isDeleted: row.bd_is_deleted,
  createdAt: toIsoString(row.bd_created_at),
  updatedAt: toIsoString(row.bd_updated_at),
  deletedAt: toIsoString(row.bd_deleted_at),
  branch: {
    id: Number(row.branch_id),
    name: row.branch_name,
    code: row.branch_code,
    branchType: row.branch_branch_type,
    isActive: row.branch_is_active
  },
  department: {
    id: Number(row.department_id),
    name: row.department_name,
    code: row.department_code,
    parentDepartmentId: toNumOrNull(row.department_parent_department_id),
    parentDepartmentName: row.parent_department_name,
    isActive: row.department_is_active
  },
  location: {
    cityName: row.city_name,
    stateName: row.state_name,
    countryName: row.country_name
  }
});

// ─── List ────────────────────────────────────────────────────────

export interface ListBranchDepartmentsResult {
  rows: BranchDepartmentDto[];
  meta: PaginationMeta;
}

export const listBranchDepartments = async (
  q: ListBranchDepartmentsQuery
): Promise<ListBranchDepartmentsResult> => {
  const bdActive = q.isActive ?? null;
  const bdDeleted = q.isDeleted ?? null;

  const { rows, totalCount } = await db.callTableFunction<BranchDepartmentRow>(
    'udf_get_branch_departments',
    {
      p_bd_is_active: bdActive,
      p_sort_table: q.sortTable,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_branch_id: q.branchId ?? null,
      p_filter_department_id: q.departmentId ?? null,
      p_filter_branch_type: q.branchType ?? null,
      p_filter_branch_name: q.branchName ?? null,
      p_filter_department_name: q.departmentName ?? null,
      p_filter_bd_is_active: bdActive,
      p_filter_bd_is_deleted: bdDeleted,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapBranchDepartment),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ───────────────────────────────────────────────────

export const getBranchDepartmentById = async (
  id: number
): Promise<BranchDepartmentDto | null> => {
  const { rows } = await db.callTableFunction<BranchDepartmentRow>(
    'udf_get_branch_departments',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapBranchDepartment(row) : null;
};

// ─── Create ──────────────────────────────────────────────────────

export interface CreateBranchDepartmentResult {
  id: number;
}

export const createBranchDepartment = async (
  body: CreateBranchDepartmentBody,
  callerId: number | null
): Promise<CreateBranchDepartmentResult> => {
  const result = await db.callFunction('udf_branch_departments_insert', {
    p_branch_id: body.branchId,
    p_department_id: body.departmentId,
    p_local_head_user_id: body.localHeadUserId ?? null,
    p_employee_capacity: body.employeeCapacity ?? null,
    p_floor_or_wing: body.floorOrWing ?? null,
    p_extension_number: body.extensionNumber ?? null,
    p_is_active: body.isActive ?? false,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

// ─── Update ──────────────────────────────────────────────────────

export const updateBranchDepartment = async (
  id: number,
  body: UpdateBranchDepartmentBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_branch_departments_update', {
    p_id: id,
    p_local_head_user_id: body.localHeadUserId ?? null,
    p_employee_capacity: body.employeeCapacity ?? null,
    p_floor_or_wing: body.floorOrWing ?? null,
    p_extension_number: body.extensionNumber ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId,
    p_clear_local_head: body.clearLocalHead ?? false
  });
};

// ─── Delete (soft) ───────────────────────────────────────────────

export const deleteBranchDepartment = async (id: number): Promise<void> => {
  await db.callFunction('udf_branch_departments_delete', { p_id: id });
};

// ─── Restore ─────────────────────────────────────────────────────

export const restoreBranchDepartment = async (id: number): Promise<void> => {
  await db.callFunction('udf_branch_departments_restore', { p_id: id });
};
