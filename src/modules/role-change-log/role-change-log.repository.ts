import { db } from '../../database/db';
import { RoleChangeLogRow, RoleChangeLogListQuery, RoleChangeLogCreateInput } from './role-change-log.types';

// ─── Role-Change-Log Repository (PostgreSQL via UDFs) ──────
// Append-only audit log: read + insert only. No update, delete, or restore.

export const roleChangeLogRepository = {

  // ─── List ─────────────────────────────────────────────────

  async findAll(query: RoleChangeLogListQuery): Promise<{ rows: RoleChangeLogRow[]; totalCount: number }> {
    return db.callTableFunction<RoleChangeLogRow>('udf_get_role_change_log', {
      p_id: query.id,
      p_user_id: query.userId,
      p_role_id: query.roleId,
      p_filter_action: query.filterAction,
      p_filter_context_type: query.filterContextType,
      p_filter_changed_by: query.filterChangedBy,
      p_filter_date_from: query.filterDateFrom,
      p_filter_date_to: query.filterDateTo,
      p_search_term: query.searchTerm,
      p_sort_column: query.sortColumn,
      p_sort_direction: query.sortDirection,
      p_page_index: query.pageIndex,
      p_page_size: query.pageSize
    });
  },

  // ─── Find by ID ──────────────────────────────────────────

  async findById(id: number): Promise<RoleChangeLogRow | null> {
    const { rows } = await db.callTableFunction<RoleChangeLogRow>('udf_get_role_change_log', {
      p_id: id
    });
    return rows[0] ?? null;
  },

  // ─── Create (manual log entry) ───────────────────────────

  async create(data: RoleChangeLogCreateInput) {
    return db.callFunction('udf_role_change_log_insert', {
      p_user_id: data.userId,
      p_action: data.action,
      p_role_id: data.roleId ?? null,
      p_context_type: data.contextType ?? null,
      p_context_id: data.contextId ?? null,
      p_old_values: data.oldValues ? JSON.stringify(data.oldValues) : null,
      p_new_values: data.newValues ? JSON.stringify(data.newValues) : null,
      p_reason: data.reason ?? null,
      p_ip_address: data.ipAddress ?? null,
      p_changed_by: data.changedBy ?? null
    });
  }
};
