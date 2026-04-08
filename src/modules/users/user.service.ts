import { AppError } from '../../core/errors/app-error';
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

  // ─── Create (admin) ──────────────────────────────────────

  async create(input: UserCreateInput) {
    const { id } = await userRepository.create(input);
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

  // ─── Delete (soft — admin) ────────────────────────────────

  async delete(id: number) {
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

  // ─── Restore (admin) ─────────────────────────────────────

  async restore(id: number) {
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
