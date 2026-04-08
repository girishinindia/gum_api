import { menuItemRepository } from './menu-item.repository';
import {
  MenuItemRow,
  MenuItemResponse,
  UserMenuItemRow,
  UserMenuItemResponse,
  MenuItemListQuery
} from './menu-item.types';

// ─── Row → Response Mappers ────────────────────────────────

const toMenuItemResponse = (row: MenuItemRow): MenuItemResponse => ({
  id: row.menu_id,
  name: row.menu_name,
  code: row.menu_code,
  description: row.menu_description,
  route: row.menu_route,
  icon: row.menu_icon,
  parentId: row.menu_parent_id,
  parentName: row.menu_parent_name,
  permissionId: row.menu_permission_id,
  permissionCode: row.menu_permission_code,
  displayOrder: row.menu_display_order,
  isVisible: row.menu_is_visible,
  isActive: row.menu_is_active
});

const toUserMenuItemResponse = (row: UserMenuItemRow): UserMenuItemResponse => ({
  id: row.menu_id,
  name: row.menu_name,
  code: row.menu_code,
  route: row.menu_route,
  icon: row.menu_icon,
  parentId: row.menu_parent_id,
  displayOrder: row.menu_display_order
});

// ─── Menu-Item Service ─────────────────────────────────────

class MenuItemService {

  /** List menu items (admin) with filters & pagination */
  async list(query: MenuItemListQuery) {
    const { rows, totalCount } = await menuItemRepository.findAll(query);
    return {
      menuItems: rows.map(toMenuItemResponse),
      pagination: {
        totalCount,
        pageIndex: query.pageIndex ?? 1,
        pageSize: query.pageSize ?? totalCount
      }
    };
  }

  /** Get a single menu item by ID */
  async getById(id: number) {
    const row = await menuItemRepository.findById(id);
    if (!row) {
      const { AppError } = await import('../../core/errors/app-error');
      throw new AppError('Menu item not found', 404, 'NOT_FOUND');
    }
    return toMenuItemResponse(row);
  }

  /** Get the current user's navigation (permission-filtered flat list) */
  async getUserMenu(userId: number) {
    const rows = await menuItemRepository.findUserMenuItems(userId);
    return rows.map(toUserMenuItemResponse);
  }

  /** Create a new menu item */
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
    const result = await menuItemRepository.create(data);
    return { message: result.message, id: result.id };
  }

  /** Update a menu item */
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
    const result = await menuItemRepository.update(id, data);
    return { message: result.message };
  }

  /** Soft-delete a menu item (cascades to children) */
  async delete(id: number) {
    const result = await menuItemRepository.delete(id);
    return { message: result.message };
  }

  /** Restore a soft-deleted menu item (optionally with children) */
  async restore(id: number, restoreChildren: boolean = false) {
    const result = await menuItemRepository.restore(id, restoreChildren);
    return { message: result.message };
  }
}

export const menuItemService = new MenuItemService();
