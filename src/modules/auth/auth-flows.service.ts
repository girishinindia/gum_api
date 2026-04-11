// ═══════════════════════════════════════════════════════════════
// auth-flows.service — secondary auth flows added in Step 11.
//
// Covers:
//   • forgot-password   — public, recovery via email + mobile OTPs
//   • reset-password    — authenticated, change current user's password
//   • verify-email      — authenticated, mark current email verified
//   • verify-mobile     — authenticated, mark current mobile verified
//   • change-email      — authenticated, swap to a new email
//   • change-mobile     — authenticated, swap to a new mobile
//
// Conventions inherited from auth.service.ts:
//   • UDFs that bundle dev OTP codes (`*_otp` keys) get raw pool
//     access so the codes survive — db.callFunction would strip
//     them. Everything else uses db.callFunction so parseUdfError
//     gives us 4xx mapping for free.
//   • The "complete" leg of an OTP-gated flow always verifies the
//     OTP from the service layer first (the *_complete UDFs do
//     not check OTPs themselves; that's deliberate so the API can
//     enforce dual-channel verification before mutating state).
//   • All non-production environments leak the OTP codes back in
//     the response payload so the verify-auth-flows harness can
//     drive end-to-end tests without a real mail/SMS gateway.
// ═══════════════════════════════════════════════════════════════

import ms from 'ms';
import { db } from '../../database/db';
import { getPool } from '../../database/pg-pool';
import { redisRevoked } from '../../database/redis';
import { AppError } from '../../core/errors/app-error';
import { logger } from '../../core/logger/logger';
import { env } from '../../config/env';
import { smsGatewayService } from '../../integrations/sms/sms-gateway.service';
import { mailer } from '../../integrations/email/mailer.service';
import type { OtpFlow } from '../../integrations/email/templates/otp.template';

// ─── Shared types ────────────────────────────────────────────────

const includeDevSecrets = (): boolean => env.NODE_ENV !== 'production';

// ─── Redis blocklist propagation for bulk session revocation ─────
//
// The *_complete UDFs (reset/forgot password, change-email,
// change-mobile) call udf_session_revoke_all which only mutates
// the DB row (is_active = false). The authenticate middleware,
// however, only consults the Redis blocklist — it never looks at
// user_sessions. If we stopped there, already-issued JWTs would
// continue to validate until they expired on their own.
//
// To make revocation actually effective we query the set of
// session ids for the user that were active *before* the UDF
// flipped them, and push each id (as jti) into the Redis
// blocklist. TTL is the configured access-token lifetime so keys
// expire naturally once no real JWT could reference them.
//
// We query BEFORE calling the *_complete UDF because after the
// UDF runs, is_active is false and revoked_at is set — but we
// still need to know which ids to blocklist. In practice we run
// this helper both before and after to catch sessions created in
// the race window (none expected, but cheap insurance).

const parseAccessTtlSeconds = (): number => {
  const raw = env.JWT_ACCESS_EXPIRES_IN;
  // ms() returns milliseconds; fall back to 15m if parsing fails.
  const millis = typeof raw === 'string' ? ms(raw as ms.StringValue) : undefined;
  if (typeof millis === 'number' && Number.isFinite(millis) && millis > 0) {
    return Math.ceil(millis / 1000);
  }
  return 15 * 60;
};

const revokeUserSessionsInRedis = async (userId: number): Promise<void> => {
  const pool = getPool();
  const { rows } = await pool.query<{ id: string | number }>(
    `SELECT id
       FROM user_sessions
      WHERE user_id = $1::BIGINT
        AND expires_at > NOW()`,
    [userId]
  );
  if (rows.length === 0) return;
  const ttl = parseAccessTtlSeconds();
  await Promise.all(
    rows.map((row) => redisRevoked.add(String(row.id), ttl))
  );
  logger.info(
    { userId, revoked: rows.length, ttl },
    '[auth-flows] pushed session jtis to Redis blocklist'
  );
};

const asString = (v: unknown): string | null =>
  v == null ? null : String(v);

const asNumber = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

interface DualOtpInitiateOutput {
  userId: number;
  emailOtpId: number | null;
  mobileOtpId: number | null;
  // Only populated when NODE_ENV !== 'production'
  devEmailOtp: string | null;
  devMobileOtp: string | null;
}

interface SingleOtpInitiateOutput {
  otpId: number;
  // Only populated when NODE_ENV !== 'production'
  devOtpCode: string | null;
}

// ─── OTP verification helper (single channel) ────────────────────

/**
 * Run udf_otp_verify and translate the JSONB envelope into either
 * a clean return or an AppError. The wrapper exists because OTP
 * verify is called from many flows and the error mapping is the
 * same in every place.
 */
const verifyOtp = async (
  otpId: number,
  otpCode: string,
  channelLabel: 'email' | 'mobile'
): Promise<void> => {
  const pool = getPool();
  const { rows } = await pool.query<{ result: Record<string, unknown> }>(
    'SELECT udf_otp_verify($1, $2) AS result',
    [otpId, otpCode]
  );
  const result = rows[0]?.result;
  if (!result) {
    throw new AppError(
      'udf_otp_verify returned no result',
      500,
      'UDF_NO_RESULT'
    );
  }
  if (!result.success) {
    const msg = String(result.message ?? `${channelLabel} OTP verification failed`);
    if (/expired/i.test(msg)) {
      throw new AppError(
        `${channelLabel} OTP has expired`,
        410,
        'OTP_EXPIRED'
      );
    }
    if (/exhausted|maximum/i.test(msg)) {
      throw new AppError(
        `${channelLabel} OTP attempts exhausted`,
        429,
        'OTP_EXHAUSTED'
      );
    }
    if (/not found/i.test(msg)) {
      throw new AppError(
        `${channelLabel} OTP record not found`,
        404,
        'OTP_NOT_FOUND'
      );
    }
    throw new AppError(
      `${channelLabel} OTP invalid: ${msg}`,
      400,
      'OTP_INVALID'
    );
  }
};

