import { AppError } from '../../core/errors/app-error';
import { db } from '../../database/db';
import { logger } from '../../core/logger/logger';
import { brevoService } from '../../integrations/email/brevo.service';
import { accountDeletedTemplate } from '../../integrations/email/templates/account-deleted.template';
import { accountRestoredTemplate } from '../../integrations/email/templates/account-restored.template';
import { userRepository } from './user.repository';
import { UserRow, UserResponse, UserCreateInput, UserUpdateInput, UserListQuery } from './user.types';

// ─── Row → Response Mapper ──────────────────────────────────

const toUserResponse = (row: UserRow): UserResponse => ({
  id: row.user_id,
  countryId: row.user_country_id,
  firstName: row.user_first_name,
  lastName: row.user_last_name,
  email: row.user_email,
  mobile: row.user_mobile,
  isActive: row.user_is_active,
  isDeleted: row.user_is_deleted,
  isEmailVerified: row.user_is_email_verified,
  isMobileVerified: row.user_is_mobile_verified,
  lastLogin: row.user_last_login,
  emailVerifiedAt: row.user_email_verified_at,
  mobileVerifiedAt: row.user_mobile_verified_at,
  createdAt: row.user_created_at,
  updatedAt: row.user_updated_at,
  deletedAt: row.user_deleted_at,
  country: row.country_name
    ? {
        name: row.country_name,
        iso2: row.country_iso2,
        iso3: row.country_iso3,
        phoneCode: row.country_phone_code,
        nationality: row.country_nationality,
        nationalLanguage: row.country_national_language,
        languages: row.country_languages,
        currency: row.country_currency,
        currencyName: row.country_currency_name,
        currencySymbol: row.country_currency_symbol,
        flagImage: row.country_flag_image
      }
    : null
});

// ─── User Service ───────────────────────────────────────────

class UserService {

  // ─── List (admin) ─────────────────────────────────────────

  async list(query: UserListQuery) {
    const { rows, totalCount } = await userRepository.findAll(query);

    return {
      users: rows.map(toUserResponse),
      pagination: {
        totalCount,
        pageIndex: query.pageIndex ?? 1,
        pageSize: query.pageSize ?? totalCount
      }
    };
  }

  // ─── Get One ──────────────────────────────────────────────

