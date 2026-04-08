import { db } from '../../database/db';
import { MenuItemRow, UserMenuItemRow, MenuItemListQuery } from './menu-item.types';

// ─── Menu-Item Repository (PostgreSQL via UDFs) ────────────

export const menuItemRepository = {

  // ─── List (admin) ────────────────────────────────────────

  async findAll(query: MenuItemListQuery): Promise<{ rows: MenuItemRow[]; totalCount: number }> {
    return db.callTableFunction<MenuItemRow>('udf_get_menu_items', {
      p_id: query.id,
      p_code: query.code,
      p_filter_parent_id: query.filterParentId,
      p_filter_top_level_only: query.filterTopLevelOnly,
      p_is_active: query.isActive,
      p_sort_column: query.sortColumn,
      p_sort_direction: query.sortDirection,
      p_page_index: query.pageIndex,
      p_page_size: query.pageSize
    });
  },

  // ─── Find by ID ──────────────────────────────────────────

  async findById(id: number): Promise<MenuItemRow | null> {
    const { rows } = await db.callTableFunction<MenuItemRow>('udf_get_menu_items', {
      p_id: id
    });
    return rows[0] ?? null;
  },

  // ─── User menu items (permission-filtered) ───────────────

  async findUserMenuItems(userId: number): Promise<UserMenuItemRow[]> {
    const result = await db.query<UserMenuItemRow>(
      `SELECT * FROM udf_user_menu_items(p_user_id := $1)`,
      [userId]
    );
    return result.rows;
  },

  // ─── Create ──────────────────────────────────────────────

  async create(data: {
    name: string;
    code: string;
    route?: string;
    icon?: string;
    description?: string;
    parentMenuId?: number;
    permissionId?: number;
    displayOrder?: number;
    isVisible?: boolean;
    isActive?: boolean;
    createdBy?: number;
  }) {
    return db.callFunction('udf_menu_items_insert', {
      p_name: data.name,
      p_code: data.code,
      p_route: data.route ?? null,
      p_icon: data.icon ?? null,
      p_description: data.description ?? null,
      p_parent_menu_id: data.parentMenuId ?? null,
      p_permission_id: data.permissionId ?? null,
      p_display_order: data.displayOrder ?? 0,
      p_is_visible: data.isVisible ?? true,
      p_is_active: data.isActive ?? true,
      p_created_by: data.createdBy ?? null
    });
  },

  // ─── Update ──────────────────────────────────────────────

  async update(id: number, data: {
    name?: string;
    code?: string;
    route?: string;
    icon?: string;
    description?: string;
    parentMenuId?: number;
    permissionId?: number;
    displayOrder?: number;
    isVisible?: boolean;
    isActive?: boolean;
    updatedBy?: number;
  }) {
    return db.callFunction('udf_menu_items_update', {
      p_id: id,
      p_name: data.name,
      p_code: data.code,
      p_route: data.route,
      p_icon: data.icon,
      p_description: data.description,
      p_parent_menu_id: data.parentMenuId,
      p_permission_id: data.permissionId,
      p_display_order: data.displayOrder,
      p_is_visible: data.isVisible,
      p_is_active: data.isActive,
      p_updated_by: data.updatedBy ?? null
    });
  },

  // ─── Delete (soft, cascades to children) ─────────────────

  async delete(id: number) {
    return db.callFunction('udf_menu_items_delete', {
      p_id: id
    });
  },

  // ─── Restore (optionally with children) ──────────────────

  async restore(id: number, restoreChildren: boolean = false) {
    return db.callFunction('udf_menu_items_restore', {
      p_id: id,
      p_restore_children: restoreChildren
    });
  }
};
