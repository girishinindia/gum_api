// ─── DB Row from udf_get_roles ──────────────────────────────

export interface RoleRow {
  role_id: number;
  role_name: string;
  role_code: string;
  role_slug: string | null;
  role_description: string | null;
  role_parent_role_id: number | null;
  role_parent_name: string | null;
  role_parent_code: string | null;
  role_level: number;
  role_is_system_role: boolean;
  role_display_order: number;
  role_icon: string | null;
  role_color: string | null;
  role_created_by: number | null;
  role_updated_by: number | null;
  role_is_active: boolean;
  role_is_deleted: boolean;
  role_created_at: string;
  role_updated_at: string;
  role_deleted_at: string | null;
  total_count: number;
}

// ─── API Response (camelCase) ───────────────────────────────

export interface RoleResponse {
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
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ─── Service Input Types ────────────────────────────────────

export interface RoleCreateInput {
  name: string;
  code: string;
  description?: string;
  parentRoleId?: number;
  level?: number;
  isSystemRole?: boolean;
  displayOrder?: number;
  icon?: string;
  color?: string;
  isActive?: boolean;
  createdBy?: number;
}

export interface RoleUpdateInput {
  name?: string;
  code?: string;
  description?: string;
  parentRoleId?: number;
  level?: number;
  displayOrder?: number;
  icon?: string;
  color?: string;
  isActive?: boolean;
  updatedBy?: number;
}

export interface RoleListQuery {
  id?: number;
  code?: string;
  isActive?: boolean;
  filterLevel?: number;
  filterParentRoleId?: number;
  filterIsSystemRole?: boolean;
  searchTerm?: string;
  sortColumn?: string;
  sortDirection?: string;
  pageIndex?: number;
  pageSize?: number;
}