  async getById(id: number) {
    const row = await userRepository.findById(id);
    if (!row) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }
    return toUserResponse(row);
  }

  // ─── Get Own Profile (for /me) ────────────────────────────

  async getProfile(userId: number) {
    return this.getById(userId);
  }

  // ─── Helper: Get the role code of a user ───────────────────

  private async getUserRoleCode(userId: number): Promise<string | null> {
    const row = await db.queryOne<{ role_code: string }>(
      `SELECT r.code AS role_code
       FROM user_role_assignments ura
       INNER JOIN roles r ON ura.role_id = r.id
       WHERE ura.user_id = $1
         AND ura.is_deleted = FALSE AND ura.is_active = TRUE AND r.is_deleted = FALSE
       ORDER BY r.level ASC LIMIT 1`,
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

  // ─── Create (admin) ──────────────────────────────────────
  // If roleId is provided, assigns the role to the user in one step.
  // Guards:
  //   - Admin cannot assign super_admin or admin roles
  //   - Only Super Admin can assign student or instructor roles

  async create(input: UserCreateInput) {
    // Validate role assignment guards BEFORE creating the user
    if (input.roleId && input.createdBy) {
      const targetRoleCode = await this.getRoleCodeById(input.roleId);
      if (!targetRoleCode) {
        throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
      }

      const creatorRoleCode = await this.getUserRoleCode(input.createdBy);

      // Admin cannot assign super_admin or admin roles
      if (creatorRoleCode === 'admin' && ['super_admin', 'admin'].includes(targetRoleCode)) {
        throw new AppError(
          'Admins cannot assign Super Admin or Admin roles. Only Super Admin can do this.',
          403,
          'ADMIN_CANNOT_ASSIGN_ADMIN'
        );
      }

      // Only Super Admin can assign student or instructor roles
      if (creatorRoleCode !== 'super_admin' && ['student', 'instructor'].includes(targetRoleCode)) {
        throw new AppError(
          'Only Super Admin can assign Student or Instructor roles.',
          403,
          'CANNOT_ASSIGN_PROTECTED_ROLE'
        );
      }
    }

    const { id } = await userRepository.create(input);

    // Assign role if provided
    if (input.roleId) {
      try {
        await db.query(
          `INSERT INTO user_role_assignments (user_id, role_id, assigned_by)
           VALUES ($1, $2, $3)`,
          [id, input.roleId, input.createdBy ?? id]
        );
      } catch (err) {
        logger.error({ err, userId: id, roleId: input.roleId }, 'Failed to assign role during user creation');
      }
    }

    return this.getById(id);
  }

  // ─── Update (admin or self) ───────────────────────────────

  async update(id: number, input: UserUpdateInput) {
    await userRepository.update(id, input);
    return this.getById(id);
  }

  // ─── Update Own Profile ───────────────────────────────────

  async updateProfile(userId: number, input: { firstName?: string; lastName?: string }) {
    await userRepository.update(userId, {
      firstName: input.firstName,
      lastName: input.lastName,
      updatedBy: userId
    });
    return this.getById(userId);
  }

  // ─── Check if a user has the Super Admin role ─────────────

  private async isSuperAdmin(userId: number): Promise<boolean> {
    const row = await db.queryOne<{ is_super_admin: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM user_role_assignments ura
         INNER JOIN roles r ON ura.role_id = r.id
         WHERE ura.user_id = $1
           AND r.code = 'super_admin'
           AND ura.is_deleted = FALSE
           AND ura.is_active = TRUE
           AND r.is_deleted = FALSE
       ) AS is_super_admin`,
      [userId]
    );
    return row?.is_super_admin ?? false;
  }

  // ─── Delete (soft — Super Admin only) ─────────────────────
  // Guards:
  //   1. Super Admin cannot delete themselves
  //   2. Super Admin cannot delete other Super Admins
  //   3. Only Super Admin has user.delete permission (enforced via RBAC seed)

  async delete(id: number, currentUserId: number) {
    // Guard 1: Cannot delete yourself
    if (id === currentUserId) {
      throw new AppError(
        'You cannot delete your own account',
        403,
        'CANNOT_DELETE_SELF'
      );
    }

    // Guard 2: Cannot delete a Super Admin
    const targetIsSuperAdmin = await this.isSuperAdmin(id);
    if (targetIsSuperAdmin) {
      throw new AppError(
        'Super Admin accounts cannot be deleted',
        403,
        'CANNOT_DELETE_SUPER_ADMIN'
      );
    }

    // Fetch user before delete for notification
    const user = await userRepository.findById(id);

    const result = await userRepository.delete(id);

    // Send account deleted email (fire-and-forget)
    if (user?.user_email) {
      const fullName = `${user.user_first_name} ${user.user_last_name}`.trim();
      brevoService.sendToOne({
        to: user.user_email,
        toName: fullName,
        subject: 'Account Deleted - Grow Up More',
        html: accountDeletedTemplate(fullName)
      }).catch((err) => {
        logger.error({ err, userId: id }, 'Failed to send account deleted email');
      });
    }

    return { message: result.message };
  }

  // ─── Restore (Super Admin only) ───────────────────────────

  async restore(id: number, _currentUserId: number) {
    const result = await userRepository.restore(id);

    // Fetch restored user for notification
    const user = await userRepository.findById(id);

    // Send account restored email (fire-and-forget)
    if (user?.user_email) {
      const fullName = `${user.user_first_name} ${user.user_last_name}`.trim();
      brevoService.sendToOne({
        to: user.user_email,
        toName: fullName,
        subject: 'Account Restored - Grow Up More',
        html: accountRestoredTemplate(fullName)
      }).catch((err) => {
        logger.error({ err, userId: id }, 'Failed to send account restored email');
      });
    }

    return this.getById(id);
  }
}

export const userService = new UserService();
