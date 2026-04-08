import { roleChangeLogRepository } from './role-change-log.repository';
import {
  RoleChangeLogRow,
  RoleChangeLogResponse,
  RoleChangeLogListQuery,
  RoleChangeLogCreateInput
} from './role-change-log.types';

// ─── Row → Response Mapper ─────────────────────────────────

const toResponse = (row: RoleChangeLogRow): RoleChangeLogResponse => ({
  id: row.rcl_id,
  userId: row.rcl_user_id,
  userEmail: row.rcl_user_email,
  userFirstName: row.rcl_user_first_name,
  userLastName: row.rcl_user_last_name,
  action: row.rcl_action,
  roleId: row.rcl_role_id,
  roleCode: row.rcl_role_code,
  roleName: row.rcl_role_name,
  contextType: row.rcl_context_type,
  contextId: row.rcl_context_id,
  reason: row.rcl_reason,
  changedBy: row.rcl_changed_by,
  changedByEmail: row.rcl_changed_by_email,
  createdAt: row.rcl_created_at
});

// ─── Role-Change-Log Service ───────────────────────────────
// Append-only audit log: list, getById, create. No update/delete/restore.

class RoleChangeLogService {

  /** List log entries with filters, date range & pagination */
  async list(query: RoleChangeLogListQuery) {
    const { rows, totalCount } = await roleChangeLogRepository.findAll(query);
    return {
      logs: rows.map(toResponse),
      pagination: {
        totalCount,
        pageIndex: query.pageIndex ?? 1,
        pageSize: query.pageSize ?? totalCount
      }
    };
  }

  /** Get a single log entry by ID */
  async getById(id: number) {
    const row = await roleChangeLogRepository.findById(id);
    if (!row) {
      const { AppError } = await import('../../core/errors/app-error');
      throw new AppError('Role change log entry not found', 404, 'NOT_FOUND');
    }
    return toResponse(row);
  }

  /** Create a manual log entry */
  async create(data: RoleChangeLogCreateInput) {
    const result = await roleChangeLogRepository.create(data);
    return { message: result.message, id: result.id };
  }
}

export const roleChangeLogService = new RoleChangeLogService();