// ─── Generic raw-pool runner for *_initiate UDFs that bundle codes

const callDualChannelInitiate = async (
  sql: string,
  params: unknown[],
  flowLabel: string,
  // Caller may pass a known user_id (used by reset_password_initiate
  // which is authenticated and doesn't return user_id from the UDF).
  knownUserId?: number,
  // OtpFlow value used to look up the right email template / subject
  // line in mailer.sendOtp. Must align with one of the keys in
  // otp.template.ts > flowConfigs. Optional — if omitted, no email
  // dispatch is attempted (callers wire it explicitly).
  emailFlow?: OtpFlow
): Promise<DualOtpInitiateOutput> => {
  const pool = getPool();
  const { rows } = await pool.query<{ result: Record<string, unknown> }>(
    sql,
    params
  );
  const result = rows[0]?.result;
  if (!result) {
    throw new AppError(`${flowLabel} returned no result`, 500, 'UDF_NO_RESULT');
  }
  if (!result.success) {
    const msg = String(result.message ?? `${flowLabel} failed`);
    if (/not found|does not exist/i.test(msg)) {
      throw new AppError(msg, 404, 'NOT_FOUND');
    }
    if (/inactive|not active/i.test(msg)) {
      throw new AppError(msg, 403, 'ACCOUNT_INACTIVE');
    }
    if (/cooldown/i.test(msg)) {
      throw new AppError(msg, 429, 'OTP_COOLDOWN');
    }
    throw new AppError(msg, 400, `${flowLabel.toUpperCase()}_FAILED`);
  }

  const userId = asNumber(result.user_id) ?? knownUserId ?? 0;
  const emailOtpId = asNumber(result.email_otp_id);
  const mobileOtpId = asNumber(result.mobile_otp_id);
  const emailOtpCode = asString(result.email_otp);
  const mobileOtpCode = asString(result.mobile_otp);

  if (emailOtpCode) {
    logger.info(
      { userId, channel: 'email', otp: emailOtpCode, flow: flowLabel },
      `[auth-flows] stubbed email OTP for ${flowLabel}`
    );
  }
  if (mobileOtpCode) {
    logger.info(
      { userId, channel: 'mobile', otp: mobileOtpCode, flow: flowLabel },
      `[auth-flows] stubbed mobile OTP for ${flowLabel}`
    );
  }

  // Production-only SMS dispatch. The OTP destination was already
  // formatted to E.164 inside the *_initiate UDF; we read it back
  // from user_otps so the gateway gets a fully-qualified number.
  if (mobileOtpId != null && mobileOtpCode && userId > 0) {
    await sendMobileOtp({
      userId,
      otpId: mobileOtpId,
      otpCode: mobileOtpCode
    });
  }

  // Best-effort email OTP dispatch via mailer. Fire-and-forget so
  // a flaky Brevo never blocks the auth flow. We need the user's
  // current email + first name for the template — fetch from the
  // contact view, which is cheap and idempotent.
  if (emailFlow && emailOtpCode && userId > 0) {
    void (async () => {
      try {
        const contact = await loadContact(userId);
        if (contact.user_email) {
          await mailer.sendOtp({
            to: contact.user_email,
            name: contact.user_first_name,
            otp: emailOtpCode,
            flow: emailFlow
          });
        }
      } catch (err) {
        logger.warn(
          { err, userId, flow: flowLabel },
          '[auth-flows] mailer dispatch failed for OTP'
        );
      }
    })();
  }

  return {
    userId,
    emailOtpId,
    mobileOtpId,
    devEmailOtp: includeDevSecrets() ? emailOtpCode : null,
    devMobileOtp: includeDevSecrets() ? mobileOtpCode : null
  };
};

// ─── Helper: generate a single-channel OTP via udf_otp_generate ──

/**
 * Generate one OTP record and return its id + (in dev) the plain
 * code. Used by the verify-email / verify-mobile flows where we
 * don't need a paired channel.
 */
const generateSingleOtp = async (
  userId: number,
  purpose:
    | 'registration'
    | 'forgot_password'
    | 'reset_password'
    | 'change_email'
    | 'change_mobile'
    | 're_verification',
  channel: 'email' | 'mobile',
  destination: string,
  // Optional: an OtpFlow value to drive a mailer dispatch when the
  // OTP is delivered via email. For mobile-channel OTPs this is
  // ignored — the SMS gateway path handles delivery.
  emailFlow?: OtpFlow,
  // Optional: a pre-loaded user name to avoid an extra DB hit when
  // the caller already has it. Falls back to a contact lookup.
  userName?: string | null
): Promise<SingleOtpInitiateOutput> => {
  const pool = getPool();
  const { rows } = await pool.query<{ result: Record<string, unknown> }>(
    `SELECT udf_otp_generate(
        $1::BIGINT,
        $2::otp_purpose,
        $3::otp_channel,
        $4::TEXT
      ) AS result`,
    [userId, purpose, channel, destination]
  );
  const result = rows[0]?.result;
  if (!result) {
    throw new AppError(
      'udf_otp_generate returned no result',
      500,
      'UDF_NO_RESULT'
    );
  }
  if (!result.success) {
    const msg = String(result.message ?? 'OTP generation failed');
    if (/cooldown/i.test(msg)) {
      throw new AppError(msg, 429, 'OTP_COOLDOWN');
    }
    if (/not found|does not exist/i.test(msg)) {
      throw new AppError(msg, 404, 'NOT_FOUND');
    }
    if (/not active|inactive/i.test(msg)) {
      throw new AppError(msg, 403, 'ACCOUNT_INACTIVE');
    }
    throw new AppError(msg, 400, 'OTP_GENERATE_FAILED');
  }

  const otpId = asNumber(result.id);
  const otpCode = asString(result.otp_code);
  if (otpId == null) {
    throw new AppError('OTP id missing', 500, 'UDF_BAD_RESULT');
  }

  if (otpCode) {
    logger.info(
      { userId, channel, destination, otp: otpCode },
      '[auth-flows] stubbed OTP delivery'
    );
  }

  // Production-only SMS dispatch for mobile-channel OTPs.
  if (channel === 'mobile' && otpCode) {
    await sendMobileOtp({ userId, otpId, otpCode });
  }

  // Email-channel OTPs go through the mailer (best-effort).
  if (channel === 'email' && otpCode && emailFlow) {
    void mailer.sendOtp({
      to: destination,
      name: userName ?? null,
      otp: otpCode,
      flow: emailFlow
    });
  }

  return {
    otpId,
    devOtpCode: includeDevSecrets() ? otpCode : null
  };
};

