// ═══════════════════════════════════════════════════════════════
// auth.service — UDF wrappers + JWT glue for the auth module.
//
// Rules:
//   • NO naked SQL. Everything goes through `db.callFunction` /
//     `db.callTableFunction` / `db.query` with parameters.
//   • Handlers only call this layer; they don't touch the db module.
//   • `db.callFunction` already throws AppError on { success: false }
//     via parseUdfError, so we rarely need try/catch here.
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';

import { db } from '../../database/db';
import { getPool } from '../../database/pg-pool';
import { redisRevoked } from '../../database/redis';
import {
  secondsUntilExpiry,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from '../../core/auth/jwt';
import { AppError } from '../../core/errors/app-error';
import { logger } from '../../core/logger/logger';
import type { AuthUser, JwtPayload, TokenPair } from '../../core/types/auth.types';
import { env } from '../../config/env';
import { mailer } from '../../integrations/email/mailer.service';
import { sendMobileOtp } from './auth-flows.service';

// ─── Types ───────────────────────────────────────────────────────

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email?: string;
  mobile?: string;
  password: string;
  roleCode: 'student' | 'instructor';
  countryId: number;
}

export interface RegisterOutput {
  userId: number;
  // OTP row ids so the client can call the public
  // /auth/register/verify-email and /register/verify-mobile routes
  // with { userId, otpId, otpCode } — no JWT required (the user
  // cannot log in yet because both verified flags are false).
  emailOtpId: number | null;
  mobileOtpId: number | null;
  // Only populated in non-production mode — we log the OTP but also
  // surface it in the HTTP response so the verify flow can be tested
  // end-to-end without a real mail/SMS gateway.
  devEmailOtp?: string | null;
  devMobileOtp?: string | null;
}

