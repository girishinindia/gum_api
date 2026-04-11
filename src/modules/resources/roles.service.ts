// ═══════════════════════════════════════════════════════════════
// roles.service — UDF wrappers for the roles CRUD module.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateRoleBody,
  ListRolesQuery,
  UpdateRoleBody
} from './roles.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface RoleDto {
  id: number;
  name: string;
  code: string;
  slug: string | null;
  description: string | null;
  parentRoleId: number | null;
  parentName: string | null;
  parentCode: string | null;
  level: number;
  isSystemRole: boolean;
  displayOrder: number;
  icon: string | null;
  color: string | null;
  createdBy: number | null;
  updatedBy: number | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

interface RoleRow {
  role_id: number | string;
  role_name: string;
  role_code: string;
  role_slug: string | null;
  role_description: string | null;
  role_parent_role_id: number | string | null;
  role_parent_name: string | null;
  role_parent_code: string | null;
  role_level: number;
  role_is_system_role: boolean;
  role_display_order: number;
  role_icon: string | null;
  role_color: string | null;
  role_created_by: number | string | null;
  role_updated_by: number | string | null;
  role_is_active: boolean;
  role_is_deleted: boolean;
  role_created_at: Date | string | null;
  role_updated_at: Date | string | null;
  role_deleted_at: Date | string | null;
}

const toIso = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const toNum = (v: number | string | null): number | null =>
  v == null ? null : Number(v);

const mapRole = (row: RoleRow): RoleDto => ({
  id: Number(row.role_id),
  name: row.role_name,
  code: row.role_code,
  slug: row.role_slug,
  description: row.role_description,
  parentRoleId: toNum(row.role_parent_role_id),
  parentName: row.role_parent_name,
  parentCode: row.role_parent_code,
  level: row.role_level,
  isSystemRole: row.role_is_system_role,
  displayOrder: row.role_display_order,
  icon: row.role_icon,
  color: row.role_color,
  createdBy: toNum(row.role_created_by),
  updatedBy: toNum(row.role_updated_by),
  isActive: row.role_is_active,
  isDeleted: row.role_is_deleted,
  createdAt: toIso(row.role_created_at),
  updatedAt: toIso(row.role_updated_at),
  deletedAt: toIso(row.role_deleted_at)
});

// ─── List ────────────────────────────────────────────────────────

export interface ListRolesResult {
  rows: RoleDto[];
  meta: PaginationMeta;
}

export const listRoles = async (q: ListRolesQuery): Promise<ListRolesResult> => {
  const { rows, totalCount } = await db.callTableFunction<RoleRow>(
    'udf_get_roles',
    {
      p_code: q.code ?? null,
      p_is_active: q.isActive ?? null,
      p_filter_level: q.level ?? null,
      p_filter_parent_role_id: q.parentRoleId ?? null,
      p_filter_is_system_role: q.isSystemRole ?? null,
      p_search_term: q.searchTerm ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapRole),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ───────────────────────────────────────────────────

export const getRoleById = async (id: number): Promise<RoleDto | null> => {
  const { rows } = await db.callTableFunction<RoleRow>('udf_get_roles', {
    p_id: id
  });
  const row = rows[0];
  return row ? mapRole(row) : null;
};

// ─── Create ──────────────────────────────────────────────────────

export const createRole = async (
  body: CreateRoleBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_roles_insert', {
    p_name: body.name,
    p_code: body.code,
    p_description: body.description ?? null,
    p_parent_role_id: body.parentRoleId ?? null,
    p_level: body.level,
    p_is_system_role: body.isSystemRole ?? false,
    p_display_order: body.displayOrder,
    p_icon: body.icon ?? null,
    p_color: body.color ?? null,
    p_is_active: body.isActive ?? true,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

// ─── Update ──────────────────────────────────────────────────────

export const updateRole = async (
  id: number,
  body: UpdateRoleBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_roles_update', {
    p_id: id,
    p_name: body.name ?? null,
    p_code: body.code ?? null,
    p_description: body.description ?? null,
    p_parent_role_id: body.parentRoleId ?? null,
    p_level: body.level ?? null,
    p_display_order: body.displayOrder ?? null,
    p_icon: body.icon ?? null,
    p_color: body.color ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

// ─── Delete / Restore ────────────────────────────────────────────

export const deleteRole = async (id: number): Promise<void> => {
  await db.callFunction('udf_roles_delete', { p_id: id });
};

export const restoreRole = async (id: number): Promise<void> => {
  await db.callFunction('udf_roles_restore', { p_id: id });
};