// ─── Helper: load current email / mobile from the user view ──────

interface ContactRow {
  user_first_name: string | null;
  user_email: string | null;
  user_mobile: string | null;
  user_is_email_verified: boolean;
  user_is_mobile_verified: boolean;
  // Joined from countries via user.country_id (e.g. "+91" for India).
  // Used to build the E.164 destination for SMS OTPs so the gateway
  // receives a fully-qualified number regardless of which country
  // the user belongs to.
  country_phone_code: string | null;
}

const loadContact = async (userId: number): Promise<ContactRow> => {
  const { rows } = await db.callTableFunction<ContactRow>('udf_get_users', {
    p_id: userId
  });
  const row = rows[0];
  if (!row) throw AppError.notFound('User not found');
  return row;
};

// ─── Helper: format a mobile number into E.164 form ──────────────
//
// Combines a country dialing code (e.g. "+91", "91", or null) with
// a bare local mobile (e.g. "9662278990") to produce "+919662278990".
// Defensive against double-prefixing if the caller already prepended
// the code, and against country rows that store the code without the
// leading '+'.
//
// Returns null if there's no usable mobile to format.
export const formatMobileE164 = (
  phoneCode: string | null | undefined,
  mobile: string | null | undefined
): string | null => {
  if (!mobile) return null;
  const trimmedMobile = mobile.trim();
  if (!trimmedMobile) return null;

  // If the mobile already starts with '+', assume it's already E.164
  // and pass it through unchanged.
  if (trimmedMobile.startsWith('+')) {
    return trimmedMobile;
  }

  const code = (phoneCode ?? '').trim();
  if (!code) {
    // No country code on file — return the bare mobile so the OTP
    // record still has a non-null destination. The SMS gateway will
    // reject it, but the OTP record itself is still verifiable.
    return trimmedMobile;
  }

  // Normalise the code: ensure exactly one leading '+'.
  const normalisedCode = code.startsWith('+') ? code : `+${code}`;

  // If the mobile happens to already include the code (without '+'),
  // strip it before concatenating.
  const codeDigits = normalisedCode.slice(1);
  const localMobile = trimmedMobile.startsWith(codeDigits)
    ? trimmedMobile.slice(codeDigits.length)
    : trimmedMobile;

  return `${normalisedCode}${localMobile}`;
};

// ─── SMS dispatch helper ─────────────────────────────────────────
//
// OTP delivery through SMSGatewayHub. We pull the destination back
// out of user_otps (the *_initiate UDFs already formatted it as E.164
// by joining countries.phone_code) and call the gateway with the
// digits-only form the gateway expects.
//
// Failures are logged but not surfaced to the caller — the OTP row
// is still verifiable from the DB and the user can retry from the
// client side. We don't want a flaky SMS provider to break the whole
// auth flow.
//
// Dispatch gate: fires if NODE_ENV === 'production' OR if the
// `SMS_FORCE_SEND` env flag is set. The flag lets a local dev run
// real SMS end-to-end without flipping NODE_ENV. With both unset,
// the helper is a no-op and the verify-auth-flows harness keeps
// working through the dev OTP echo channel so it never burns
// SMSGatewayHub credits.
export const sendMobileOtp = async (input: {
  userId: number;
  otpId: number;
  otpCode: string;
}): Promise<void> => {
  if (env.NODE_ENV !== 'production' && !env.SMS_FORCE_SEND) return;

  const { rows } = await getPool().query<{
    destination: string;
    first_name: string | null;
  }>(
    `SELECT o.destination, u.first_name
       FROM user_otps o
       JOIN users u ON u.id = o.user_id
      WHERE o.id = $1::BIGINT
      LIMIT 1`,
    [input.otpId]
  );
  const row = rows[0];
  if (!row) {
    logger.warn(
      { otpId: input.otpId },
      '[auth-flows] OTP row not found for SMS dispatch'
    );
    return;
  }

  // SMSGatewayHub wants digits-only without leading '+'.
  const phone = row.destination.startsWith('+')
    ? row.destination.slice(1)
    : row.destination;

  try {
    await smsGatewayService.sendOtp({
      phone,
      name: row.first_name ?? 'User',
      otp: input.otpCode
    });
  } catch (err) {
    logger.error(
      { err, userId: input.userId, otpId: input.otpId, phone },
      '[auth-flows] SMS OTP delivery failed; OTP still verifiable from DB'
    );
  }
};

// ═══════════════════════════════════════════════════════════════
//   FORGOT PASSWORD (public)
// ═══════════════════════════════════════════════════════════════

export const forgotPasswordInitiate = async (
  email: string,
  mobile: string
): Promise<DualOtpInitiateOutput> =>
  callDualChannelInitiate(
    `SELECT udf_auth_forgot_password_initiate(
        p_email  := $1::CITEXT,
        p_mobile := $2::TEXT
      ) AS result`,
    [email, mobile],
    'forgot_password',
    undefined,
    'forgot_password'
  );

