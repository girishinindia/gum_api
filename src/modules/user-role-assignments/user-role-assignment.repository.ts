import { db } from '../../database/db';
import { UserRoleAssignmentRow, UserRoleAssignmentListQuery } from './user-role-assignment.types';

// ─── User-Role-Assignment Repository (PostgreSQL via UDFs) ─

export const userRoleAssignmentRepository = {

  // ─── List ─────────────────────────────────────────────────

  async findAll(query: UserRoleAssignmentListQuery): Promise<{ rows: UserRoleAssignmentRow[]; totalCount: number }> {
    return db.callTableFunction<UserRoleAssignmentRow>('udf_get_user_role_assignments', {
      p_id: query.id,
      p_user_id: query.userId,
      p_role_id: query.roleId,
      p_role_code: query.roleCode,
      p_filter_context_type: query.filterContextType,
      p_filter_context_id: query.filterContextId,
      p_filter_is_valid: query.filterIsValid,
      p_search_term: query.searchTerm,
      p_sort_column: query.sortColumn,
      p_sort_direction: query.sortDirection,
      p_page_index: query.pageIndex,
      p_page_size: query.pageSize
    });
  },

  // ─── Find by ID ──────────────────────────────────────────

  async findById(id: number): Promise<UserRoleAssignmentRow | null> {
    const { rows } = await db.callTableFunction<UserRoleAssignmentRow>('udf_get_user_role_assignments', {
      p_id: id
    });
    return rows[0] ?? null;
  },

  // ─── Create ──────────────────────────────────────────────

  async create(data: {
    userId: number;
    roleId: number;
    contextType?: string;
    contextId?: number;
    expiresAt?: string;
    reason?: string;
    assignedBy?: number;
  }) {
    return db.callFunction('udf_user_role_assignments_insert', {
      p_user_id: data.userId,
      p_role_id: data.roleId,
      p_context_type: data.contextType ?? null,
      p_context_id: data.contextId ?? null,
      p_expires_at: data.expiresAt ?? null,
      p_reason: data.reason ?? null,
      p_assigned_by: data.assignedBy ?? null
    });
  },

  // ─── Update ──────────────────────────────────────────────

  async update(id: number, data: {
    expiresAt?: string | null;
    reason?: string | null;
    isActive?: boolean;
    updatedBy?: number;
  }) {
    return db.callFunction('udf_user_role_assignments_update', {
      p_id: id,
      p_expires_at: data.expiresAt !== undefined ? data.expiresAt : undefined,
      p_reason: data.reason !== undefined ? data.reason : undefined,
      p_is_active: data.isActive,
      p_updated_by: data.updatedBy ?? null
    });
  },

  // ─── Delete (soft) ───────────────────────────────────────

  async delete(id: number) {
    return db.callFunction('udf_user_role_assignments_delete', {
      p_id: id
    });
  },

  // ─── Restore ─────────────────────────────────────────────

  async restore(id: number) {
    return db.callFunction('udf_user_role_assignments_restore', {
      p_id: id
    });
  }
};
