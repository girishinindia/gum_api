import { userRoleAssignmentRepository } from './user-role-assignment.repository';
import {
  UserRoleAssignmentRow,
  UserRoleAssignmentResponse,
  UserRoleAssignmentListQuery
} from './user-role-assignment.types';

// ─── Row → Response Mapper ─────────────────────────────────

const toResponse = (row: UserRoleAssignmentRow): UserRoleAssignmentResponse => ({
  id: row.ura_id,
  userId: row.ura_user_id,
  userEmail: row.ura_user_email,
  userFirstName: row.ura_user_first_name,
  userLastName: row.ura_user_last_name,
  roleId: row.ura_role_id,
  roleName: row.ura_role_name,
  roleCode: row.ura_role_code,
  roleLevel: row.ura_role_level,
  contextType: row.ura_context_type,
  contextId: row.ura_context_id,
  assignedAt: row.ura_assigned_at,
  expiresAt: row.ura_expires_at,
  reason: row.ura_reason,
  assignedBy: row.ura_assigned_by,
  isActive: row.ura_is_active,
  isCurrentlyValid: row.ura_is_currently_valid
});

// ─── User-Role-Assignment Service ──────────────────────────

class UserRoleAssignmentService {

  /** List assignments with filters & pagination */
  async list(query: UserRoleAssignmentListQuery) {
    const { rows, totalCount } = await userRoleAssignmentRepository.findAll(query);
    return {
      assignments: rows.map(toResponse),
      pagination: {
        totalCount,
        pageIndex: query.pageIndex ?? 1,
        pageSize: query.pageSize ?? totalCount
      }
    };
  }

  /** Get a single assignment by ID */
  async getById(id: number) {
    const row = await userRoleAssignmentRepository.findById(id);
    if (!row) {
      const { AppError } = await import('../../core/errors/app-error');
      throw new AppError('User role assignment not found', 404, 'NOT_FOUND');
    }
    return toResponse(row);
  }

  /** Create a new assignment */
  async create(data: {
    userId: number;
    roleId: number;
    contextType?: string;
    contextId?: number;
    expiresAt?: string;
    reason?: string;
    assignedBy?: number;
  }) {
    const result = await userRoleAssignmentRepository.create(data);
    return { message: result.message, id: result.id };
  }

  /** Update an assignment (expiry, reason, active status) */
  async update(id: number, data: {
    expiresAt?: string | null;
    reason?: string | null;
    isActive?: boolean;
    updatedBy?: number;
  }) {
    const result = await userRoleAssignmentRepository.update(id, data);
    return { message: result.message };
  }

  /** Soft-delete an assignment */
  async delete(id: number) {
    const result = await userRoleAssignmentRepository.delete(id);
    return { message: result.message };
  }

  /** Restore a soft-deleted assignment */
  async restore(id: number) {
    const result = await userRoleAssignmentRepository.restore(id);
    return { message: result.message };
  }
}

export const userRoleAssignmentService = new UserRoleAssignmentService();