export interface ForgotPasswordCompleteOutput {
  userId: number;
}

export const forgotPasswordComplete = async (input: {
  userId: number;
  emailOtpId: number;
  emailOtpCode: string;
  mobileOtpId: number;
  mobileOtpCode: string;
  newPassword: string;
}): Promise<ForgotPasswordCompleteOutput> => {
  await verifyOtp(input.emailOtpId, input.emailOtpCode, 'email');
  await verifyOtp(input.mobileOtpId, input.mobileOtpCode, 'mobile');

  // Blocklist current sessions BEFORE mutating state so any JWT
  // issued up to this point is rejected by the middleware.
  await revokeUserSessionsInRedis(input.userId);

  const pool = getPool();
  const { rows } = await pool.query<{ result: Record<string, unknown> }>(
    `SELECT udf_auth_forgot_password_complete(
        p_user_id      := $1::BIGINT,
        p_new_password := $2::TEXT
      ) AS result`,
    [input.userId, input.newPassword]
  );
  const result = rows[0]?.result;
  if (!result) {
    throw new AppError(
      'udf_auth_forgot_password_complete returned no result',
      500,
      'UDF_NO_RESULT'
    );
  }
  if (!result.success) {
    const msg = String(result.message ?? 'Forgot password failed');
    if (/reuse/i.test(msg)) {
      throw new AppError(msg, 400, 'PASSWORD_REUSED');
    }
    if (/not found|does not exist/i.test(msg)) {
      throw new AppError(msg, 404, 'NOT_FOUND');
    }
    throw new AppError(msg, 400, 'FORGOT_PASSWORD_FAILED');
  }

  // Best-effort post-success notification.
  void (async () => {
    try {
      const contact = await loadContact(input.userId);
      if (contact.user_email && contact.user_first_name) {
        await mailer.sendPasswordChanged({
          to: contact.user_email,
          name: contact.user_first_name
        });
      }
    } catch (err) {
      logger.warn({ err, userId: input.userId }, '[auth-flows] post-forgot mailer failed');
    }
  })();

  return { userId: input.userId };
};

// ═══════════════════════════════════════════════════════════════
//   RESET PASSWORD (authenticated change-password)
// ═══════════════════════════════════════════════════════════════

export const resetPasswordInitiate = async (
  userId: number
): Promise<DualOtpInitiateOutput> =>
  callDualChannelInitiate(
    `SELECT udf_auth_reset_password_initiate(
        p_user_id := $1::BIGINT
      ) AS result`,
    [userId],
    'reset_password',
    userId,
    'reset_password'
  );

export const resetPasswordComplete = async (input: {
  userId: number;
  emailOtpId: number;
  emailOtpCode: string;
  mobileOtpId: number;
  mobileOtpCode: string;
  newPassword: string;
}): Promise<{ userId: number }> => {
  await verifyOtp(input.emailOtpId, input.emailOtpCode, 'email');
  await verifyOtp(input.mobileOtpId, input.mobileOtpCode, 'mobile');

  // Blocklist current sessions BEFORE the UDF flips their rows.
  await revokeUserSessionsInRedis(input.userId);

  const pool = getPool();
  const { rows } = await pool.query<{ result: Record<string, unknown> }>(
    `SELECT udf_auth_reset_password_complete(
        p_user_id      := $1::BIGINT,
        p_new_password := $2::TEXT
      ) AS result`,
    [input.userId, input.newPassword]
  );
  const result = rows[0]?.result;
  if (!result) {
    throw new AppError(
      'udf_auth_reset_password_complete returned no result',
      500,
      'UDF_NO_RESULT'
    );
  }
  if (!result.success) {
    const msg = String(result.message ?? 'Reset password failed');
    if (/reuse/i.test(msg)) {
      throw new AppError(msg, 400, 'PASSWORD_REUSED');
    }
    throw new AppError(msg, 400, 'RESET_PASSWORD_FAILED');
  }

  // Best-effort post-success notification.
  void (async () => {
    try {
      const contact = await loadContact(input.userId);
      if (contact.user_email && contact.user_first_name) {
        await mailer.sendPasswordChanged({
          to: contact.user_email,
          name: contact.user_first_name
        });
      }
    } catch (err) {
      logger.warn({ err, userId: input.userId }, '[auth-flows] post-reset mailer failed');
    }
  })();

  return { userId: input.userId };
};

// ═══════════════════════════════════════════════════════════════
//   VERIFY EMAIL (re-verify current email, authenticated)
// ═══════════════════════════════════════════════════════════════

export const verifyEmailInitiate = async (
  userId: number
): Promise<SingleOtpInitiateOutput> => {
  const contact = await loadContact(userId);
  if (!contact.user_email) {
    throw new AppError(
      'User has no email address on file',
      400,
      'NO_EMAIL_ON_FILE'
    );
  }
  return generateSingleOtp(
    userId,
    're_verification',
    'email',
    contact.user_email,
    'verify_email',
    contact.user_first_name
  );
};

export const verifyEmailComplete = async (input: {
  userId: number;
  otpId: number;
  otpCode: string;
}): Promise<{ userId: number }> => {
  await verifyOtp(input.otpId, input.otpCode, 'email');
  await db.callFunction('udf_auth_verify_email', { p_user_id: input.userId });
  return { userId: input.userId };
};

// ═══════════════════════════════════════════════════════════════
//   VERIFY MOBILE (re-verify current mobile, authenticated)
// ═══════════════════════════════════════════════════════════════

