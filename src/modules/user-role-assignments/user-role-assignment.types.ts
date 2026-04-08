// ─── Row from udf_get_user_role_assignments ────────────────

export interface UserRoleAssignmentRow {
  ura_id: number;
  ura_user_id: number;
  ura_user_email: string;
  ura_user_first_name: string;
  ura_user_last_name: string;
  ura_role_id: number;
  ura_role_name: string;
  ura_role_code: string;
  ura_role_level: number;
  ura_context_type: string | null;
  ura_context_id: number | null;
  ura_assigned_at: string;
  ura_expires_at: string | null;
  ura_reason: string | null;
  ura_assigned_by: number | null;
  ura_is_active: boolean;
  ura_is_currently_valid: boolean;
  total_count: number;
}

// ─── API Response ──────────────────────────────────────────

export interface UserRoleAssignmentResponse {
  id: number;
  userId: number;
  userEmail: string;
  userFirstName: string;
  userLastName: string;
  roleId: number;
  roleName: string;
  roleCode: string;
  roleLevel: number;
  contextType: string | null;
  contextId: number | null;
  assignedAt: string;
  expiresAt: string | null;
  reason: string | null;
  assignedBy: number | null;
  isActive: boolean;
  isCurrentlyValid: boolean;
}

// ─── List Query ────────────────────────────────────────────

export interface UserRoleAssignmentListQuery {
  id?: number;
  userId?: number;
  roleId?: number;
  roleCode?: string;
  filterContextType?: string;
  filterContextId?: number;
  filterIsValid?: boolean;
  searchTerm?: string;
  sortColumn?: string;
  sortDirection?: string;
  pageIndex?: number;
  pageSize?: number;
}
