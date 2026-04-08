// ─── Row from udf_get_role_change_log ──────────────────────

export interface RoleChangeLogRow {
  rcl_id: number;
  rcl_user_id: number;
  rcl_user_email: string;
  rcl_user_first_name: string;
  rcl_user_last_name: string;
  rcl_action: string;
  rcl_role_id: number | null;
  rcl_role_code: string | null;
  rcl_role_name: string | null;
  rcl_context_type: string | null;
  rcl_context_id: number | null;
  rcl_reason: string | null;
  rcl_changed_by: number | null;
  rcl_changed_by_email: string | null;
  rcl_created_at: string;
  total_count: number;
}

// ─── API Response ──────────────────────────────────────────

export interface RoleChangeLogResponse {
  id: number;
  userId: number;
  userEmail: string;
  userFirstName: string;
  userLastName: string;
  action: string;
  roleId: number | null;
  roleCode: string | null;
  roleName: string | null;
  contextType: string | null;
  contextId: number | null;
  reason: string | null;
  changedBy: number | null;
  changedByEmail: string | null;
  createdAt: string;
}

// ─── List Query ────────────────────────────────────────────

export interface RoleChangeLogListQuery {
  id?: number;
  userId?: number;
  roleId?: number;
  filterAction?: string;
  filterContextType?: string;
  filterChangedBy?: number;
  filterDateFrom?: string;
  filterDateTo?: string;
  searchTerm?: string;
  sortColumn?: string;
  sortDirection?: string;
  pageIndex?: number;
  pageSize?: number;
}

// ─── Create Input (for manual logging) ─────────────────────

export interface RoleChangeLogCreateInput {
  userId: number;
  action: string;
  roleId?: number;
  contextType?: string;
  contextId?: number;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  reason?: string;
  ipAddress?: string;
  changedBy?: number;
}