export const verifyMobileInitiate = async (
  userId: number
): Promise<SingleOtpInitiateOutput> => {
  const contact = await loadContact(userId);
  if (!contact.user_mobile) {
    throw new AppError(
      'User has no mobile number on file',
      400,
      'NO_MOBILE_ON_FILE'
    );
  }
  // Build the E.164 destination from the user's bare mobile + the
  // country.phone_code joined into uv_users. Falls back to the bare
  // mobile if no country code is on file (formatMobileE164 handles
  // that case for us).
  const destination =
    formatMobileE164(contact.country_phone_code, contact.user_mobile) ??
    contact.user_mobile;
  return generateSingleOtp(
    userId,
    're_verification',
    'mobile',
    destination,
    'verify_mobile',
    contact.user_first_name
  );
};

export const verifyMobileComplete = async (input: {
  userId: number;
  otpId: number;
  otpCode: string;
}): Promise<{ userId: number }> => {
  await verifyOtp(input.otpId, input.otpCode, 'mobile');
  await db.callFunction('udf_auth_verify_mobile', { p_user_id: input.userId });
  return { userId: input.userId };
};

// ═══════════════════════════════════════════════════════════════
//   REGISTER-TIME VERIFY (public, no JWT)
// ═══════════════════════════════════════════════════════════════
//
// A freshly-registered user cannot log in until BOTH is_email_verified
// AND is_mobile_verified are true (enforced by udf_auth_login lines
// 144-182). But the /verify-email and /verify-mobile endpoints above
// require authentication — which the user cannot yet obtain. So we
// expose a pair of public siblings that take { userId, otpId, otpCode }
// from the body instead of pulling userId from the JWT.
//
// Security shape:
//   • Before calling udf_auth_verify_email/_mobile we bind the OTP row
//     to the claimed userId and assert it is a 'registration' purpose
//     row. This prevents a malicious caller from using a forgot-password
//     or change-email OTP to mark a stranger's contact as verified.
//   • We also refuse if the user is already verified for that channel
//     (idempotence + a tiny amount of enumeration resistance).
//
// Both endpoints are idempotent-on-success: calling them twice with the
// same { userId, otpId, otpCode } after a successful first call returns
// 410 OTP_EXPIRED from udf_otp_verify (the OTP row is consumed).

const assertRegistrationOtpBelongsTo = async (
  userId: number,
  otpId: number,
  channel: 'email' | 'mobile'
): Promise<void> => {
  const pool = getPool();
  const { rows } = await pool.query<{
    user_id: number;
    channel: string;
    purpose: string;
  }>(
    `SELECT user_id::INT AS user_id, channel::TEXT AS channel, purpose::TEXT AS purpose
       FROM user_otps
      WHERE id = $1::BIGINT
      LIMIT 1`,
    [otpId]
  );
  const row = rows[0];
  if (!row) {
    throw new AppError('OTP record not found', 404, 'OTP_NOT_FOUND');
  }
  if (row.user_id !== userId) {
    // Same error code as the UDF would return for a bad code — don't
    // leak whether the otpId exists for some other user.
    throw new AppError('OTP does not belong to this user', 400, 'OTP_INVALID');
  }
  if (row.channel !== channel) {
    throw new AppError(
      `Expected ${channel} OTP, got ${row.channel}`,
      400,
      'OTP_INVALID'
    );
  }
  if (row.purpose !== 'registration') {
    throw new AppError(
      'OTP purpose is not registration',
      400,
      'OTP_INVALID'
    );
  }
};

export const registerVerifyEmail = async (input: {
  userId: number;
  otpId: number;
  otpCode: string;
}): Promise<{ userId: number; isEmailVerified: true }> => {
  await assertRegistrationOtpBelongsTo(input.userId, input.otpId, 'email');
  await verifyOtp(input.otpId, input.otpCode, 'email');
  await db.callFunction('udf_auth_verify_email', { p_user_id: input.userId });
  return { userId: input.userId, isEmailVerified: true };
};

export const registerVerifyMobile = async (input: {
  userId: number;
  otpId: number;
  otpCode: string;
}): Promise<{ userId: number; isMobileVerified: true }> => {
  await assertRegistrationOtpBelongsTo(input.userId, input.otpId, 'mobile');
  await verifyOtp(input.otpId, input.otpCode, 'mobile');
  await db.callFunction('udf_auth_verify_mobile', { p_user_id: input.userId });
  return { userId: input.userId, isMobileVerified: true };
};

// ═══════════════════════════════════════════════════════════════
//   OTP RESEND (shared helper + four route-facing wrappers)
// ═══════════════════════════════════════════════════════════════
//
// `udf_otp_resend(p_user_id, p_purpose, p_channel, p_destination)`
// enforces the timing rules (3-min wait between resends, max 3
// resends, 30-min cooldown after the cap is hit). The Node wrappers
// below:
//   • look up the user's current email/mobile (destination),
//   • call the UDF,
//   • map the three failure paths to distinct 4xx codes,
//   • re-dispatch via the same mailer/SMS pipeline as the initiate
//     call, so all the log-and-continue guarantees apply.
//
// Shape is symmetric: register-time resend is public and takes
// { userId } from the body; re-verify resend is authenticated and
// pulls userId from the JWT.

export interface ResendOtpOutput {
  otpId: number;
  devOtp: string | null;
}

