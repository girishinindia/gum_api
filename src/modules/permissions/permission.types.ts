// ─── DB Row from udf_get_permissions ────────────────────────

export interface PermissionRow {
  perm_id: number;
  perm_module_id: number;
  perm_module_name: string;
  perm_module_code: string;
  perm_name: string;
  perm_code: string;
  perm_description: string | null;
  perm_resource: string;
  perm_action: string;
  perm_scope: string;
  perm_display_order: number;
  perm_is_active: boolean;
  perm_created_at: string;
  perm_updated_at: string;
  total_count: number;
}

// ─── API Response (camelCase) ───────────────────────────────

export interface PermissionResponse {
  id: number;
  moduleId: number;
  moduleName: string;
  moduleCode: string;
  name: string;
  code: string;
  description: string | null;
  resource: string;
  action: string;
  scope: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Service Input Types ────────────────────────────────────

export interface PermissionCreateInput {
  moduleId: number;
  name: string;
  code: string;
  resource: string;
  action: string;
  scope?: string;
  description?: string;
  displayOrder?: number;
  isActive?: boolean;
  createdBy?: number;
}

export interface PermissionUpdateInput {
  name?: string;
  code?: string;
  description?: string;
  resource?: string;
  action?: string;
  scope?: string;
  displayOrder?: number;
  isActive?: boolean;
  updatedBy?: number;
}

export interface PermissionListQuery {
  id?: number;
  code?: string;
  isActive?: boolean;
  filterModuleId?: number;
  filterModuleCode?: string;
  filterResource?: string;
  filterAction?: string;
  filterScope?: string;
  searchTerm?: string;
  sortColumn?: string;
  sortDirection?: string;
  pageIndex?: number;
  pageSize?: number;
}
