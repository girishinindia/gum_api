// ═══════════════════════════════════════════════════════════════
// users.service — UDF wrappers for the users module.
//
// Important invariants:
//   • The DTO never carries the password column. The view excludes
//     it; this layer simply mirrors that contract so it cannot
//     leak by accident.
//   • Mutations that go through hierarchy-protected UDFs always
//     thread the caller id (`p_caller_id`) so the DB can do the
//     real authorization check.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';
import { logger } from '../../core/logger/logger';
import { mailer } from '../../integrations/email/mailer.service';
import { env } from '../../config/env';

import type {
  CreateUserBody,
  ListUsersQuery,
  UpdateUserBody
} from './users.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface UserDto {
  id: number;
  roleId: number;
  countryId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  mobile: string | null;
  isActive: boolean;
  isDeleted: boolean;
  isEmailVerified: boolean;
  isMobileVerified: boolean;
  emailVerifiedAt: string | null;
  mobileVerifiedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  // ── nested role ──
  role: {
    id: number;
    name: string;
    code: string;
    slug: string | null;
    level: number;
    isSystemRole: boolean;
    icon: string | null;
    color: string | null;
    isActive: boolean;
    isDeleted: boolean;
  };
  // ── nested country ──
  country: {
    id: number;
    name: string;
    iso2: string;
    iso3: string;
    phoneCode: string | null;
    nationality: string | null;
    nationalLanguage: string | null;
    languages: string[];
    currency: string | null;
    currencyName: string | null;
    currencySymbol: string | null;
    flagImage: string | null;
    isActive: boolean;
    isDeleted: boolean;
  };
}

interface UserRow {
  user_id: number | string;
  user_role_id: number | string;
  user_country_id: number | string;
  user_first_name: string;
  user_last_name: string;
  user_email: string | null;
  user_mobile: string | null;
  user_is_active: boolean;
  user_is_deleted: boolean;
  user_is_email_verified: boolean;
  user_is_mobile_verified: boolean;
  user_email_verified_at: Date | string | null;
  user_mobile_verified_at: Date | string | null;
  user_created_at: Date | string | null;
  user_updated_at: Date | string | null;
  user_deleted_at: Date | string | null;
  // ── role ──
  role_name: string;
  role_code: string;
  role_slug: string | null;
  role_level: number;
  role_is_system_role: boolean;
  role_icon: string | null;
  role_color: string | null;
  role_is_active: boolean;
  role_is_deleted: boolean;
  // ── country ──
  country_name: string;
  country_iso2: string;
  country_iso3: string;
  country_phone_code: string | null;
  country_nationality: string | null;
  country_national_language: string | null;
  country_languages: unknown;
  country_currency: string | null;
  country_currency_name: string | null;
  country_currency_symbol: string | null;
  country_flag_image: string | null;
  country_is_active: boolean;
  country_is_deleted: boolean;
}

const toIso = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapUser = (row: UserRow): UserDto => ({
  id: Number(row.user_id),
  roleId: Number(row.user_role_id),
  countryId: Number(row.user_country_id),
  firstName: row.user_first_name,
  lastName: row.user_last_name,
  email: row.user_email,
  mobile: row.user_mobile,
  isActive: row.user_is_active,
  isDeleted: row.user_is_deleted,
  isEmailVerified: row.user_is_email_verified,
  isMobileVerified: row.user_is_mobile_verified,
  emailVerifiedAt: toIso(row.user_email_verified_at),
  mobileVerifiedAt: toIso(row.user_mobile_verified_at),
  createdAt: toIso(row.user_created_at),
  updatedAt: toIso(row.user_updated_at),
  deletedAt: toIso(row.user_deleted_at),
  role: {
    id: Number(row.user_role_id),
    name: row.role_name,
    code: row.role_code,
    slug: row.role_slug,
    level: row.role_level,
    isSystemRole: row.role_is_system_role,
    icon: row.role_icon,
    color: row.role_color,
    isActive: row.role_is_active,
    isDeleted: row.role_is_deleted
  },
  country: {
    id: Number(row.user_country_id),
    name: row.country_name,
    iso2: row.country_iso2,
    iso3: row.country_iso3,
    phoneCode: row.country_phone_code,
    nationality: row.country_nationality,
    nationalLanguage: row.country_national_language,
    languages: Array.isArray(row.country_languages)
      ? (row.country_languages as string[])
      : [],
    currency: row.country_currency,
    currencyName: row.country_currency_name,
    currencySymbol: row.country_currency_symbol,
    flagImage: row.country_flag_image,
    isActive: row.country_is_active,
    isDeleted: row.country_is_deleted
  }
});