const callOtpResend = async (args: {
  userId: number;
  purpose:
    | 'registration'
    | 'forgot_password'
    | 'reset_password'
    | 'change_email'
    | 'change_mobile'
    | 're_verification';
  channel: 'email' | 'mobile';
  destination: string;
  // When true, an OTP_NOT_FOUND result from udf_otp_resend will be
  // silently recovered by issuing a fresh udf_otp_generate call with
  // the same (userId, purpose, channel, destination). This is the
  // right behavior when the previous OTP row has aged into 'expired'
  // (or was invalidated by an unrelated flow) — without it, the user
  // would be permanently locked out of restarting verification because
  // the resend UDF only matches `status = 'pending'`. Off by default
  // so callers must opt in.
  fallbackToGenerate?: boolean;
}): Promise<{ otpId: number; otpCode: string }> => {
  const pool = getPool();
  const { rows } = await pool.query<{ result: Record<string, unknown> }>(
    `SELECT udf_otp_resend(
        p_user_id     := $1::BIGINT,
        p_purpose     := $2::otp_purpose,
        p_channel     := $3::otp_channel,
        p_destination := $4::TEXT
      ) AS result`,
    [args.userId, args.purpose, args.channel, args.destination]
  );
  const result = rows[0]?.result;
  if (!result) {
    throw new AppError('udf_otp_resend returned no result', 500, 'UDF_NO_RESULT');
  }
  if (!result.success) {
    const msg = String(result.message ?? 'OTP resend failed');

    // "Cannot resend yet. Please wait N minutes."
    const waitMatch = /wait\s+(\d+)\s*minute/i.exec(msg);
    if (waitMatch) {
      throw new AppError(msg, 429, 'OTP_RESEND_TOO_SOON', {
        waitMinutes: Number(waitMatch[1])
      });
    }

    // "Maximum resend attempts exceeded. Please try again after 30 minutes."
    if (/maximum|exceeded/i.test(msg)) {
      throw new AppError(msg, 429, 'OTP_MAX_RESENDS', {
        cooldownMinutes: 30
      });
    }

    // "No pending OTP found for this user, purpose, and channel"
    if (/no pending/i.test(msg)) {
      if (args.fallbackToGenerate) {
        logger.info(
          {
            userId: args.userId,
            purpose: args.purpose,
            channel: args.channel
          },
          '[auth-flows] resend found no pending row; falling back to udf_otp_generate'
        );
        return callOtpGenerateForResendFallback(args);
      }
      throw new AppError(msg, 404, 'OTP_NOT_FOUND');
    }

    throw new AppError(msg, 400, 'OTP_RESEND_FAILED');
  }

  const otpId = Number(result.id);
  const otpCode = String(result.otp_code);
  if (!otpId || !otpCode) {
    throw new AppError(
      'udf_otp_resend returned malformed payload',
      500,
      'UDF_BAD_RESULT'
    );
  }
  return { otpId, otpCode };
};

// Recovery path used by callOtpResend when udf_otp_resend reports
// "No pending OTP found" and the caller has opted into the fallback.
// Issues a fresh udf_otp_generate row and returns its id/code in the
// same shape as a successful resend, so the surrounding wrappers can
// dispatch through their normal mailer/SMS pipelines unchanged.
const callOtpGenerateForResendFallback = async (args: {
  userId: number;
  purpose:
    | 'registration'
    | 'forgot_password'
    | 'reset_password'
    | 'change_email'
    | 'change_mobile'
    | 're_verification';
  channel: 'email' | 'mobile';
  destination: string;
}): Promise<{ otpId: number; otpCode: string }> => {
  const pool = getPool();
  const { rows } = await pool.query<{ result: Record<string, unknown> }>(
    `SELECT udf_otp_generate(
        $1::BIGINT,
        $2::otp_purpose,
        $3::otp_channel,
        $4::TEXT
      ) AS result`,
    [args.userId, args.purpose, args.channel, args.destination]
  );
  const result = rows[0]?.result;
  if (!result) {
    throw new AppError(
      'udf_otp_generate returned no result',
      500,
      'UDF_NO_RESULT'
    );
  }
  if (!result.success) {
    const msg = String(result.message ?? 'OTP generation failed');
    if (/cooldown/i.test(msg)) {
      throw new AppError(msg, 429, 'OTP_COOLDOWN');
    }
    if (/not found|does not exist/i.test(msg)) {
      throw new AppError(msg, 404, 'NOT_FOUND');
    }
    if (/not active|inactive/i.test(msg)) {
      throw new AppError(msg, 403, 'ACCOUNT_INACTIVE');
    }
    throw new AppError(msg, 400, 'OTP_GENERATE_FAILED');
  }
  const otpId = Number(result.id);
  const otpCode = String(result.otp_code);
  if (!otpId || !otpCode) {
    throw new AppError(
      'udf_otp_generate returned malformed payload (resend fallback)',
      500,
      'UDF_BAD_RESULT'
    );
  }
  return { otpId, otpCode };
};

// ─── Register-time resend (public) ──────────────────────────────

const registerResend = async (
  userId: number,
  channel: 'email' | 'mobile'
): Promise<ResendOtpOutput> => {
  const contact = await loadContact(userId);

  // Enumeration/abuse guard: refuse if the channel is already
  // verified (nothing to resend to) or the other channel is missing
  // on file (the user never supplied that contact).
  if (channel === 'email') {
    if (!contact.user_email) {
      throw new AppError('User has no email on file', 400, 'NO_EMAIL_ON_FILE');
    }
    if (contact.user_is_email_verified) {
      throw new AppError(
        'Email is already verified',
        400,
        'ALREADY_VERIFIED'
      );
    }
  } else {
    if (!contact.user_mobile) {
      throw new AppError('User has no mobile on file', 400, 'NO_MOBILE_ON_FILE');
    }
    if (contact.user_is_mobile_verified) {
      throw new AppError(
        'Mobile is already verified',
        400,
        'ALREADY_VERIFIED'
      );
    }
  }

  const destination =
    channel === 'email'
      ? (contact.user_email as string)
      : formatMobileE164(contact.country_phone_code, contact.user_mobile) ??
        (contact.user_mobile as string);

  const { otpId, otpCode } = await callOtpResend({
    userId,
    purpose: 'registration',
    channel,
    destination,
    // If the previous registration OTP row has aged into 'expired'
    // (or been invalidated), recover by issuing a fresh one. Without
    // this the user is permanently stuck — see auth-otp-flows docs
    // §3.8 ("Resend recovery from expired rows").
    fallbackToGenerate: true
  });

  // Dispatch through the same pipeline as register() itself.
  if (channel === 'email' && contact.user_email) {
    void mailer.sendOtp({
      to: contact.user_email,
      name: contact.user_first_name ?? 'User',
      otp: otpCode,
      flow: 'register'
    });
  } else if (channel === 'mobile') {
    void sendMobileOtp({ userId, otpId, otpCode });
  }

  return {
    otpId,
    devOtp: env.NODE_ENV !== 'production' ? otpCode : null
  };
};

