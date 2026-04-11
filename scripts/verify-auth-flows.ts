/* eslint-disable no-console */
/**
 * Step 11 — Auth flows (live, end-to-end).
 *
 * Drives every secondary auth flow added in Step 11 against the
 * real Express app on an ephemeral port, talking to live Supabase
 * + Upstash. Nothing is mocked.
 *
 * Sections:
 *   0. Setup        — register harness (super_admin) + subject
 *                     (student), verify both, log in.
 *   1. Auth gates   — anon access to authenticated flows → 401;
 *                     forgot-password is public.
 *   2. Verify email — re-verification flow drops + restores the
 *                     is_email_verified flag for the subject.
 *   3. Verify mobile— same shape, mobile channel.
 *   4. Reset pass'd — authenticated change-password flow rotates
 *                     the password and revokes sessions.
 *   5. Forgot pass'd— public dual-channel recovery flow rotates
 *                     the password again and revokes sessions.
 *   6. Change email — moves the subject to a fresh email; old
 *                     login fails, new login works.
 *   7. Change mobile— same shape, mobile channel.
 *   8. Admin ops    — super_admin issues change-role, set-
 *                     verification, deactivate against the subject.
 *   9. Validation   — bad OTP, weak password, missing fields, etc.
 *  10. Cleanup      — hard-delete the subject, soft-delete the
 *                     harness, drop redis revoked entries.
 */

import type { AddressInfo } from 'node:net';

import { buildApp } from '../src/app';
import { closePool, getPool } from '../src/database/pg-pool';
import { closeRedis, redisRevoked } from '../src/database/redis';
import { verifyAccessToken } from '../src/core/auth/jwt';

// ─────────────────────────────────────────────────────────────
// Reporter
// ─────────────────────────────────────────────────────────────

type Check = { section: string; name: string; ok: boolean; detail: string };
const results: Check[] = [];
const record = (
  section: string,
  name: string,
  ok: boolean,
  detail: string
): void => {
  results.push({ section, name, ok, detail });
  const mark = ok ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✖\x1b[0m';
  console.log(`  ${mark}  ${name.padEnd(64)} ${detail}`);
};
const header = (title: string): void => {
  console.log(`\n\x1b[36m━━ ${title} ━━\x1b[0m`);
};

// ─────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────

const RUN_ID = `${process.pid}-${Date.now()}`;
// 9 trailing digits keeps us under the +91 + 10-digit Indian
// mobile shape and inside our mobileSchema regex (≤ 20 chars).
const RAND9 = (Math.floor(Math.random() * 1e9) + 1e9).toString().slice(1);

const HARNESS_EMAIL = `verify-flows-h+${RUN_ID}@test.growupmore.local`;
const HARNESS_MOBILE = `+91990${RAND9}`.slice(0, 14);
const HARNESS_PASSWORD = 'VerifyFlows123';
const HARNESS_FIRST = 'VerifyFlows';
const HARNESS_LAST = `Harness${process.pid}`;

const SUBJECT_EMAIL = `verify-flows-s+${RUN_ID}@test.growupmore.local`;
const SUBJECT_MOBILE = `+91991${RAND9}`.slice(0, 14);
const SUBJECT_PASSWORD = 'SubjectPass123';
const SUBJECT_FIRST = 'Subject';
const SUBJECT_LAST = `Run${process.pid}`;

// New password used by reset-password flow.
const SUBJECT_PASSWORD_2 = 'SubjectPassNEW2';
// Password applied by forgot-password flow (must not collide with
// the prior two — udf_password_history_check rejects last 5).
const SUBJECT_PASSWORD_3 = 'SubjectPassNEW3';

// New email + mobile used by the change-email / change-mobile flows.
const SUBJECT_EMAIL_2 = `verify-flows-s2+${RUN_ID}@test.growupmore.local`;
const SUBJECT_MOBILE_2 = `+91992${RAND9}`.slice(0, 14);

let harnessUserId: number | null = null;
let subjectUserId: number | null = null;
let harnessAccessToken = '';
let subjectAccessToken = '';
const collectedJtis = new Set<string>();

// Track the current "logged-in" identifier + password for the
// subject so re-login helpers don't need a million parameters.
let currentSubjectIdentifier = SUBJECT_EMAIL;
let currentSubjectPassword = SUBJECT_PASSWORD;

// ─────────────────────────────────────────────────────────────
// HTTP helper
// ─────────────────────────────────────────────────────────────

interface HttpResult<T = unknown> {
  status: number;
  body: T;
}

const mkClient = (baseUrl: string) => {
  return async <T = unknown>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    options: { body?: unknown; token?: string } = {}
  ): Promise<HttpResult<T>> => {
    const headers: Record<string, string> = {
      'content-type': 'application/json'
    };
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });
    const status = res.status;
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status, body: body as T };
  };
};

// ─────────────────────────────────────────────────────────────
// Setup helpers
// ─────────────────────────────────────────────────────────────

const elevateToSuperAdmin = async (userId: number): Promise<void> => {
  await getPool().query(
    `UPDATE users
        SET role_id = (
              SELECT id FROM roles
              WHERE level = 0 AND is_deleted = FALSE AND is_active = TRUE
              LIMIT 1
            ),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [userId]
  );
};

const verifyContactsInDb = async (userId: number): Promise<void> => {
  await getPool().query(
    `UPDATE users
        SET is_email_verified  = TRUE,
            email_verified_at  = CURRENT_TIMESTAMP,
            is_mobile_verified = TRUE,
            mobile_verified_at = CURRENT_TIMESTAMP,
            updated_at         = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [userId]
  );
};

const reactivateUser = async (userId: number): Promise<void> => {
  await getPool().query(
    `UPDATE users
        SET is_active = TRUE,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [userId]
  );
};

// ─────────────────────────────────────────────────────────────
// Cleanup helpers
// ─────────────────────────────────────────────────────────────

const hardDeleteUser = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM user_permissions WHERE user_id = $1', [id]);
  await getPool().query('DELETE FROM user_otps WHERE user_id = $1', [id]);
  await getPool().query('DELETE FROM user_sessions WHERE user_id = $1', [id]);
  await getPool().query('DELETE FROM password_history WHERE user_id = $1', [id]);
  await getPool().query('DELETE FROM login_attempts WHERE user_id = $1', [id]);
  await getPool().query(
    'DELETE FROM user_contact_change_requests WHERE user_id = $1',
    [id]
  );
  await getPool().query('DELETE FROM users WHERE id = $1', [id]);
};

const softDeleteUser = async (id: number): Promise<void> => {
  await getPool().query(
    `UPDATE users
        SET is_deleted = TRUE,
            is_active  = FALSE,
            deleted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [id]
  );
};

// ─────────────────────────────────────────────────────────────
// Re-login helper for the subject (after a session-revoking flow)
// ─────────────────────────────────────────────────────────────

const reloginSubject = async (
  http: ReturnType<typeof mkClient>
): Promise<boolean> => {
  const res = await http<{
    data?: { accessToken?: string };
  }>('POST', '/api/v1/auth/login', {
    body: {
      identifier: currentSubjectIdentifier,
      password: currentSubjectPassword
    }
  });
  if (res.status !== 200 || !res.body?.data?.accessToken) return false;
  subjectAccessToken = res.body.data.accessToken;
  try {
    const jti = verifyAccessToken(subjectAccessToken).jti;
    if (jti) collectedJtis.add(jti);
  } catch {
    /* ignore */
  }
  return true;
};

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

interface InitiateDualBody {
  data?: {
    userId?: number;
    emailOtpId?: number;
    mobileOtpId?: number;
    devEmailOtp?: string;
    devMobileOtp?: string;
  };
}

interface InitiateSingleBody {
  data?: {
    otpId?: number;
    devOtpCode?: string;
    requestId?: number;
  };
}

