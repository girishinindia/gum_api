import { AppError } from '../../core/errors/app-error';
import { db } from '../../database/db';
import { userRoleAssignmentRepository } from './user-role-assignment.repository';
import {
  UserRoleAssignmentRow,
  UserRoleAssignmentResponse,
  UserRoleAssignmentListQuery
} from './user-role-assignment.types';

// ─── Protected role codes that cannot be changed by regular users ──
// student and instructor roles are system-assigned and cannot be
// removed or changed by anyone except Super Admin.

const PROTECTED_ROLE_CODES = ['student', 'instructor'];
const ADMIN_BLOCKED_ROLE_CODES = ['super_admin', 'admin'];

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

  // ─── Helper: Get the role code of the current user ────────

  private async getUserRoleCode(userId: number): Promise<string | null> {
    const row = await db.queryOne<{ role_code: string }>(
      `SELECT r.code AS role_code
       FROM user_role_assignments ura
       INNER JOIN roles r ON ura.role_id = r.id
       WHERE ura.user_id = $1
         AND ura.is_deleted = FALSE
         AND ura.is_active = TRUE
         AND r.is_deleted = FALSE
       ORDER BY r.level ASC
       LIMIT 1`,
      [userId]
    );
    return row?.role_code ?? null;
  }

  // ─── Helper: Get role code by role ID ─────────────────────

  private async getRoleCodeById(roleId: number): Promise<string | null> {
    const row = await db.queryOne<{ code: string }>(
      'SELECT code FROM roles WHERE id = $1 AND is_deleted = FALSE',
      [roleId]
    );
    return row?.code ?? null;
  }

  // ─── Helper: Get role code from an existing assignment ────

  private async getAssignmentRoleCode(assignmentId: number): Promise<string | null> {
    const row = await db.queryOne<{ role_code: string }>(
      `SELECT r.code AS role_code
       FROM user_role_assignments ura
       INNER JOIN roles r ON ura.role_id = r.id
       WHERE ura.id = $1`,
      [assignmentId]
    );
    return row?.role_code ?? null;
  }

  // ─── List assignments with filters & pagination ───────────

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

  // ─── Get a single assignment by ID ────────────────────────

  async getById(id: number) {
    const row = await userRoleAssignmentRepository.findById(id);
    if (!row) {
      throw new AppError('User role assignment not found', 404, 'NOT_FOUND');
    }
    return toResponse(row);
  }

  // ─── Create a new assignment ──────────────────────────────
  // Guards:
  //   1. Admin cannot assign super_admin or admin roles
  //   2. Only Super Admin can assign protected roles (student, instructor)

  async create(data: {
    userId: number;
    roleId: number;
    contextType?: string;
    contextId?: number;
    expiresAt?: string;
    reason?: string;
    assignedBy?: number;
  }) {
    // Get the role code being assigned
    const targetRoleCode = await this.getRoleCodeById(data.roleId);
    if (!targetRoleCode) {
      throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
    }

    // Get the current user's highest role
    if (data.assignedBy) {
      const currentUserRole = await this.getUserRoleCode(data.assignedBy);

      // Guard: Admin cannot assign super_admin or admin roles
      if (currentUserRole === 'admin' && ADMIN_BLOCKED_ROLE_CODES.includes(targetRoleCode)) {
        throw new AppError(
          'Admins cannot assign Super Admin or Admin roles. Only Super Admin can do this.',
          403,
          'ADMIN_CANNOT_ASSIGN_ADMIN'
        );
      }

      // Guard: Only Super Admin can assign/modify protected roles (student, instructor)
      if (currentUserRole !== 'super_admin' && PROTECTED_ROLE_CODES.includes(targetRoleCode)) {
        throw new AppError(
          'Only Super Admin can assign Student or Instructor roles. These are system-managed roles.',
          403,
          'CANNOT_ASSIGN_PROTECTED_ROLE'
        );
      }
    }

    const result = await userRoleAssignmentRepository.create(data);
    return { message: result.message, id: result.id };
  }

  // ─── Update an assignment ─────────────────────────────────
  // Guard: Cannot modify protected role assignments unless Super Admin

  async update(id: number, data: {
    expiresAt?: string | null;
    reason?: string | null;
    isActive?: boolean;
    updatedBy?: number;
  }) {
    // Check the role being modified
    const assignmentRoleCode = await this.getAssignmentRoleCode(id);

    if (data.updatedBy) {
      const currentUserRole = await this.getUserRoleCode(data.updatedBy);

      // Guard: Only Super Admin can modify student/instructor role assignments
      if (currentUserRole !== 'super_admin' && assignmentRoleCode && PROTECTED_ROLE_CODES.includes(assignmentRoleCode)) {
        throw new AppError(
          'Only Super Admin can modify Student or Instructor role assignments.',
          403,
          'CANNOT_MODIFY_PROTECTED_ROLE'
        );
      }

      // Guard: Admin cannot modify super_admin or admin role assignments
      if (currentUserRole === 'admin' && assignmentRoleCode && ADMIN_BLOCKED_ROLE_CODES.includes(assignmentRoleCode)) {
        throw new AppError(
          'Admins cannot modify Super Admin or Admin role assignments.',
          403,
          'ADMIN_CANNOT_MODIFY_ADMIN'
        );
      }
    }

    const result = await userRoleAssignmentRepository.update(id, data);
    return { message: result.message };
  }

  // ─── Soft-delete an assignment ────────────────────────────
  // Guards:
  //   1. Only Super Admin can remove student/instructor role
  //   2. Admin cannot remove super_admin or admin role assignments

  async delete(id: number, currentUserId?: number) {
    const assignmentRoleCode = await this.getAssignmentRoleCode(id);

    if (currentUserId) {
      const currentUserRole = await this.getUserRoleCode(currentUserId);

      // Guard: Only Super Admin can remove student/instructor roles
      if (currentUserRole !== 'super_admin' && assignmentRoleCode && PROTECTED_ROLE_CODES.includes(assignmentRoleCode)) {
        throw new AppError(
          'Only Super Admin can remove Student or Instructor role assignments.',
          403,
          'CANNOT_DELETE_PROTECTED_ROLE'
        );
      }

      // Guard: Admin cannot remove super_admin or admin role assignments
      if (currentUserRole === 'admin' && assignmentRoleCode && ADMIN_BLOCKED_ROLE_CODES.includes(assignmentRoleCode)) {
        throw new AppError(
          'Admins cannot remove Super Admin or Admin role assignments.',
          403,
          'ADMIN_CANNOT_DELETE_ADMIN'
        );
      }
    }

    const result = await userRoleAssignmentRepository.delete(id);
    return { message: result.message };
  }

  // ─── Restore a soft-deleted assignment ────────────────────

  async restore(id: number) {
    const result = await userRoleAssignmentRepository.restore(id);
    return { message: result.message };
  }
}

export const userRoleAssignmentService = new UserRoleAssignmentService();