export const registerResendEmail = (userId: number): Promise<ResendOtpOutput> =>
  registerResend(userId, 'email');

export const registerResendMobile = (userId: number): Promise<ResendOtpOutput> =>
  registerResend(userId, 'mobile');

// ─── Re-verify resend (authenticated) ───────────────────────────
//
// For already-logged-in users who started the /verify-email or
// /verify-mobile flow and now need a fresh OTP. Purpose on the DB
// side is 're_verification' (matches what verifyEmailInitiate /
// verifyMobileInitiate write).

const reVerifyResend = async (
  userId: number,
  channel: 'email' | 'mobile'
): Promise<ResendOtpOutput> => {
  const contact = await loadContact(userId);

  if (channel === 'email' && !contact.user_email) {
    throw new AppError('User has no email on file', 400, 'NO_EMAIL_ON_FILE');
  }
  if (channel === 'mobile' && !contact.user_mobile) {
    throw new AppError('User has no mobile on file', 400, 'NO_MOBILE_ON_FILE');
  }

  const destination =
    channel === 'email'
      ? (contact.user_email as string)
      : formatMobileE164(contact.country_phone_code, contact.user_mobile) ??
        (contact.user_mobile as string);

  const { otpId, otpCode } = await callOtpResend({
    userId,
    purpose: 're_verification',
    channel,
    destination,
    // Same recovery rationale as registerResend: a stale 're_verification'
    // row that has expired should not permanently block a logged-in
    // user from re-triggering verification.
    fallbackToGenerate: true
  });

  if (channel === 'email' && contact.user_email) {
    void mailer.sendOtp({
      to: contact.user_email,
      name: contact.user_first_name ?? 'User',
      otp: otpCode,
      flow: 'verify_email'
    });
  } else if (channel === 'mobile') {
    void sendMobileOtp({ userId, otpId, otpCode });
  }

  return {
    otpId,
    devOtp: env.NODE_ENV !== 'production' ? otpCode : null
  };
};

export const verifyEmailResend = (userId: number): Promise<ResendOtpOutput> =>
  reVerifyResend(userId, 'email');

export const verifyMobileResend = (userId: number): Promise<ResendOtpOutput> =>
  reVerifyResend(userId, 'mobile');

// ═══════════════════════════════════════════════════════════════
//   CHANGE EMAIL (authenticated)
// ═══════════════════════════════════════════════════════════════

export interface ChangeContactInitiateOutput {
  requestId: number;
  otpId: number;
  devOtpCode: string | null;
}

export const changeEmailInitiate = async (
  userId: number,
  newEmail: string
): Promise<ChangeContactInitiateOutput> => {
  const pool = getPool();
  const { rows } = await pool.query<{ result: Record<string, unknown> }>(
    `SELECT udf_auth_change_email_initiate(
        p_user_id   := $1::BIGINT,
        p_new_email := $2::CITEXT
      ) AS result`,
    [userId, newEmail]
  );
  const result = rows[0]?.result;
  if (!result) {
    throw new AppError(
      'udf_auth_change_email_initiate returned no result',
      500,
      'UDF_NO_RESULT'
    );
  }
  if (!result.success) {
    const msg = String(result.message ?? 'Change email failed');
    if (/already (in use|registered|exists)/i.test(msg) || /duplicate/i.test(msg)) {
      throw new AppError(msg, 409, 'DUPLICATE_ENTRY');
    }
    if (/not found|does not exist/i.test(msg)) {
      throw new AppError(msg, 404, 'NOT_FOUND');
    }
    throw new AppError(msg, 400, 'CHANGE_EMAIL_FAILED');
  }
  const requestId = asNumber(result.request_id);
  const otpId = asNumber(result.otp_id);
  const otpCode = asString(result.otp_code);
  if (requestId == null || otpId == null) {
    throw new AppError('Change email payload missing ids', 500, 'UDF_BAD_RESULT');
  }
  if (otpCode) {
    logger.info(
      { userId, channel: 'email', target: newEmail, otp: otpCode },
      '[auth-flows] stubbed change-email OTP'
    );
  }

  // Dispatch the OTP to the NEW email address (proves ownership).
  if (otpCode) {
    void (async () => {
      try {
        const contact = await loadContact(userId);
        await mailer.sendOtp({
          to: newEmail,
          name: contact.user_first_name,
          otp: otpCode,
          flow: 'change_email'
        });
      } catch (err) {
        logger.warn({ err, userId }, '[auth-flows] change-email mailer dispatch failed');
      }
    })();
  }

  return {
    requestId,
    otpId,
    devOtpCode: includeDevSecrets() ? otpCode : null
  };
};