// ─── List ────────────────────────────────────────────────────────

export interface ListUsersResult {
  rows: UserDto[];
  meta: PaginationMeta;
}

export const listUsers = async (q: ListUsersQuery): Promise<ListUsersResult> => {
  const { rows, totalCount } = await db.callTableFunction<UserRow>(
    'udf_get_users',
    {
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? null,
      p_filter_is_email_verified: q.isEmailVerified ?? null,
      p_filter_is_mobile_verified: q.isMobileVerified ?? null,
      p_filter_role_id: q.roleId ?? null,
      p_filter_role_code: q.roleCode ?? null,
      p_filter_role_level: q.roleLevel ?? null,
      p_filter_country_id: q.countryId ?? null,
      p_filter_country_iso2: q.countryIso2 ?? null,
      p_filter_country_nationality: q.countryNationality ?? null,
      p_search_term: q.searchTerm ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapUser),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ───────────────────────────────────────────────────

export const getUserById = async (id: number): Promise<UserDto | null> => {
  const { rows } = await db.callTableFunction<UserRow>('udf_get_users', {
    p_id: id
  });
  const row = rows[0];
  return row ? mapUser(row) : null;
};

// ─── Create ──────────────────────────────────────────────────────

export interface CreateUserResult {
  id: number;
}

export const createUser = async (
  body: CreateUserBody,
  callerId: number | null
): Promise<CreateUserResult> => {
  const result = await db.callFunction('udf_users_insert', {
    p_first_name: body.firstName,
    p_last_name: body.lastName,
    p_password: body.password,
    p_email: body.email ?? null,
    p_mobile: body.mobile ?? null,
    p_role_id: body.roleId ?? 8,
    p_country_id: body.countryId ?? 1,
    p_is_active: body.isActive ?? true,
    p_is_email_verified: body.isEmailVerified ?? false,
    p_is_mobile_verified: body.isMobileVerified ?? false,
    p_created_by: callerId
  });

  const newUserId = Number(result.id);

  // Best-effort welcome email for admin-created users. We re-load
  // the user so we have the canonical first_name + email even if
  // body.firstName / body.email were trimmed/normalised by the UDF.
  // Skipped silently if the user has no email on file.
  if (body.email) {
    void (async () => {
      try {
        const created = await getUserById(newUserId);
        if (!created || !created.email) return;

        let createdByName: string | null = null;
        if (callerId) {
          const caller = await getUserById(callerId);
          createdByName = caller ? `${caller.firstName} ${caller.lastName}`.trim() : null;
        }

        const baseUrl = env.APP_URL.replace(/\/+$/, '');
        await mailer.sendWelcomeAdminCreated({
          to: created.email,
          name: created.firstName,
          loginUrl: `${baseUrl}/login`,
          setPasswordUrl: `${baseUrl}/forgot-password?email=${encodeURIComponent(created.email)}`,
          createdByName
        });
      } catch (err) {
        logger.warn(
          { err, userId: newUserId },
          '[users.createUser] welcome mailer dispatch failed'
        );
      }
    })();
  }

  return { id: newUserId };
};

// ─── Update (hierarchy-protected) ───────────────────────────────

export const updateUser = async (
  id: number,
  body: UpdateUserBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_users_update', {
    p_caller_id: callerId,
    p_id: id,
    p_country_id: body.countryId ?? null,
    p_first_name: body.firstName ?? null,
    p_last_name: body.lastName ?? null,
    p_is_active: body.isActive ?? null,
    p_is_email_verified: body.isEmailVerified ?? null,
    p_is_mobile_verified: body.isMobileVerified ?? null,
    p_updated_by: callerId
  });
};

