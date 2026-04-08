import { db } from '../../database/db';
import { PermissionRow, PermissionListQuery, PermissionCreateInput, PermissionUpdateInput } from './permission.types';

// ─── Permission Repository (PostgreSQL via UDFs) ────────────

export const permissionRepository = {

  async findAll(query: PermissionListQuery): Promise<{ rows: PermissionRow[]; totalCount: number }> {
    return db.callTableFunction<PermissionRow>('udf_get_permissions', {
      p_id: query.id,
      p_code: query.code,
      p_is_active: query.isActive,
      p_filter_module_id: query.filterModuleId,
      p_filter_module_code: query.filterModuleCode,
      p_filter_resource: query.filterResource,
      p_filter_action: query.filterAction,
      p_filter_scope: query.filterScope,
      p_search_term: query.searchTerm,
      p_sort_column: query.sortColumn,
      p_sort_direction: query.sortDirection,
      p_page_index: query.pageIndex,
      p_page_size: query.pageSize
    });
  },

  async findById(id: number): Promise<PermissionRow | null> {
    const { rows } = await this.findAll({ id });
    return rows[0] ?? null;
  },

  async create(input: PermissionCreateInput): Promise<{ id: number }> {
    const result = await db.callFunction('udf_permissions_insert', {
      p_module_id: input.moduleId,
      p_name: input.name,
      p_code: input.code,
      p_resource: input.resource,
      p_action: input.action,
      p_scope: input.scope ?? null,
      p_description: input.description ?? null,
      p_display_order: input.displayOrder ?? null,
      p_is_active: input.isActive ?? null,
      p_created_by: input.createdBy ?? null
    });
    return { id: result.id! };
  },

  async update(id: number, input: PermissionUpdateInput) {
    return db.callFunction('udf_permissions_update', {
      p_id: id,
      p_name: input.name ?? null,
      p_code: input.code ?? null,
      p_description: input.description ?? null,
      p_resource: input.resource ?? null,
      p_action: input.action ?? null,
      p_scope: input.scope ?? null,
      p_display_order: input.displayOrder ?? null,
      p_is_active: input.isActive ?? null,
      p_updated_by: input.updatedBy ?? null
    });
  },

  async delete(id: number) {
    return db.callFunction('udf_permissions_delete', { p_id: id });
  },

  async restore(id: number) {
    return db.callFunction('udf_permissions_restore', { p_id: id });
  }
};