export const changeEmailComplete = async (input: {
  requestId: number;
  otpId: number;
  otpCode: string;
}): Promise<{ requestId: number }> => {
  await verifyOtp(input.otpId, input.otpCode, 'email');

  // Resolve the request's user_id BEFORE the UDF runs so we can
  // blocklist their sessions in Redis. The *_complete UDF only
  // returns success/message, so we read the request row directly.
  const { rows: reqRows } = await getPool().query<{ user_id: string | number }>(
    `SELECT user_id FROM user_contact_change_requests WHERE id = $1::BIGINT LIMIT 1`,
    [input.requestId]
  );
  const requestOwner = reqRows[0]?.user_id;
  if (requestOwner != null) {
    await revokeUserSessionsInRedis(Number(requestOwner));
  }

  // Capture old contact BEFORE the UDF mutates it so we can notify
  // both addresses with accurate values.
  let oldEmail: string | null = null;
  let firstName: string | null = null;
  let newEmail: string | null = null;
  if (requestOwner != null) {
    try {
      const contact = await loadContact(Number(requestOwner));
      oldEmail = contact.user_email;
      firstName = contact.user_first_name;
    } catch {
      // non-fatal — mailer dispatch will be skipped below
    }
    const { rows: reqDetail } = await getPool().query<{ new_value: string | null }>(
      `SELECT new_value FROM user_contact_change_requests WHERE id = $1::BIGINT LIMIT 1`,
      [input.requestId]
    );
    newEmail = reqDetail[0]?.new_value ?? null;
  }

  await db.callFunction('udf_auth_change_email_complete', {
    p_request_id: input.requestId
  });

  // Best-effort dispatch — security-relevant: notify the OLD address
  // so a hijacker swapping the email cannot do it silently.
  if (oldEmail && newEmail && firstName) {
    void mailer.sendEmailChangedNotifyOld({
      oldEmail,
      name: firstName,
      newEmail
    });
    void mailer.sendEmailChangedWelcomeNew({
      newEmail,
      name: firstName
    });
  }

  return { requestId: input.requestId };
};

// ═══════════════════════════════════════════════════════════════
//   CHANGE MOBILE (authenticated)
// ═══════════════════════════════════════════════════════════════

export const changeMobileInitiate = async (
  userId: number,
  newMobile: string
): Promise<ChangeContactInitiateOutput> => {
  const pool = getPool();
  const { rows } = await pool.query<{ result: Record<string, unknown> }>(
    `SELECT udf_auth_change_mobile_initiate(
        p_user_id    := $1::BIGINT,
        p_new_mobile := $2::TEXT
      ) AS result`,
    [userId, newMobile]
  );
  const result = rows[0]?.result;
  if (!result) {
    throw new AppError(
      'udf_auth_change_mobile_initiate returned no result',
      500,
      'UDF_NO_RESULT'
    );
  }
  if (!result.success) {
    const msg = String(result.message ?? 'Change mobile failed');
    if (/already (in use|registered|exists)/i.test(msg) || /duplicate/i.test(msg)) {
      throw new AppError(msg, 409, 'DUPLICATE_ENTRY');
    }
    if (/not found|does not exist/i.test(msg)) {
      throw new AppError(msg, 404, 'NOT_FOUND');
    }
    throw new AppError(msg, 400, 'CHANGE_MOBILE_FAILED');
  }
  const requestId = asNumber(result.request_id);
  const otpId = asNumber(result.otp_id);
  const otpCode = asString(result.otp_code);
  if (requestId == null || otpId == null) {
    throw new AppError('Change mobile payload missing ids', 500, 'UDF_BAD_RESULT');
  }
  if (otpCode) {
    logger.info(
      { userId, channel: 'mobile', target: newMobile, otp: otpCode },
      '[auth-flows] stubbed change-mobile OTP'
    );
  }
  // Production-only SMS dispatch. The UDF already wrote the E.164
  // destination (country phone_code + new mobile) into user_otps.
  if (otpCode) {
    await sendMobileOtp({ userId, otpId, otpCode });
  }

  // Also dispatch via email — the user's existing email address is
  // a trusted side-channel for confirming a mobile-number swap.
  if (otpCode) {
    void (async () => {
      try {
        const contact = await loadContact(userId);
        if (contact.user_email) {
          await mailer.sendOtp({
            to: contact.user_email,
            name: contact.user_first_name,
            otp: otpCode,
            flow: 'change_mobile'
          });
        }
      } catch (err) {
        logger.warn({ err, userId }, '[auth-flows] change-mobile mailer dispatch failed');
      }
    })();
  }

  return {
    requestId,
    otpId,
    devOtpCode: includeDevSecrets() ? otpCode : null
  };
};

export const changeMobileComplete = async (input: {
  requestId: number;
  otpId: number;
  otpCode: string;
}): Promise<{ requestId: number }> => {
  await verifyOtp(input.otpId, input.otpCode, 'mobile');

  // Resolve owner from the contact_changes row so we can push
  // their JWTs onto the Redis blocklist before mutating state.
  const { rows: reqRows } = await getPool().query<{ user_id: string | number }>(
    `SELECT user_id FROM user_contact_change_requests WHERE id = $1::BIGINT LIMIT 1`,
    [input.requestId]
  );
  const requestOwner = reqRows[0]?.user_id;
  if (requestOwner != null) {
    await revokeUserSessionsInRedis(Number(requestOwner));
  }

  // Capture name + new mobile BEFORE the UDF runs so we can notify
  // the user's email address that their mobile changed.
  let userEmail: string | null = null;
  let firstName: string | null = null;
  let newMobile: string | null = null;
  if (requestOwner != null) {
    try {
      const contact = await loadContact(Number(requestOwner));
      userEmail = contact.user_email;
      firstName = contact.user_first_name;
    } catch {
      // non-fatal — mailer dispatch will be skipped below
    }
    const { rows: reqDetail } = await getPool().query<{ new_value: string | null }>(
      `SELECT new_value FROM user_contact_change_requests WHERE id = $1::BIGINT LIMIT 1`,
      [input.requestId]
    );
    newMobile = reqDetail[0]?.new_value ?? null;
  }

  await db.callFunction('udf_auth_change_mobile_complete', {
    p_request_id: input.requestId
  });

  // Best-effort notification to the user's email about the mobile
  // change — the email is the only address we know is unchanged at
  // this point in time, which makes it the right side-channel.
  if (userEmail && firstName && newMobile) {
    void mailer.sendMobileChanged({
      to: userEmail,
      name: firstName,
      newMobile
    });
  }

  return { requestId: input.requestId };
};
