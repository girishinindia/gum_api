// ─── Row from udf_get_menu_items ───────────────────────────

export interface MenuItemRow {
  menu_id: number;
  menu_name: string;
  menu_code: string;
  menu_description: string | null;
  menu_route: string | null;
  menu_icon: string | null;
  menu_parent_id: number | null;
  menu_parent_name: string | null;
  menu_permission_id: number | null;
  menu_permission_code: string | null;
  menu_display_order: number;
  menu_is_visible: boolean;
  menu_is_active: boolean;
  total_count: number;
}

// ─── Row from udf_user_menu_items ──────────────────────────

export interface UserMenuItemRow {
  menu_id: number;
  menu_name: string;
  menu_code: string;
  menu_route: string | null;
  menu_icon: string | null;
  menu_parent_id: number | null;
  menu_display_order: number;
}

// ─── API Response (admin) ──────────────────────────────────

export interface MenuItemResponse {
  id: number;
  name: string;
  code: string;
  description: string | null;
  route: string | null;
  icon: string | null;
  parentId: number | null;
  parentName: string | null;
  permissionId: number | null;
  permissionCode: string | null;
  displayOrder: number;
  isVisible: boolean;
  isActive: boolean;
}

// ─── API Response (user navigation) ────────────────────────

export interface UserMenuItemResponse {
  id: number;
  name: string;
  code: string;
  route: string | null;
  icon: string | null;
  parentId: number | null;
  displayOrder: number;
}

// ─── List Query ────────────────────────────────────────────

export interface MenuItemListQuery {
  id?: number;
  code?: string;
  filterParentId?: number;
  filterTopLevelOnly?: boolean;
  isActive?: boolean;
  sortColumn?: string;
  sortDirection?: string;
  pageIndex?: number;
  pageSize?: number;
}