// ─── Delete (hierarchy-protected) ───────────────────────────────

export const deleteUser = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  // Capture contact details BEFORE the soft delete so we still have
  // a deliverable email + name for the notification.
  const target = await getUserById(id);

  await db.callFunction('udf_users_delete', {
    p_caller_id: callerId,
    p_id: id
  });

  if (target?.email) {
    void mailer.sendAccountDeleted({ to: target.email, name: target.firstName });
  }
};

// ─── Restore (hierarchy-protected) ──────────────────────────────

export const restoreUser = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_users_restore', {
    p_caller_id: callerId,
    p_id: id
  });

  // Re-load AFTER restore so the row reflects the cleared
  // is_deleted flag. Skipped silently if no email on file.
  void (async () => {
    try {
      const restored = await getUserById(id);
      if (restored?.email) {
        await mailer.sendAccountRestored({
          to: restored.email,
          name: restored.firstName
        });
      }
    } catch (err) {
      logger.warn({ err, userId: id }, '[users.restoreUser] mailer dispatch failed');
    }
  })();
};

// ─── Admin: change role (super-admin only) ──────────────────────

export const changeUserRole = async (
  targetId: number,
  newRoleId: number,
  callerId: number | null
): Promise<void> => {
  // Snapshot the current role BEFORE the UDF mutates it so we can
  // surface the diff (old → new) in the notification email.
  const before = await getUserById(targetId);

  await db.callFunction('udf_auth_change_role', {
    p_caller_id: callerId,
    p_target_user_id: targetId,
    p_new_role_id: newRoleId
  });

  if (before?.email) {
    void (async () => {
      try {
        const after = await getUserById(targetId);
        let changedByName: string | null = null;
        if (callerId) {
          const caller = await getUserById(callerId);
          changedByName = caller ? `${caller.firstName} ${caller.lastName}`.trim() : null;
        }
        await mailer.sendRoleChanged({
          to: before.email!,
          name: before.firstName,
          oldRoleName: before.role.name,
          newRoleName: after?.role.name ?? 'Updated',
          changedByName
        });
      } catch (err) {
        logger.warn({ err, userId: targetId }, '[users.changeUserRole] mailer dispatch failed');
      }
    })();
  }
};

// ─── Admin: deactivate (super-admin only) ───────────────────────
//
// `udf_auth_deactivate` flips is_active=FALSE and revokes all
// sessions. Distinct from delete (which is the soft-delete path).

export const deactivateUser = async (
  targetId: number,
  callerId: number | null
): Promise<void> => {
  // Capture contact details BEFORE the deactivation in case the
  // UDF clears any field we need (it doesn't today, but defensive).
  const target = await getUserById(targetId);

  await db.callFunction('udf_auth_deactivate', {
    p_caller_id: callerId,
    p_target_user_id: targetId
  });

  if (target?.email) {
    void mailer.sendAccountDeactivated({
      to: target.email,
      name: target.firstName
    });
  }
};

// ─── Admin: set verification flags (admin / super-admin) ────────

export const setUserVerification = async (
  targetId: number,
  flags: { isEmailVerified?: boolean; isMobileVerified?: boolean },
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_auth_set_verification', {
    p_caller_id: callerId,
    p_target_user_id: targetId,
    p_is_email_verified: flags.isEmailVerified ?? null,
    p_is_mobile_verified: flags.isMobileVerified ?? null
  });
};
