import { db } from '../../database/db';
import { ModuleRow, ModuleListQuery, ModuleCreateInput, ModuleUpdateInput } from './module.types';

// ─── Module Repository (PostgreSQL via UDFs) ────────────────

export const moduleRepository = {

  async findAll(query: ModuleListQuery): Promise<{ rows: ModuleRow[]; totalCount: number }> {
    return db.callTableFunction<ModuleRow>('udf_get_modules', {
      p_id: query.id,
      p_code: query.code,
      p_is_active: query.isActive,
      p_search_term: query.searchTerm,
      p_sort_column: query.sortColumn,
      p_sort_direction: query.sortDirection,
      p_page_index: query.pageIndex,
      p_page_size: query.pageSize
    });
  },

  async findById(id: number): Promise<ModuleRow | null> {
    const { rows } = await this.findAll({ id });
    return rows[0] ?? null;
  },

  async create(input: ModuleCreateInput): Promise<{ id: number }> {
    const result = await db.callFunction('udf_modules_insert', {
      p_name: input.name,
      p_code: input.code,
      p_description: input.description ?? null,
      p_display_order: input.displayOrder ?? null,
      p_icon: input.icon ?? null,
      p_color: input.color ?? null,
      p_is_active: input.isActive ?? null,
      p_created_by: input.createdBy ?? null
    });
    return { id: result.id! };
  },

  async update(id: number, input: ModuleUpdateInput) {
    return db.callFunction('udf_modules_update', {
      p_id: id,
      p_name: input.name ?? null,
      p_code: input.code ?? null,
      p_description: input.description ?? null,
      p_display_order: input.displayOrder ?? null,
      p_icon: input.icon ?? null,
      p_color: input.color ?? null,
      p_is_active: input.isActive ?? null,
      p_updated_by: input.updatedBy ?? null
    });
  },

  async delete(id: number) {
    return db.callFunction('udf_modules_delete', { p_id: id });
  },

  async restore(id: number) {
    return db.callFunction('udf_modules_restore', { p_id: id });
  }
};