export interface LoginInput {
  identifier: string;
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface LoginOutput extends TokenPair {
  user: AuthUser;
  sessionId: number;
}

// ─── Internals ───────────────────────────────────────────────────

interface EffectivePermsRow {
  permission_code: string | null;
  role_code: string;
}

/**
 * Fetch the effective permission list + role code for a user via
 * udf_auth_get_user_permissions and fold them into a ready-to-bake
 * AuthUser claim set.
 *
 * Name resolution:
 *   • Callers that already have the user's first/last name (e.g.
 *     login() — the login UDF payload carries them) should pass
 *     `names` so we don't hit udf_get_users.
 *   • Callers that don't (e.g. refresh()) omit `names` and we do
 *     a second round-trip through udf_get_users to populate them.
 *   • If udf_get_users doesn't know the user (shouldn't happen for
 *     a user that just passed udf_auth_get_user_permissions), the
 *     names fall back to null — the token still gets issued.
 *
 * The perms UDF always returns at least one row for an active user:
 * when the user has zero effective permissions, a single sentinel
 * row with permission_code = NULL carries the role code. Zero rows
 * → user is inactive / deleted / role-less.
 */
const loadAuthUser = async (
  userId: number,
  email: string,
  names?: { firstName: string | null; lastName: string | null }
): Promise<AuthUser> => {
  const { rows } = await db.callTableFunction<EffectivePermsRow>(
    'udf_auth_get_user_permissions',
    { p_user_id: userId }
  );

  if (rows.length === 0) {
    throw new AppError(
      'User has no active role',
      403,
      'ACCOUNT_INACTIVE'
    );
  }

  const roleCode = rows[0].role_code;
  const permissions = rows
    .map((r) => r.permission_code)
    .filter((code): code is string => typeof code === 'string' && code.length > 0);

  let firstName: string | null = names?.firstName ?? null;
  let lastName: string | null = names?.lastName ?? null;
  if (!names) {
    // Refresh path (or anywhere we don't already have the names).
    // Pay the extra round-trip to keep the response shape consistent
    // with login. Silently tolerate a missing row — the token still
    // gets issued with null names, matching the old behaviour.
    try {
      const { rows: userRows } = await db.callTableFunction<{
        user_first_name: string | null;
        user_last_name: string | null;
      }>('udf_get_users', { p_id: userId });
      if (userRows[0]) {
        firstName = userRows[0].user_first_name;
        lastName = userRows[0].user_last_name;
      }
    } catch {
      /* non-fatal — leave names null */
    }
  }

  return {
    id: userId,
    email,
    firstName,
    lastName,
    roles: [roleCode],
    permissions
  };
};

// ─── Register ────────────────────────────────────────────────────

export const register = async (
  input: RegisterInput
): Promise<RegisterOutput> => {
  // Raw pg call because the UDF returns extra dev-only fields
  // (email_otp / mobile_otp) that the shared callFunction helper
  // discards. We want them in dev mode.
  const pool = getPool();
  const params = [
    input.firstName,
    input.lastName,
    input.email ?? null,
    input.mobile ?? null,
    input.password,
    input.roleCode,
    input.countryId
  ];
  const sql = `
    SELECT udf_auth_register(
      p_first_name := $1,
      p_last_name  := $2,
      p_email      := $3,
      p_mobile     := $4,
      p_password   := $5,
      p_role_code  := $6,
      p_country_id := $7
    ) AS result
  `;

  const { rows } = await pool.query<{ result: Record<string, unknown> }>(
    sql,
    params
  );
  const result = rows[0]?.result;
  if (!result) {
    throw new AppError('udf_auth_register returned no result', 500, 'UDF_NO_RESULT');
  }

  if (!result.success) {
    const msg = String(result.message ?? 'Registration failed');
    // Common business errors: duplicate email/mobile → 409
    if (/already registered|already exists/i.test(msg)) {
      throw new AppError(msg, 409, 'DUPLICATE_ENTRY');
    }
    if (/invalid role|inactive role/i.test(msg)) {
      throw new AppError(msg, 400, 'VALIDATION_ERROR');
    }
    throw new AppError(msg, 400, 'REGISTRATION_FAILED');
  }

  const userId = Number(result.id);
  const emailOtpIdRaw = result.email_otp_id;
  const mobileOtpIdRaw = result.mobile_otp_id;
  const emailOtpId =
    emailOtpIdRaw != null ? Number(emailOtpIdRaw) : null;
  const mobileOtpId =
    mobileOtpIdRaw != null ? Number(mobileOtpIdRaw) : null;
  const emailOtp = (result.email_otp ?? null) as string | null;
  const mobileOtp = (result.mobile_otp ?? null) as string | null;

  // Dev echo (kept for the verify-auth-flows harness in non-prod).
  // Production delivery happens via mailer + sendMobileOtp below —
  // failures there are logged but never roll back the registration.
  if (emailOtp) {
    logger.info(
      { userId, channel: 'email', target: input.email, otp: emailOtp },
      '[auth.register] stubbed email OTP'
    );
  }
  if (mobileOtp) {
    logger.info(
      { userId, channel: 'mobile', target: input.mobile, otp: mobileOtp },
      '[auth.register] stubbed mobile OTP'
    );
  }

  // Best-effort mailer dispatch. Fire-and-forget — `safeSend` inside
  // the mailer swallows any Brevo failure so a flaky email provider
  // never blocks user registration.
  if (emailOtp && input.email) {
    void mailer.sendOtp({
      to: input.email,
      name: input.firstName,
      otp: emailOtp,
      flow: 'register'
    });
  }

  // Best-effort SMS dispatch. Fire-and-forget via the shared
  // sendMobileOtp helper which:
  //   • only fires when NODE_ENV === 'production' OR SMS_FORCE_SEND,
  //   • re-reads the E.164 destination from user_otps,
  //   • strips the leading '+' and calls SMSGatewayHub,
  //   • swallows gateway failures into a warn/error log so a flaky
  //     SMS provider never rolls back the registration.
  // The user can still verify from the devMobileOtp echo in non-prod,
  // or request a resend via the forgot-password flow in prod.
  if (mobileOtpId != null && mobileOtp) {
    void sendMobileOtp({ userId, otpId: mobileOtpId, otpCode: mobileOtp });
  }

  const includeOtpInResponse = env.NODE_ENV !== 'production';
  return {
    userId,
    emailOtpId,
    mobileOtpId,
    devEmailOtp: includeOtpInResponse ? emailOtp : null,
    devMobileOtp: includeOtpInResponse ? mobileOtp : null
  };
};

// ─── Login ───────────────────────────────────────────────────────

export const login = async (input: LoginInput): Promise<LoginOutput> => {
  const pool = getPool();

  // udf_auth_login requires p_session_token. We hand it an opaque
  // UUID per attempt (the UDF stores it as the session's "session
  // token" column). The Node layer keeps its own session identity
  // via the JWT's jti claim, which we set to String(session_id).
  const sessionTokenStub = crypto.randomUUID();
  const refreshTokenStub = crypto.randomUUID();

  const sql = `
    SELECT udf_auth_login(
      p_identifier    := $1,
      p_password      := $2,
      p_session_token := $3,
      p_refresh_token := $4,
      p_ip_address    := $5::INET,
      p_user_agent    := $6
    ) AS result
  `;
  const params = [
    input.identifier,
    input.password,
    sessionTokenStub,
    refreshTokenStub,
    input.ipAddress ?? null,
    input.userAgent ?? null
  ];

  const { rows } = await pool.query<{ result: Record<string, unknown> }>(
    sql,
    params
  );
  const result = rows[0]?.result;
  if (!result) {
    throw new AppError('udf_auth_login returned no result', 500, 'UDF_NO_RESULT');
  }

  if (!result.success) {
    const msg = String(result.message ?? 'Login failed');

    // The UDF returns a structured `failure_reason` for the
    // account-not-verified path:
    //   • 'email_not_verified'
    //   • 'mobile_not_verified'
    //   • 'both_not_verified'
    // along with an `unverified_channels` JSONB array like ["email"]
    // or ["email","mobile"]. We surface this as 403 ACCOUNT_NOT_VERIFIED
    // with a `details` object so the client can route the user to the
    // correct register-verify screen.
    const failureReason = result.failure_reason as string | undefined;
    if (
      failureReason === 'email_not_verified' ||
      failureReason === 'mobile_not_verified' ||
      failureReason === 'both_not_verified'
    ) {
      const unverifiedChannels = Array.isArray(result.unverified_channels)
        ? (result.unverified_channels as string[])
        : [];
      const userIdFromUdf = result.user_id != null ? Number(result.user_id) : null;
      throw new AppError(
        msg,
        403,
        'ACCOUNT_NOT_VERIFIED',
        {
          userId: userIdFromUdf,
          failureReason,
          unverifiedChannels
        }
      );
    }

    // The UDF handles both "bad credentials" and "account locked"
    // cases. We map everything to 401 unless the message looks like
    // a lockout, which is 423.
    if (/locked|too many|exceeded/i.test(msg)) {
      throw new AppError(msg, 423, 'ACCOUNT_LOCKED');
    }
    throw new AppError(msg, 401, 'INVALID_CREDENTIALS');
  }

  const userId = Number(result.user_id);
  const sessionId = Number(result.session_id);
  if (!userId || !sessionId) {
    throw new AppError(
      'udf_auth_login returned malformed payload',
      500,
      'UDF_BAD_RESULT'
    );
  }

  // udf_auth_login now returns first_name, last_name, email, mobile
  // on the success path. We trust the UDF's email over the submitted
  // identifier so mobile-based logins still get the real email on
  // the JWT claim (and we don't need a second udf_get_users round
  // trip to resolve it).
  const emailFromUdf = typeof result.email === 'string' ? result.email : null;
  const email = emailFromUdf
    ?? (input.identifier.includes('@')
      ? input.identifier
      : `user${userId}@unknown.local`);

  const firstNameFromUdf =
    typeof result.first_name === 'string' ? result.first_name : null;
  const lastNameFromUdf =
    typeof result.last_name === 'string' ? result.last_name : null;

  const authUser = await loadAuthUser(userId, email, {
    firstName: firstNameFromUdf,
    lastName: lastNameFromUdf
  });

  // Sign the JWT pair with jti = String(sessionId). This ties the
  // JWT lifecycle to the DB session row so logout can revoke both.
  const jti = String(sessionId);
  const { token: accessToken } = signAccessToken({ user: authUser, jti });
  const { token: refreshToken } = signRefreshToken({ user: authUser, jti });

  return {
    user: authUser,
    sessionId,
    accessToken,
    refreshToken,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN
  };
};

// ─── Logout ──────────────────────────────────────────────────────

/**
 * Revoke a session by jti. Two side-effects:
 *  1. Call udf_auth_logout(session_id) to flip the DB row.
 *  2. Add the jti to the Redis blocklist (TTL = remaining access
 *     token lifetime, so the key expires naturally).
 *
 * We accept a JwtPayload so the caller (typically the /logout
 * handler) can hand us both the jti and the exp in one shot.
 */
export const logout = async (payload: JwtPayload): Promise<void> => {
  const jti = payload.jti ?? '';
  if (!jti) throw AppError.unauthorized('Token has no session id');

  const sessionId = Number.parseInt(jti, 10);
  if (Number.isNaN(sessionId) || sessionId <= 0) {
    throw new AppError('Malformed session id in token', 401, 'INVALID_TOKEN');
  }

  // Fire UDF; ignore "already revoked" because the blocklist
  // is the authoritative runtime check anyway.
  try {
    await db.callFunction('udf_auth_logout', { p_session_id: sessionId });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 404) {
      // Already revoked — still add to the blocklist below.
    } else {
      throw err;
    }
  }

