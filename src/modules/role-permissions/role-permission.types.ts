// ─── DB Row from udf_get_role_permissions ───────────────────

export interface RolePermissionRow {
  rp_id: number;
  rp_role_id: number;
  rp_role_name: string;
  rp_role_code: string;
  rp_permission_id: number;
  rp_permission_name: string;
  rp_permission_code: string;
  rp_permission_resource: string;
  rp_permission_action: string;
  rp_permission_scope: string;
  rp_module_name: string;
  rp_module_code: string;
  rp_is_active: boolean;
  rp_created_at: string;
  total_count: number;
}

// ─── API Response (camelCase) ───────────────────────────────

export interface RolePermissionResponse {
  id: number;
  roleId: number;
  roleName: string;
  roleCode: string;
  permissionId: number;
  permissionName: string;
  permissionCode: string;
  permissionResource: string;
  permissionAction: string;
  permissionScope: string;
  moduleName: string;
  moduleCode: string;
  isActive: boolean;
  createdAt: string;
}

// ─── DB Row from udf_user_permissions ───────────────────────

export interface UserPermissionRow {
  permission_code: string;
  permission_name: string;
  module_code: string;
  role_code: string;
  scope: string;
}

export interface UserPermissionResponse {
  permissionCode: string;
  permissionName: string;
  moduleCode: string;
  roleCode: string;
  scope: string;
}

// ─── Query Types ────────────────────────────────────────────

export interface RolePermissionListQuery {
  roleId?: number;
  roleCode?: string;
  permissionId?: number;
  filterModuleCode?: string;
  filterAction?: string;
  filterScope?: string;
  searchTerm?: string;
  sortColumn?: string;
  sortDirection?: string;
  pageIndex?: number;
  pageSize?: number;
}