const main = async (): Promise<void> => {
  console.log('━━ Step 11 · Auth flows (live) ━━');
  console.log(`  harness email   : ${HARNESS_EMAIL}`);
  console.log(`  subject email   : ${SUBJECT_EMAIL}`);
  console.log(`  subject mobile  : ${SUBJECT_MOBILE}`);

  const app = buildApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.on('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const http = mkClient(baseUrl);

  try {
    // ─── 0. Setup ───────────────────────────────────────
    header('0. Setup — register harness + subject');
    {
      // Register harness (super_admin-to-be)
      const reg = await http<{ data?: { userId: number } }>(
        'POST',
        '/api/v1/auth/register',
        {
          body: {
            firstName: HARNESS_FIRST,
            lastName: HARNESS_LAST,
            email: HARNESS_EMAIL,
            mobile: HARNESS_MOBILE,
            password: HARNESS_PASSWORD,
            roleCode: 'student'
          }
        }
      );
      record(
        '0',
        'register harness user',
        reg.status === 201 && typeof reg.body?.data?.userId === 'number',
        `status=${reg.status}`
      );
      const hUid = reg.body?.data?.userId;
      if (typeof hUid !== 'number') {
        throw new Error('cannot proceed without harness user');
      }
      harnessUserId = hUid;
      await verifyContactsInDb(hUid);
      await elevateToSuperAdmin(hUid);

      const hLogin = await http<{ data?: { accessToken?: string } }>(
        'POST',
        '/api/v1/auth/login',
        {
          body: {
            identifier: HARNESS_EMAIL,
            password: HARNESS_PASSWORD
          }
        }
      );
      record(
        '0',
        'harness login → 200 + token',
        hLogin.status === 200 && !!hLogin.body?.data?.accessToken,
        `status=${hLogin.status}`
      );
      harnessAccessToken = hLogin.body?.data?.accessToken ?? '';
      try {
        const jti = verifyAccessToken(harnessAccessToken).jti;
        if (jti) collectedJtis.add(jti);
      } catch {
        /* ignore */
      }

      // Register subject (student)
      const sReg = await http<{ data?: { userId: number } }>(
        'POST',
        '/api/v1/auth/register',
        {
          body: {
            firstName: SUBJECT_FIRST,
            lastName: SUBJECT_LAST,
            email: SUBJECT_EMAIL,
            mobile: SUBJECT_MOBILE,
            password: SUBJECT_PASSWORD,
            roleCode: 'student'
          }
        }
      );
      record(
        '0',
        'register subject user',
        sReg.status === 201 && typeof sReg.body?.data?.userId === 'number',
        `status=${sReg.status}`
      );
      const sUid = sReg.body?.data?.userId;
      if (typeof sUid !== 'number') {
        throw new Error('cannot proceed without subject user');
      }
      subjectUserId = sUid;
      await verifyContactsInDb(sUid);

      const sLogin = await http<{ data?: { accessToken?: string } }>(
        'POST',
        '/api/v1/auth/login',
        {
          body: { identifier: SUBJECT_EMAIL, password: SUBJECT_PASSWORD }
        }
      );
      record(
        '0',
        'subject login → 200 + token',
        sLogin.status === 200 && !!sLogin.body?.data?.accessToken,
        `status=${sLogin.status}`
      );
      subjectAccessToken = sLogin.body?.data?.accessToken ?? '';
      currentSubjectIdentifier = SUBJECT_EMAIL;
      currentSubjectPassword = SUBJECT_PASSWORD;
      try {
        const jti = verifyAccessToken(subjectAccessToken).jti;
        if (jti) collectedJtis.add(jti);
      } catch {
        /* ignore */
      }
    }

    // ─── 0.5 Register-verification gate ──────────────────
    //
    // Register a brand-new user WITHOUT the verifyContactsInDb
    // bypass, then walk through the actual user-facing path:
    //   1. POST /auth/login          → 403 ACCOUNT_NOT_VERIFIED
    //                                   with unverifiedChannels
    //                                   = ["email","mobile"]
    //   2. POST /auth/register/verify-email  (public)
    //   3. POST /auth/login          → still 403 (mobile unverified)
    //                                   unverifiedChannels=["mobile"]
    //   4. POST /auth/register/verify-mobile (public)
    //   5. POST /auth/login          → 200 + tokens
    //
    // Also covers OTP_INVALID tamper paths so the security shape
    // of the public routes is exercised end-to-end.
    header('0.5 Register-verification gate — dual-channel path');
    {
      const GATE_EMAIL = `verify-flows-g+${RUN_ID}@test.growupmore.local`;
      const GATE_MOBILE = `+91993${RAND9}`.slice(0, 14);
      const GATE_PASSWORD = 'GatePass2026';
      const GATE_FIRST = 'Gate';
      const GATE_LAST = `Run${process.pid}`;

      const reg = await http<{
        data?: {
          userId: number;
          emailOtpId: number;
          mobileOtpId: number;
          devEmailOtp?: string;
          devMobileOtp?: string;
        };
      }>('POST', '/api/v1/auth/register', {
        body: {
          firstName: GATE_FIRST,
          lastName: GATE_LAST,
          email: GATE_EMAIL,
          mobile: GATE_MOBILE,
          password: GATE_PASSWORD,
          roleCode: 'student'
        }
      });
      record(
        '0.5',
        'register gate user → 201',
        reg.status === 201 && typeof reg.body?.data?.userId === 'number',
        `status=${reg.status}`
      );
      const gateData = reg.body?.data;
      const gateUserId = gateData?.userId ?? 0;
      const gateEmailOtpId = gateData?.emailOtpId ?? 0;
      const gateMobileOtpId = gateData?.mobileOtpId ?? 0;
      const gateEmailOtp = gateData?.devEmailOtp ?? '';
      const gateMobileOtp = gateData?.devMobileOtp ?? '';

      record(
        '0.5',
        'register response carries emailOtpId + mobileOtpId',
        gateEmailOtpId > 0 && gateMobileOtpId > 0,
        `emailOtpId=${gateEmailOtpId} mobileOtpId=${gateMobileOtpId}`
      );
      record(
        '0.5',
        'register response carries devEmailOtp + devMobileOtp (dev mode)',
        /^[0-9]{4,8}$/.test(gateEmailOtp) && /^[0-9]{4,8}$/.test(gateMobileOtp),
        `emailOtp=${gateEmailOtp || '(empty)'} mobileOtp=${gateMobileOtp || '(empty)'}`
      );

      // Attempt 1: login before any verification → 403 with both channels
      const l1 = await http<{
        code?: string;
        details?: { userId?: number; unverifiedChannels?: string[]; failureReason?: string };
      }>('POST', '/api/v1/auth/login', {
        body: { identifier: GATE_EMAIL, password: GATE_PASSWORD }
      });
      record(
        '0.5',
        'login (no verify) → 403 ACCOUNT_NOT_VERIFIED',
        l1.status === 403 && l1.body?.code === 'ACCOUNT_NOT_VERIFIED',
        `status=${l1.status} code=${l1.body?.code}`
      );
      const l1Channels = l1.body?.details?.unverifiedChannels ?? [];
      record(
        '0.5',
        'login 403 details.unverifiedChannels = ["email","mobile"]',
        l1Channels.length === 2 &&
          l1Channels.includes('email') &&
          l1Channels.includes('mobile'),
        `channels=${JSON.stringify(l1Channels)}`
      );
      record(
        '0.5',
        'login 403 details.failureReason = both_not_verified',
        l1.body?.details?.failureReason === 'both_not_verified',
        `reason=${l1.body?.details?.failureReason}`
      );
      record(
        '0.5',
        'login 403 details.userId echoes registered id',
        l1.body?.details?.userId === gateUserId,
        `got=${l1.body?.details?.userId} expected=${gateUserId}`
      );

      // Tamper path 1: /register/verify-email with the mobile OTP id
      //                → 400 OTP_INVALID (wrong channel).
      const vBadChannel = await http<{ code?: string }>(
        'POST',
        '/api/v1/auth/register/verify-email',
        {
          body: {
            userId: gateUserId,
            otpId: gateMobileOtpId,
            otpCode: gateMobileOtp
          }
        }
      );
      record(
        '0.5',
        'verify-email with mobile otpId → 400 OTP_INVALID',
        vBadChannel.status === 400 && vBadChannel.body?.code === 'OTP_INVALID',
        `status=${vBadChannel.status} code=${vBadChannel.body?.code}`
      );

      // Tamper path 2: /register/verify-email with a different user id
      //                → 400 OTP_INVALID (row does not belong).
      const vBadUser = await http<{ code?: string }>(
        'POST',
        '/api/v1/auth/register/verify-email',
        {
          body: {
            userId: gateUserId + 999999,
            otpId: gateEmailOtpId,
            otpCode: gateEmailOtp
          }
        }
      );
      record(
        '0.5',
        'verify-email with wrong userId → 400 OTP_INVALID',
        vBadUser.status === 400 && vBadUser.body?.code === 'OTP_INVALID',
        `status=${vBadUser.status} code=${vBadUser.body?.code}`
      );

      // Happy path: verify email
      const vEmail = await http<{
        data?: { userId?: number; isEmailVerified?: boolean };
      }>('POST', '/api/v1/auth/register/verify-email', {
        body: {
          userId: gateUserId,
          otpId: gateEmailOtpId,
          otpCode: gateEmailOtp
        }
      });
      record(
        '0.5',
        'verify-email happy path → 200 + isEmailVerified=true',
        vEmail.status === 200 && vEmail.body?.data?.isEmailVerified === true,
        `status=${vEmail.status}`
      );

      // Attempt 2: login with email verified, mobile still not
      //            → 403 but unverifiedChannels=["mobile"] only.
      const l2 = await http<{
        code?: string;
        details?: { unverifiedChannels?: string[]; failureReason?: string };
      }>('POST', '/api/v1/auth/login', {
        body: { identifier: GATE_EMAIL, password: GATE_PASSWORD }
      });
      record(
        '0.5',
        'login (email-only verified) → 403 ACCOUNT_NOT_VERIFIED',
        l2.status === 403 && l2.body?.code === 'ACCOUNT_NOT_VERIFIED',
        `status=${l2.status} code=${l2.body?.code}`
      );
      const l2Channels = l2.body?.details?.unverifiedChannels ?? [];
      record(
        '0.5',
        'login 403 details.unverifiedChannels = ["mobile"]',
        l2Channels.length === 1 && l2Channels[0] === 'mobile',
        `channels=${JSON.stringify(l2Channels)}`
      );
      record(
        '0.5',
        'login 403 details.failureReason = mobile_not_verified',
        l2.body?.details?.failureReason === 'mobile_not_verified',
        `reason=${l2.body?.details?.failureReason}`
      );

      // Happy path: verify mobile
      const vMobile = await http<{
        data?: { userId?: number; isMobileVerified?: boolean };
      }>('POST', '/api/v1/auth/register/verify-mobile', {
        body: {
          userId: gateUserId,
          otpId: gateMobileOtpId,
          otpCode: gateMobileOtp
        }
      });
      record(
        '0.5',
        'verify-mobile happy path → 200 + isMobileVerified=true',
        vMobile.status === 200 && vMobile.body?.data?.isMobileVerified === true,
        `status=${vMobile.status}`
      );

      // Attempt 3: login with BOTH verified → 200 + token.
      const l3 = await http<{
        data?: {
          accessToken?: string;
          user?: {
            id?: number;
            email?: string;
            firstName?: string | null;
            lastName?: string | null;
            roles?: string[];
          };
        };
      }>('POST', '/api/v1/auth/login', {
        body: { identifier: GATE_EMAIL, password: GATE_PASSWORD }
      });
      record(
        '0.5',
        'login (both verified) → 200 + accessToken',
        l3.status === 200 && !!l3.body?.data?.accessToken,
        `status=${l3.status}`
      );

      // firstName/lastName must be populated on the login response —
      // udf_auth_login was enriched to return them so the Node layer
      // no longer hard-codes null. Before this fix both were always
      // null and clients had to hit /auth/me for display names.
      record(
        '0.5',
        `login response user.firstName === "${GATE_FIRST}"`,
        l3.body?.data?.user?.firstName === GATE_FIRST,
        `got=${l3.body?.data?.user?.firstName}`
      );
      record(
        '0.5',
        `login response user.lastName === "${GATE_LAST}"`,
        l3.body?.data?.user?.lastName === GATE_LAST,
        `got=${l3.body?.data?.user?.lastName}`
      );

      // Cleanup: hard-delete the gate user so re-runs are idempotent
      // and section 10 cleanup doesn't need to know about this user.
      if (gateUserId > 0) {
        await getPool().query('DELETE FROM users WHERE id = $1', [gateUserId]);
      }
    }

    // ─── 0.6 Register resend routes ─────────────────────
    //
    // Fresh user so we don't race the 0.5 cleanup.
    //
    //   1. register → OTP rows created with resend_available_at = +3m
    //   2. resend-email immediately → 429 OTP_RESEND_TOO_SOON
    //   3. push resend_available_at back into the past
    //   4. resend-email → 200 + new otpId + new devOtp
    //   5. verify-email (with the resent OTP) → 200
    //   6. resend-email again after verified → 400 ALREADY_VERIFIED
    //   7. resend-mobile happy path (advance clock, no too-soon repeat)
    header('0.6 Register resend routes — public');
    {
      const RESEND_EMAIL = `verify-flows-r+${RUN_ID}@test.growupmore.local`;
      const RESEND_MOBILE = `+91994${RAND9}`.slice(0, 14);
      const RESEND_PASSWORD = 'ResendPass2026';

      const reg = await http<{
        data?: {
          userId: number;
          emailOtpId: number;
          mobileOtpId: number;
          devEmailOtp?: string;
          devMobileOtp?: string;
        };
      }>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'Resend',
          lastName: `Run${process.pid}`,
          email: RESEND_EMAIL,
          mobile: RESEND_MOBILE,
          password: RESEND_PASSWORD,
          roleCode: 'student'
        }
      });
      record(
        '0.6',
        'register resend-test user → 201',
        reg.status === 201 && typeof reg.body?.data?.userId === 'number',
        `status=${reg.status}`
      );

      const userId = reg.body?.data?.userId ?? 0;
      const origEmailOtpId = reg.body?.data?.emailOtpId ?? 0;
      const origMobileOtpId = reg.body?.data?.mobileOtpId ?? 0;

      // 1) Immediate resend → 429 OTP_RESEND_TOO_SOON.
      const tooSoon = await http<{
        code?: string;
        details?: { waitMinutes?: number };
      }>('POST', '/api/v1/auth/register/resend-email', {
        body: { userId }
      });
      record(
        '0.6',
        'resend-email immediately → 429 OTP_RESEND_TOO_SOON',
        tooSoon.status === 429 && tooSoon.body?.code === 'OTP_RESEND_TOO_SOON',
        `status=${tooSoon.status} code=${tooSoon.body?.code}`
      );
      record(
        '0.6',
        'resend-email 429 details.waitMinutes is a positive number',
        typeof tooSoon.body?.details?.waitMinutes === 'number' &&
          (tooSoon.body?.details?.waitMinutes ?? 0) > 0,
        `waitMinutes=${tooSoon.body?.details?.waitMinutes}`
      );

      // 2) Push the email OTP's resend_available_at into the past so
      //    the next call succeeds. This is the same trick the resend
      //    UDF's own test block uses (see 06_fn_resend.sql comments).
      if (origEmailOtpId > 0) {
        await getPool().query(
          `UPDATE user_otps
              SET resend_available_at = CURRENT_TIMESTAMP - INTERVAL '1 minute'
            WHERE id = $1`,
          [origEmailOtpId]
        );
      }

      const okEmail = await http<{
        data?: { otpId: number; devOtp: string };
      }>('POST', '/api/v1/auth/register/resend-email', {
        body: { userId }
      });
      record(
        '0.6',
        'resend-email after advancing clock → 200',
        okEmail.status === 200 && typeof okEmail.body?.data?.otpId === 'number',
        `status=${okEmail.status}`
      );
      record(
        '0.6',
        'resend-email returns a fresh 6-digit devOtp',
        /^[0-9]{4,8}$/.test(okEmail.body?.data?.devOtp ?? ''),
        `devOtp=${okEmail.body?.data?.devOtp ?? '(empty)'}`
      );
      record(
        '0.6',
        'resend-email returns a new otpId (supersedes original)',
        (okEmail.body?.data?.otpId ?? 0) > 0 &&
          okEmail.body?.data?.otpId !== origEmailOtpId,
        `orig=${origEmailOtpId} new=${okEmail.body?.data?.otpId}`
      );

      const newEmailOtpId = okEmail.body?.data?.otpId ?? 0;
      const newEmailOtp = okEmail.body?.data?.devOtp ?? '';

      // 3) The original email OTP row must now be 'invalidated' so it
      //    can't be verified against — the UDF side-effect we rely on.
      if (origEmailOtpId > 0) {
        const { rows } = await getPool().query<{ status: string }>(
          'SELECT status FROM user_otps WHERE id = $1',
          [origEmailOtpId]
        );
        record(
          '0.6',
          'original email OTP row is invalidated after resend',
          rows[0]?.status === 'invalidated',
          `status=${rows[0]?.status}`
        );
      }

      // 4) Happy path: verify-email using the resent OTP.
      const vEmail = await http<{
        data?: { isEmailVerified?: boolean };
      }>('POST', '/api/v1/auth/register/verify-email', {
        body: { userId, otpId: newEmailOtpId, otpCode: newEmailOtp }
      });
      record(
        '0.6',
        'verify-email with resent OTP → 200 + isEmailVerified=true',
        vEmail.status === 200 && vEmail.body?.data?.isEmailVerified === true,
        `status=${vEmail.status}`
      );

      // 5) After email is verified, resend-email must refuse with
      //    400 ALREADY_VERIFIED (nothing to resend).
      const already = await http<{ code?: string }>(
        'POST',
        '/api/v1/auth/register/resend-email',
        { body: { userId } }
      );
      record(
        '0.6',
        'resend-email after verified → 400 ALREADY_VERIFIED',
        already.status === 400 && already.body?.code === 'ALREADY_VERIFIED',
        `status=${already.status} code=${already.body?.code}`
      );

      // 6) Mobile resend happy path (advance clock, then resend).
      if (origMobileOtpId > 0) {
        await getPool().query(
          `UPDATE user_otps
              SET resend_available_at = CURRENT_TIMESTAMP - INTERVAL '1 minute'
            WHERE id = $1`,
          [origMobileOtpId]
        );
      }
      const okMobile = await http<{
        data?: { otpId: number; devOtp: string };
      }>('POST', '/api/v1/auth/register/resend-mobile', {
        body: { userId }
      });
      record(
        '0.6',
        'resend-mobile after advancing clock → 200',
        okMobile.status === 200 &&
          typeof okMobile.body?.data?.otpId === 'number' &&
          /^[0-9]{4,8}$/.test(okMobile.body?.data?.devOtp ?? ''),
        `status=${okMobile.status}`
      );

      // 7) Verify mobile with resent OTP and then resend-mobile must
      //    refuse with 400 ALREADY_VERIFIED too.
      const vMobile = await http<{
        data?: { isMobileVerified?: boolean };
      }>('POST', '/api/v1/auth/register/verify-mobile', {
        body: {
          userId,
          otpId: okMobile.body?.data?.otpId ?? 0,
          otpCode: okMobile.body?.data?.devOtp ?? ''
        }
      });
      record(
        '0.6',
        'verify-mobile with resent OTP → 200',
        vMobile.status === 200 && vMobile.body?.data?.isMobileVerified === true,
        `status=${vMobile.status}`
      );

      const alreadyMobile = await http<{ code?: string }>(
        'POST',
        '/api/v1/auth/register/resend-mobile',
        { body: { userId } }
      );
      record(
        '0.6',
        'resend-mobile after verified → 400 ALREADY_VERIFIED',
        alreadyMobile.status === 400 &&
          alreadyMobile.body?.code === 'ALREADY_VERIFIED',
        `status=${alreadyMobile.status} code=${alreadyMobile.body?.code}`
      );

      // Cleanup
      if (userId > 0) {
        await getPool().query('DELETE FROM users WHERE id = $1', [userId]);
      }
    }

    // ─── 0.6b Resend recovery from expired OTP rows ──────
    //
    // Regression test for the queenrana958 incident: a user whose
    // registration OTP row aged into 'expired' before they tried to
    // resend was previously locked out forever, because udf_otp_resend
    // only matches `status = 'pending'`. The Node service layer now
    // catches that OTP_NOT_FOUND from the UDF and silently falls back
    // to udf_otp_generate (see auth-flows.service.ts callOtpResend
    // `fallbackToGenerate` flag, and docs/03 §3.8 "Resend recovery
    // from expired rows").
    //
    //   1. register fresh user → email + mobile OTPs in 'pending'
    //   2. flip the email OTP row to 'expired' in the DB
    //   3. resend-email → 200 with a new otpId (fallback fired)
    //   4. the new OTP row is in 'pending' status
    //   5. verify-email with the regenerated OTP → 200
    //   6. same dance for mobile
    header('0.6b Resend recovery from expired OTP rows');
    {
      const FB_EMAIL = `verify-flows-fb+${RUN_ID}@test.growupmore.local`;
      const FB_MOBILE = `+91993${RAND9}`.slice(0, 14);
      const FB_PASSWORD = 'FallbackPass2026';

      const reg = await http<{
        data?: {
          userId: number;
          emailOtpId: number;
          mobileOtpId: number;
        };
      }>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'Fallback',
          lastName: `Run${process.pid}`,
          email: FB_EMAIL,
          mobile: FB_MOBILE,
          password: FB_PASSWORD,
          roleCode: 'student'
        }
      });
      record(
        '0.6b',
        'register fallback-test user → 201',
        reg.status === 201 && typeof reg.body?.data?.userId === 'number',
        `status=${reg.status}`
      );

      const userId = reg.body?.data?.userId ?? 0;
      const origEmailOtpId = reg.body?.data?.emailOtpId ?? 0;
      const origMobileOtpId = reg.body?.data?.mobileOtpId ?? 0;

      // 1) Force the email OTP row into 'expired' status, mimicking
      //    a row that aged out 10+ minutes after generation. We also
      //    push expires_at into the past so the state is internally
      //    consistent (the resend UDF doesn't check expires_at, only
      //    status, but verify-* code paths do — keeping them in sync
      //    avoids surprising follow-on tests).
      if (origEmailOtpId > 0) {
        await getPool().query(
          `UPDATE user_otps
              SET status = 'expired',
                  expires_at = CURRENT_TIMESTAMP - INTERVAL '1 hour'
            WHERE id = $1`,
          [origEmailOtpId]
        );
      }

      // 2) resend-email should NOT 404 — the Node fallback should
      //    silently issue a fresh OTP via udf_otp_generate.
      const recovered = await http<{
        data?: { otpId: number; devOtp: string };
        code?: string;
      }>('POST', '/api/v1/auth/register/resend-email', {
        body: { userId }
      });
      record(
        '0.6b',
        'resend-email on expired row → 200 (fallback recovered)',
        recovered.status === 200 &&
          typeof recovered.body?.data?.otpId === 'number' &&
          recovered.body?.data?.otpId !== origEmailOtpId,
        `status=${recovered.status} code=${recovered.body?.code} orig=${origEmailOtpId} new=${recovered.body?.data?.otpId}`
      );
      record(
        '0.6b',
        'fallback returns a fresh 6-digit devOtp',
        /^[0-9]{4,8}$/.test(recovered.body?.data?.devOtp ?? ''),
        `devOtp=${recovered.body?.data?.devOtp ?? '(empty)'}`
      );

      const recoveredOtpId = recovered.body?.data?.otpId ?? 0;
      const recoveredOtp = recovered.body?.data?.devOtp ?? '';

      // 3) The regenerated row must be in 'pending' status — that's
      //    the whole point of the fallback. The original row stays
      //    'expired' (the regenerate doesn't touch it).
      if (recoveredOtpId > 0) {
        const { rows } = await getPool().query<{ status: string }>(
          'SELECT status FROM user_otps WHERE id = $1',
          [recoveredOtpId]
        );
        record(
          '0.6b',
          'regenerated email OTP row is in pending status',
          rows[0]?.status === 'pending',
          `status=${rows[0]?.status}`
        );
      }
      if (origEmailOtpId > 0) {
        const { rows } = await getPool().query<{ status: string }>(
          'SELECT status FROM user_otps WHERE id = $1',
          [origEmailOtpId]
        );
        record(
          '0.6b',
          'original expired row remains expired (fallback did not touch it)',
          rows[0]?.status === 'expired',
          `status=${rows[0]?.status}`
        );
      }

      // 4) Verify-email with the regenerated OTP → happy path.
      const vEmail = await http<{
        data?: { isEmailVerified?: boolean };
      }>('POST', '/api/v1/auth/register/verify-email', {
        body: { userId, otpId: recoveredOtpId, otpCode: recoveredOtp }
      });
      record(
        '0.6b',
        'verify-email with regenerated OTP → 200 + isEmailVerified=true',
        vEmail.status === 200 && vEmail.body?.data?.isEmailVerified === true,
        `status=${vEmail.status}`
      );

      // 5) Same recovery flow for the mobile channel.
      if (origMobileOtpId > 0) {
        await getPool().query(
          `UPDATE user_otps
              SET status = 'expired',
                  expires_at = CURRENT_TIMESTAMP - INTERVAL '1 hour'
            WHERE id = $1`,
          [origMobileOtpId]
        );
      }
      const recoveredMobile = await http<{
        data?: { otpId: number; devOtp: string };
        code?: string;
      }>('POST', '/api/v1/auth/register/resend-mobile', {
        body: { userId }
      });
      record(
        '0.6b',
        'resend-mobile on expired row → 200 (fallback recovered)',
        recoveredMobile.status === 200 &&
          typeof recoveredMobile.body?.data?.otpId === 'number' &&
          recoveredMobile.body?.data?.otpId !== origMobileOtpId,
        `status=${recoveredMobile.status} code=${recoveredMobile.body?.code}`
      );

      const vMobile = await http<{
        data?: { isMobileVerified?: boolean };
      }>('POST', '/api/v1/auth/register/verify-mobile', {
        body: {
          userId,
          otpId: recoveredMobile.body?.data?.otpId ?? 0,
          otpCode: recoveredMobile.body?.data?.devOtp ?? ''
        }
      });
      record(
        '0.6b',
        'verify-mobile with regenerated OTP → 200',
        vMobile.status === 200 &&
          vMobile.body?.data?.isMobileVerified === true,
        `status=${vMobile.status}`
      );

      // Cleanup
      if (userId > 0) {
        await getPool().query('DELETE FROM users WHERE id = $1', [userId]);
      }
    }

    // ─── 1. Auth gates ──────────────────────────────────
    header('1. Auth gates — anon vs public');
    {
      const r = await http('POST', '/api/v1/auth/reset-password');
      record('1', 'POST /reset-password (no token) → 401', r.status === 401, `got ${r.status}`);

      const r2 = await http('POST', '/api/v1/auth/verify-email');
      record('1', 'POST /verify-email (no token) → 401', r2.status === 401, `got ${r2.status}`);

      const r3 = await http('POST', '/api/v1/auth/change-email', {
        body: { newEmail: 'whatever@example.com' }
      });
      record('1', 'POST /change-email (no token) → 401', r3.status === 401, `got ${r3.status}`);

      // Forgot-password is public — bad payload should still give a
      // validation error not a 401.
      const r4 = await http('POST', '/api/v1/auth/forgot-password', {
        body: { email: 'not-an-email', mobile: 'abc' }
      });
      record(
        '1',
        'POST /forgot-password (bad payload) → 400 (not 401)',
        r4.status === 400,
        `got ${r4.status}`
      );
    }

    // ─── 2. Verify-email re-verification ────────────────
    header('2. Verify email — re-verification flow');
    {
      // First clear the subject's email_verified flag in the DB
      // so the verify_email UDF actually flips it.
      if (subjectUserId) {
        await getPool().query(
          `UPDATE users
              SET is_email_verified = FALSE,
                  email_verified_at = NULL
            WHERE id = $1`,
          [subjectUserId]
        );
      }

      const init = await http<InitiateSingleBody>(
        'POST',
        '/api/v1/auth/verify-email',
        { token: subjectAccessToken }
      );
      record(
        '2',
        'initiate /verify-email → 200 + otpId + devOtpCode',
        init.status === 200 &&
          typeof init.body?.data?.otpId === 'number' &&
          typeof init.body?.data?.devOtpCode === 'string',
        `status=${init.status} otpId=${init.body?.data?.otpId}`
      );

      let otpId = init.body?.data?.otpId ?? 0;
      let otpCode = init.body?.data?.devOtpCode ?? '';

      // /verify-email/resend (authenticated) — exercise the 429 and
      // 200 paths before confirming with the resent OTP.
      const resendTooSoon = await http<{ code?: string }>(
        'POST',
        '/api/v1/auth/verify-email/resend',
        { token: subjectAccessToken }
      );
      record(
        '2',
        '/verify-email/resend immediately → 429 OTP_RESEND_TOO_SOON',
        resendTooSoon.status === 429 &&
          resendTooSoon.body?.code === 'OTP_RESEND_TOO_SOON',
        `status=${resendTooSoon.status} code=${resendTooSoon.body?.code}`
      );

      if (otpId > 0) {
        await getPool().query(
          `UPDATE user_otps
              SET resend_available_at = CURRENT_TIMESTAMP - INTERVAL '1 minute'
            WHERE id = $1`,
          [otpId]
        );
      }

      const resendOk = await http<{
        data?: { otpId: number; devOtp: string };
      }>('POST', '/api/v1/auth/verify-email/resend', {
        token: subjectAccessToken
      });
      record(
        '2',
        '/verify-email/resend after advancing clock → 200 + new otpId',
        resendOk.status === 200 &&
          (resendOk.body?.data?.otpId ?? 0) > 0 &&
          resendOk.body?.data?.otpId !== otpId &&
          /^[0-9]{4,8}$/.test(resendOk.body?.data?.devOtp ?? ''),
        `status=${resendOk.status} new=${resendOk.body?.data?.otpId}`
      );

      // Swap in the resent OTP for the confirm leg (original row is
      // now 'invalidated' by the resend UDF).
      if (resendOk.body?.data?.otpId) {
        otpId = resendOk.body.data.otpId;
        otpCode = resendOk.body.data.devOtp;
      }

      const confirm = await http(
        'POST',
        '/api/v1/auth/verify-email/confirm',
        {
          token: subjectAccessToken,
          body: { otpId, otpCode }
        }
      );
      record(
        '2',
        'confirm /verify-email → 200 (using resent OTP)',
        confirm.status === 200,
        `status=${confirm.status}`
      );

      // DB check
      if (subjectUserId) {
        const { rows } = await getPool().query<{
          is_email_verified: boolean;
          email_verified_at: Date | null;
        }>('SELECT is_email_verified, email_verified_at FROM users WHERE id = $1', [
          subjectUserId
        ]);
        record(
          '2',
          'subject.is_email_verified = TRUE in db',
          rows[0]?.is_email_verified === true && rows[0]?.email_verified_at != null,
          `flag=${rows[0]?.is_email_verified}`
        );
      }
    }

    // ─── 3. Verify-mobile re-verification ───────────────
    header('3. Verify mobile — re-verification flow');
    {
      if (subjectUserId) {
        await getPool().query(
          `UPDATE users
              SET is_mobile_verified = FALSE,
                  mobile_verified_at = NULL
            WHERE id = $1`,
          [subjectUserId]
        );
      }

      const init = await http<InitiateSingleBody>(
        'POST',
        '/api/v1/auth/verify-mobile',
        { token: subjectAccessToken }
      );
      record(
        '3',
        'initiate /verify-mobile → 200 + otpId + devOtpCode',
        init.status === 200 &&
          typeof init.body?.data?.otpId === 'number' &&
          typeof init.body?.data?.devOtpCode === 'string',
        `status=${init.status} otpId=${init.body?.data?.otpId}`
      );

      let otpId = init.body?.data?.otpId ?? 0;
      let otpCode = init.body?.data?.devOtpCode ?? '';

      // /verify-mobile/resend — same contract as /verify-email/resend.
      const resendTooSoon = await http<{ code?: string }>(
        'POST',
        '/api/v1/auth/verify-mobile/resend',
        { token: subjectAccessToken }
      );
      record(
        '3',
        '/verify-mobile/resend immediately → 429 OTP_RESEND_TOO_SOON',
        resendTooSoon.status === 429 &&
          resendTooSoon.body?.code === 'OTP_RESEND_TOO_SOON',
        `status=${resendTooSoon.status} code=${resendTooSoon.body?.code}`
      );

      if (otpId > 0) {
        await getPool().query(
          `UPDATE user_otps
              SET resend_available_at = CURRENT_TIMESTAMP - INTERVAL '1 minute'
            WHERE id = $1`,
          [otpId]
        );
      }

      const resendOk = await http<{
        data?: { otpId: number; devOtp: string };
      }>('POST', '/api/v1/auth/verify-mobile/resend', {
        token: subjectAccessToken
      });
      record(
        '3',
        '/verify-mobile/resend after advancing clock → 200 + new otpId',
        resendOk.status === 200 &&
          (resendOk.body?.data?.otpId ?? 0) > 0 &&
          resendOk.body?.data?.otpId !== otpId &&
          /^[0-9]{4,8}$/.test(resendOk.body?.data?.devOtp ?? ''),
        `status=${resendOk.status} new=${resendOk.body?.data?.otpId}`
      );

      if (resendOk.body?.data?.otpId) {
        otpId = resendOk.body.data.otpId;
        otpCode = resendOk.body.data.devOtp;
      }

      const confirm = await http(
        'POST',
        '/api/v1/auth/verify-mobile/confirm',
        {
          token: subjectAccessToken,
          body: { otpId, otpCode }
        }
      );
      record(
        '3',
        'confirm /verify-mobile → 200 (using resent OTP)',
        confirm.status === 200,
        `status=${confirm.status}`
      );

      if (subjectUserId) {
        const { rows } = await getPool().query<{
          is_mobile_verified: boolean;
        }>('SELECT is_mobile_verified FROM users WHERE id = $1', [subjectUserId]);
        record(
          '3',
          'subject.is_mobile_verified = TRUE in db',
          rows[0]?.is_mobile_verified === true,
          `flag=${rows[0]?.is_mobile_verified}`
        );
      }
    }

    // ─── 4. Reset-password (authenticated change-password) ─
    header('4. Reset password — change while logged in');
    {
      const init = await http<InitiateDualBody>(
        'POST',
        '/api/v1/auth/reset-password',
        { token: subjectAccessToken }
      );
      record(
        '4',
        'initiate /reset-password → 200 + dual OTP ids + dev codes',
        init.status === 200 &&
          typeof init.body?.data?.emailOtpId === 'number' &&
          typeof init.body?.data?.mobileOtpId === 'number' &&
          typeof init.body?.data?.devEmailOtp === 'string' &&
          typeof init.body?.data?.devMobileOtp === 'string',
        `status=${init.status}`
      );

      const emailOtpId = init.body?.data?.emailOtpId ?? 0;
      const mobileOtpId = init.body?.data?.mobileOtpId ?? 0;
      const emailOtpCode = init.body?.data?.devEmailOtp ?? '';
      const mobileOtpCode = init.body?.data?.devMobileOtp ?? '';

      // Wrong OTP code → 400 (does NOT consume the request)
      const wrong = await http(
        'POST',
        '/api/v1/auth/reset-password/verify',
        {
          token: subjectAccessToken,
          body: {
            emailOtpId,
            emailOtpCode: '000000',
            mobileOtpId,
            mobileOtpCode,
            newPassword: SUBJECT_PASSWORD_2
          }
        }
      );
      record(
        '4',
        'wrong email OTP → 400',
        wrong.status === 400,
        `got ${wrong.status}`
      );

      const verify = await http(
        'POST',
        '/api/v1/auth/reset-password/verify',
        {
          token: subjectAccessToken,
          body: {
            emailOtpId,
            emailOtpCode,
            mobileOtpId,
            mobileOtpCode,
            newPassword: SUBJECT_PASSWORD_2
          }
        }
      );
      record(
        '4',
        'verify /reset-password → 200',
        verify.status === 200,
        `status=${verify.status}`
      );

      // After reset, sessions are revoked — old token must be 401
      const stale = await http('GET', '/api/v1/auth/me', {
        token: subjectAccessToken
      });
      record(
        '4',
        'old subject token rejected after reset (revoked)',
        stale.status === 401,
        `got ${stale.status}`
      );

      // Login with new password works; old password fails
      const oldFails = await http('POST', '/api/v1/auth/login', {
        body: { identifier: SUBJECT_EMAIL, password: SUBJECT_PASSWORD }
      });
      record(
        '4',
        'old password no longer accepted',
        oldFails.status === 401,
        `got ${oldFails.status}`
      );

      currentSubjectPassword = SUBJECT_PASSWORD_2;
      const ok = await reloginSubject(http);
      record(
        '4',
        'login with new password → 200',
        ok,
        `token=${subjectAccessToken ? 'yes' : 'no'}`
      );
    }

    // ─── 5. Forgot-password (public dual-channel recovery) ─
    header('5. Forgot password — public recovery');
    {
      const init = await http<InitiateDualBody>(
        'POST',
        '/api/v1/auth/forgot-password',
        {
          body: { email: SUBJECT_EMAIL, mobile: SUBJECT_MOBILE }
        }
      );
      record(
        '5',
        'initiate /forgot-password (public) → 200 + dual OTP ids',
        init.status === 200 &&
          typeof init.body?.data?.userId === 'number' &&
          typeof init.body?.data?.emailOtpId === 'number' &&
          typeof init.body?.data?.mobileOtpId === 'number' &&
          typeof init.body?.data?.devEmailOtp === 'string' &&
          typeof init.body?.data?.devMobileOtp === 'string',
        `status=${init.status}`
      );

      const userId = init.body?.data?.userId ?? 0;
      const emailOtpId = init.body?.data?.emailOtpId ?? 0;
      const mobileOtpId = init.body?.data?.mobileOtpId ?? 0;
      const emailOtpCode = init.body?.data?.devEmailOtp ?? '';
      const mobileOtpCode = init.body?.data?.devMobileOtp ?? '';

      const verify = await http(
        'POST',
        '/api/v1/auth/forgot-password/verify',
        {
          body: {
            userId,
            emailOtpId,
            emailOtpCode,
            mobileOtpId,
            mobileOtpCode,
            newPassword: SUBJECT_PASSWORD_3
          }
        }
      );
      record(
        '5',
        'verify /forgot-password (public) → 200',
        verify.status === 200,
        `status=${verify.status}`
      );

      const oldFails = await http('POST', '/api/v1/auth/login', {
        body: { identifier: SUBJECT_EMAIL, password: SUBJECT_PASSWORD_2 }
      });
      record(
        '5',
        'previous password no longer accepted',
        oldFails.status === 401,
        `got ${oldFails.status}`
      );

      currentSubjectPassword = SUBJECT_PASSWORD_3;
      const ok = await reloginSubject(http);
      record(
        '5',
        'login with new (recovered) password → 200',
        ok,
        `token=${subjectAccessToken ? 'yes' : 'no'}`
      );
    }

    // ─── 6. Change-email (authenticated) ────────────────
    header('6. Change email — swap to a new address');
    {
      // Duplicate-email guard: trying to change-email to harness's
      // address must 4xx.
      const dup = await http(
        'POST',
        '/api/v1/auth/change-email',
        {
          token: subjectAccessToken,
          body: { newEmail: HARNESS_EMAIL }
        }
      );
      record(
        '6',
        'change-email to existing address → 4xx',
        dup.status >= 400 && dup.status < 500,
        `got ${dup.status}`
      );

      const init = await http<InitiateSingleBody>(
        'POST',
        '/api/v1/auth/change-email',
        {
          token: subjectAccessToken,
          body: { newEmail: SUBJECT_EMAIL_2 }
        }
      );
      record(
        '6',
        'initiate /change-email → 200 + requestId + otpId + devOtpCode',
        init.status === 200 &&
          typeof init.body?.data?.requestId === 'number' &&
          typeof init.body?.data?.otpId === 'number' &&
          typeof init.body?.data?.devOtpCode === 'string',
        `status=${init.status}`
      );

      const requestId = init.body?.data?.requestId ?? 0;
      const otpId = init.body?.data?.otpId ?? 0;
      const otpCode = init.body?.data?.devOtpCode ?? '';

      const confirm = await http(
        'POST',
        '/api/v1/auth/change-email/confirm',
        {
          token: subjectAccessToken,
          body: { requestId, otpId, otpCode }
        }
      );
      record(
        '6',
        'confirm /change-email → 200',
        confirm.status === 200,
        `status=${confirm.status}`
      );

      // DB check
      if (subjectUserId) {
        const { rows } = await getPool().query<{ email: string }>(
          'SELECT email FROM users WHERE id = $1',
          [subjectUserId]
        );
        record(
          '6',
          'users.email updated to new address',
          rows[0]?.email?.toLowerCase() === SUBJECT_EMAIL_2.toLowerCase(),
          `email=${rows[0]?.email}`
        );
      }

      // Old token must be revoked
      const stale = await http('GET', '/api/v1/auth/me', {
        token: subjectAccessToken
      });
      record(
        '6',
        'old subject token rejected after change-email (revoked)',
        stale.status === 401,
        `got ${stale.status}`
      );

      // Old email no longer logs in
      const oldEmail = await http('POST', '/api/v1/auth/login', {
        body: { identifier: SUBJECT_EMAIL, password: SUBJECT_PASSWORD_3 }
      });
      record(
        '6',
        'old email rejected on login',
        oldEmail.status === 401,
        `got ${oldEmail.status}`
      );

      currentSubjectIdentifier = SUBJECT_EMAIL_2;
      const ok = await reloginSubject(http);
      record(
        '6',
        'login with new email → 200',
        ok,
        `token=${subjectAccessToken ? 'yes' : 'no'}`
      );
    }

    // ─── 7. Change-mobile (authenticated) ───────────────
    header('7. Change mobile — swap to a new number');
    {
      const init = await http<InitiateSingleBody>(
        'POST',
        '/api/v1/auth/change-mobile',
        {
          token: subjectAccessToken,
          body: { newMobile: SUBJECT_MOBILE_2 }
        }
      );
      record(
        '7',
        'initiate /change-mobile → 200 + requestId + otpId + devOtpCode',
        init.status === 200 &&
          typeof init.body?.data?.requestId === 'number' &&
          typeof init.body?.data?.otpId === 'number' &&
          typeof init.body?.data?.devOtpCode === 'string',
        `status=${init.status}`
      );

      const requestId = init.body?.data?.requestId ?? 0;
      const otpId = init.body?.data?.otpId ?? 0;
      const otpCode = init.body?.data?.devOtpCode ?? '';

      const confirm = await http(
        'POST',
        '/api/v1/auth/change-mobile/confirm',
        {
          token: subjectAccessToken,
          body: { requestId, otpId, otpCode }
        }
      );
      record(
        '7',
        'confirm /change-mobile → 200',
        confirm.status === 200,
        `status=${confirm.status}`
      );

      if (subjectUserId) {
        const { rows } = await getPool().query<{ mobile: string }>(
          'SELECT mobile FROM users WHERE id = $1',
          [subjectUserId]
        );
        record(
          '7',
          'users.mobile updated to new number',
          rows[0]?.mobile === SUBJECT_MOBILE_2,
          `mobile=${rows[0]?.mobile}`
        );
      }

      // Old token revoked
      const stale = await http('GET', '/api/v1/auth/me', {
        token: subjectAccessToken
      });
      record(
        '7',
        'old subject token rejected after change-mobile (revoked)',
        stale.status === 401,
        `got ${stale.status}`
      );

      // Re-login (subject still uses email-2 as identifier)
      currentSubjectIdentifier = SUBJECT_EMAIL_2;
      const ok = await reloginSubject(http);
      record(
        '7',
        'login still works after mobile swap',
        ok,
        `token=${subjectAccessToken ? 'yes' : 'no'}`
      );
    }

    // ─── 8. Admin ops — change-role / set-verification / deactivate
    header('8. Admin ops via super_admin');
    {
      // Pick a target role distinct from the current student role.
      const { rows: roleRows } = await getPool().query<{ id: number; code: string }>(
        `SELECT id, code FROM roles
          WHERE level >= 2
            AND is_active = TRUE
            AND is_deleted = FALSE
            AND code <> 'student'
          ORDER BY level
          LIMIT 1`
      );
      // pg returns BIGINT as string — coerce to number so strict
      // equality against the JSON response id (already a number)
      // works as expected.
      const targetRoleId =
        roleRows[0]?.id != null ? Number(roleRows[0].id) : null;
      const targetRoleCode = roleRows[0]?.code ?? '';

      if (subjectUserId && targetRoleId) {
        const cr = await http<{
          data?: { role?: { id: number; code: string } };
        }>(
          'POST',
          `/api/v1/users/${subjectUserId}/change-role`,
          {
            token: harnessAccessToken,
            body: { roleId: targetRoleId }
          }
        );
        record(
          '8',
          `change-role → 200 (new role ${targetRoleCode})`,
          cr.status === 200 &&
            cr.body?.data?.role?.id === targetRoleId,
          `status=${cr.status}`
        );

        // Subject (lower privilege) cannot change-role on themselves
        const denied = await http('POST', `/api/v1/users/${subjectUserId}/change-role`, {
          token: subjectAccessToken,
          body: { roleId: targetRoleId }
        });
        record(
          '8',
          'subject (non super-admin) change-role → 4xx',
          denied.status >= 400 && denied.status < 500,
          `got ${denied.status}`
        );
      }

      // set-verification toggles
      if (subjectUserId) {
        const sv = await http<{
          data?: { isEmailVerified: boolean; isMobileVerified: boolean };
        }>(
          'POST',
          `/api/v1/users/${subjectUserId}/set-verification`,
          {
            token: harnessAccessToken,
            body: { isEmailVerified: false, isMobileVerified: false }
          }
        );
        record(
          '8',
          'set-verification (false/false) → 200',
          sv.status === 200 &&
            sv.body?.data?.isEmailVerified === false &&
            sv.body?.data?.isMobileVerified === false,
          `status=${sv.status}`
        );

        const sv2 = await http<{
          data?: { isEmailVerified: boolean; isMobileVerified: boolean };
        }>(
          'POST',
          `/api/v1/users/${subjectUserId}/set-verification`,
          {
            token: harnessAccessToken,
            body: { isEmailVerified: true, isMobileVerified: true }
          }
        );
        record(
          '8',
          'set-verification (true/true) → 200',
          sv2.status === 200 &&
            sv2.body?.data?.isEmailVerified === true &&
            sv2.body?.data?.isMobileVerified === true,
          `status=${sv2.status}`
        );

        // Empty body → 400
        const empty = await http(
          'POST',
          `/api/v1/users/${subjectUserId}/set-verification`,
          { token: harnessAccessToken, body: {} }
        );
        record(
          '8',
          'set-verification empty body → 400',
          empty.status === 400,
          `got ${empty.status}`
        );
      }

      // deactivate
      if (subjectUserId) {
        const deact = await http<{
          data?: { isActive: boolean };
        }>('POST', `/api/v1/users/${subjectUserId}/deactivate`, {
          token: harnessAccessToken
        });
        record(
          '8',
          'deactivate subject → 200 + isActive=false',
          deact.status === 200 && deact.body?.data?.isActive === false,
          `status=${deact.status}`
        );

        // Deactivated user cannot log in
        const cannot = await http('POST', '/api/v1/auth/login', {
          body: {
            identifier: currentSubjectIdentifier,
            password: currentSubjectPassword
          }
        });
        record(
          '8',
          'deactivated user login → 401/423',
          cannot.status === 401 || cannot.status === 423,
          `got ${cannot.status}`
        );

        // Reactivate so subsequent validation tests can still talk to subject
        await reactivateUser(subjectUserId);
      }

      // Cannot deactivate primary super admin
      const protectPrimary = await http(
        'POST',
        '/api/v1/users/1/deactivate',
        { token: harnessAccessToken }
      );
      record(
        '8',
        'deactivate /users/1 (primary super admin) → 4xx',
        protectPrimary.status >= 400 && protectPrimary.status < 500,
        `got ${protectPrimary.status}`
      );
    }

    // ─── 9. Validation gauntlet ─────────────────────────
    header('9. Validation gauntlet');
    {
      // Forgot-password: missing mobile → 400
      const noMobile = await http('POST', '/api/v1/auth/forgot-password', {
        body: { email: SUBJECT_EMAIL_2 }
      });
      record(
        '9',
        'forgot-password missing mobile → 400',
        noMobile.status === 400,
        `got ${noMobile.status}`
      );

      // Forgot-password: unknown email/mobile combo → 4xx
      const ghost = await http('POST', '/api/v1/auth/forgot-password', {
        body: {
          email: 'ghost@nowhere.test',
          mobile: '+919999999999'
        }
      });
      record(
        '9',
        'forgot-password unknown identity → 4xx',
        ghost.status >= 400 && ghost.status < 500,
        `got ${ghost.status}`
      );

      // Reset-password verify: weak password → 400
      // Re-login subject to get a fresh token first.
      await reloginSubject(http);

      const initRP = await http<InitiateDualBody>(
        'POST',
        '/api/v1/auth/reset-password',
        { token: subjectAccessToken }
      );
      const e = initRP.body?.data?.emailOtpId ?? 0;
      const m = initRP.body?.data?.mobileOtpId ?? 0;
      const ec = initRP.body?.data?.devEmailOtp ?? '';
      const mc = initRP.body?.data?.devMobileOtp ?? '';

      const weak = await http('POST', '/api/v1/auth/reset-password/verify', {
        token: subjectAccessToken,
        body: {
          emailOtpId: e,
          emailOtpCode: ec,
          mobileOtpId: m,
          mobileOtpCode: mc,
          newPassword: 'short'
        }
      });
      record(
        '9',
        'reset-password weak password → 400',
        weak.status === 400,
        `got ${weak.status}`
      );

      // Reset-password verify: missing fields → 400
      const incomplete = await http('POST', '/api/v1/auth/reset-password/verify', {
        token: subjectAccessToken,
        body: { newPassword: 'WhateverGood1' }
      });
      record(
        '9',
        'reset-password missing OTP fields → 400',
        incomplete.status === 400,
        `got ${incomplete.status}`
      );

      // Verify-email confirm: bad OTP code shape → 400
      const badShape = await http(
        'POST',
        '/api/v1/auth/verify-email/confirm',
        {
          token: subjectAccessToken,
          body: { otpId: 1, otpCode: 'abc' }
        }
      );
      record(
        '9',
        'verify-email/confirm non-numeric OTP → 400',
        badShape.status === 400,
        `got ${badShape.status}`
      );

      // Change-email: invalid email format → 400
      const badEmail = await http('POST', '/api/v1/auth/change-email', {
        token: subjectAccessToken,
        body: { newEmail: 'not-an-email' }
      });
      record(
        '9',
        'change-email invalid newEmail → 400',
        badEmail.status === 400,
        `got ${badEmail.status}`
      );

      // Change-mobile: invalid mobile shape → 400
      const badMobile = await http('POST', '/api/v1/auth/change-mobile', {
        token: subjectAccessToken,
        body: { newMobile: 'not-a-mobile' }
      });
      record(
        '9',
        'change-mobile invalid newMobile → 400',
        badMobile.status === 400,
        `got ${badMobile.status}`
      );

      // Change-role: missing roleId → 400
      if (subjectUserId) {
        const noRole = await http(
          'POST',
          `/api/v1/users/${subjectUserId}/change-role`,
          {
            token: harnessAccessToken,
            body: {}
          }
        );
        record(
          '9',
          'change-role missing roleId → 400',
          noRole.status === 400,
          `got ${noRole.status}`
        );
      }
    }
  } finally {
    // ─── 10. Cleanup ─────────────────────────────────
    header('10. Cleanup');
    {
      if (subjectUserId) {
        try {
          await hardDeleteUser(subjectUserId);
          record('10', 'subject user hard-deleted', true, `id=${subjectUserId}`);
        } catch (err) {
          record('10', 'subject user hard-deleted', false, (err as Error).message);
        }
      }
      if (harnessUserId) {
        try {
          await softDeleteUser(harnessUserId);
          record('10', 'harness user soft-deleted', true, `id=${harnessUserId}`);
        } catch (err) {
          record('10', 'harness user soft-deleted', false, (err as Error).message);
        }
      }
      for (const jti of collectedJtis) {
        try {
          await redisRevoked.remove(jti);
        } catch {
          /* ignore */
        }
      }
      record(
        '10',
        'redis revoked entries cleared (no-op if absent)',
        true,
        `n=${collectedJtis.size}`
      );
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closePool();
    await closeRedis();
  }

  // ─── Summary ─────────────────────────────────────────
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  const failed = total - passed;
  console.log(`\n━━ Summary ━━`);
  console.log(`  passed: ${passed}/${total}`);
  if (failed > 0) {
    console.log(`\n  Failures:`);
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`    - [${r.section}] ${r.name} — ${r.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log('  Step 11 verdict: \x1b[32mPASS\x1b[0m');
  }
};

main().catch((err) => {
  console.error('\n\x1b[31m✗ fatal:\x1b[0m', err);
  process.exitCode = 1;
  closePool().catch(() => undefined);
  closeRedis().catch(() => undefined);
});