  const ttl = secondsUntilExpiry(payload);
  await redisRevoked.add(jti, ttl);
};

// ─── Refresh ─────────────────────────────────────────────────────

export const refresh = async (
  refreshToken: string
): Promise<TokenPair & { user: AuthUser }> => {
  const payload = verifyRefreshToken(refreshToken);

  const jti = payload.jti ?? '';
  if (!jti) throw AppError.unauthorized('Refresh token has no session id');

  // If the blocklist already has this jti, the session was logged
  // out — reject the refresh.
  if (await redisRevoked.isRevoked(jti)) {
    throw new AppError('Session has been revoked', 401, 'TOKEN_REVOKED');
  }

  // Re-load the auth user so a permission change mid-session is
  // reflected on the next refresh (the short-lived access token
  // will catch up within JWT_ACCESS_EXPIRES_IN).
  const authUser = await loadAuthUser(payload.sub, payload.email);

  // Re-use the SAME jti so logout still kills the whole chain.
  const { token: accessToken } = signAccessToken({ user: authUser, jti });
  const { token: newRefreshToken } = signRefreshToken({ user: authUser, jti });

  return {
    user: authUser,
    accessToken,
    refreshToken: newRefreshToken,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN
  };
};

// ─── /me ─────────────────────────────────────────────────────────

export interface MeOutput {
  id: number;
  email: string | null;
  mobile: string | null;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  isEmailVerified: boolean;
  isMobileVerified: boolean;
  roles: string[];
  permissions: string[];
}

interface UserViewRow {
  user_id: number | string;
  user_first_name: string | null;
  user_last_name: string | null;
  user_email: string | null;
  user_mobile: string | null;
  user_is_active: boolean;
  user_is_email_verified: boolean;
  user_is_mobile_verified: boolean;
  role_code: string | null;
}

export const getMe = async (authUser: AuthUser): Promise<MeOutput> => {
  const { rows } = await db.callTableFunction<UserViewRow>('udf_get_users', {
    p_id: authUser.id
  });
  const row = rows[0];
  if (!row) {
    throw AppError.notFound('User not found');
  }

  return {
    id: Number(row.user_id),
    email: row.user_email,
    mobile: row.user_mobile,
    firstName: row.user_first_name,
    lastName: row.user_last_name,
    isActive: row.user_is_active,
    isEmailVerified: row.user_is_email_verified,
    isMobileVerified: row.user_is_mobile_verified,
    roles: row.role_code ? [row.role_code] : authUser.roles,
    permissions: authUser.permissions
  };
};
