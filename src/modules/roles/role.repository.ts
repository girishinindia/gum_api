import { db } from '../../database/db';
import { RoleRow, RoleListQuery, RoleCreateInput, RoleUpdateInput } from './role.types';

// ─── Role Repository (PostgreSQL via UDFs) ──────────────────

export const roleRepository = {

  // ─── List / Single ──────────────────────────────────────────

  async findAll(query: RoleListQuery): Promise<{ rows: RoleRow[]; totalCount: number }> {
    return db.callTableFunction<RoleRow>('udf_get_roles', {
      p_id: query.id,
      p_code: query.code,
      p_is_active: query.isActive,
      p_filter_level: query.filterLevel,
      p_filter_parent_role_id: query.filterParentRoleId,
      p_filter_is_system_role: query.filterIsSystemRole,
      p_search_term: query.searchTerm,
      p_sort_column: query.sortColumn,
      p_sort_direction: query.sortDirection,
      p_page_index: query.pageIndex,
      p_page_size: query.pageSize
    });
  },

  async findById(id: number): Promise<RoleRow | null> {
    const { rows } = await this.findAll({ id });
    return rows[0] ?? null;
  },

  // ─── Create ─────────────────────────────────────────────────

  async create(input: RoleCreateInput): Promise<{ id: number }> {
    const result = await db.callFunction('udf_roles_insert', {
      p_name: input.name,
      p_code: input.code,
      p_description: input.description ?? null,
      p_parent_role_id: input.parentRoleId ?? null,
      p_level: input.level ?? null,
      p_is_system_role: input.isSystemRole ?? null,
      p_display_order: input.displayOrder ?? null,
      p_icon: input.icon ?? null,
      p_color: input.color ?? null,
      p_is_active: input.isActive ?? null,
      p_created_by: input.createdBy ?? null
    });
    return { id: result.id! };
  },

  // ─── Update ─────────────────────────────────────────────────

  async update(id: number, input: RoleUpdateInput) {
    return db.callFunction('udf_roles_update', {
      p_id: id,
      p_name: input.name ?? null,
      p_code: input.code ?? null,
      p_description: input.description ?? null,
      p_parent_role_id: input.parentRoleId ?? null,
      p_level: input.level ?? null,
      p_display_order: input.displayOrder ?? null,
      p_icon: input.icon ?? null,
      p_color: input.color ?? null,
      p_is_active: input.isActive ?? null,
      p_updated_by: input.updatedBy ?? null
    });
  },

  // ─── Delete (soft) ──────────────────────────────────────────

  async delete(id: number) {
    return db.callFunction('udf_roles_delete', { p_id: id });
  },

  // ─── Restore ────────────────────────────────────────────────

  async restore(id: number, restorePermissions = false) {
    return db.callFunction('udf_roles_restore', {
      p_id: id,
      p_restore_permissions: restorePermissions
    });
  }
};
