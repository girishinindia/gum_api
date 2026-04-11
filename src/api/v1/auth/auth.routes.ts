// ═══════════════════════════════════════════════════════════════
// /api/v1/auth router — the full authentication surface area.
//
// Core spine (Steps 8/9):
//   POST /register                 → create account + dual-channel OTP delivery
//   POST /register/verify-email    → public; mark registration email verified
//   POST /register/verify-mobile   → public; mark registration mobile verified
//   POST /login                    → identifier+password → tokens (403 if unverified)
//   POST /logout                   → revoke current session
//   POST /refresh                  → rotate tokens
//   GET  /me                       → current user profile
//
// Step 11 OTP-driven flows:
//   POST /forgot-password               (public, dual-channel initiate)
//   POST /forgot-password/verify        (public, dual-channel complete)
//   POST /reset-password                (auth, dual-channel initiate)
//   POST /reset-password/verify         (auth, dual-channel complete)
//   POST /verify-email                  (auth, single-channel initiate)
//   POST /verify-email/confirm          (auth, single-channel complete)
//   POST /verify-mobile                 (auth, single-channel initiate)
//   POST /verify-mobile/confirm         (auth, single-channel complete)
//   POST /change-email                  (auth, OTP to *new* address)
//   POST /change-email/confirm          (auth, complete request)
//   POST /change-mobile                 (auth, OTP to *new* number)
//   POST /change-mobile/confirm         (auth, complete request)
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { verifyAccessToken } from '../../../core/auth/jwt';
import { authenticate } from '../../../core/middlewares/authenticate';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import * as authService from '../../../modules/auth/auth.service';
import * as authFlows from '../../../modules/auth/auth-flows.service';
import {
  loginBodySchema,
  refreshBodySchema,
  registerBodySchema
} from '../../../modules/auth/auth.schemas';
import {
  changeContactCompleteBodySchema,
  changeEmailInitiateBodySchema,
  changeMobileInitiateBodySchema,
  forgotPasswordCompleteBodySchema,
  forgotPasswordInitiateBodySchema,
  registerVerifyBodySchema,
  resetPasswordCompleteBodySchema,
  verifyContactCompleteBodySchema,
  type ChangeContactCompleteBody,
  type ChangeEmailInitiateBody,
  type ChangeMobileInitiateBody,
  type ForgotPasswordCompleteBody,
  type ForgotPasswordInitiateBody,
  type RegisterVerifyBody,
  type ResetPasswordCompleteBody,
  type VerifyContactCompleteBody
} from '../../../modules/auth/auth-flows.schemas';

const router = Router();

// ─── POST /register ──────────────────────────────────────────────

router.post(
  '/register',
  validate({ body: registerBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as import('../../../modules/auth/auth.schemas').RegisterBody;
    const result = await authService.register({
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      mobile: body.mobile,
      password: body.password,
      roleCode: body.roleCode,
      countryId: body.countryId
    });
    return created(res, result, 'User registered successfully');
  })
);

// ─── POST /register/verify-email (public, no JWT) ───────────────
//
// Public sibling of /verify-email/confirm. A freshly-registered user
// has no JWT yet (login is gated on both-verified), so these two
// routes take { userId, otpId, otpCode } from the body. The service
// layer binds the OTP row to the claimed userId and refuses anything
// that isn't a purpose='registration' row.

router.post(
  '/register/verify-email',
  validate({ body: registerVerifyBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as RegisterVerifyBody;
    const result = await authFlows.registerVerifyEmail({
      userId: body.userId,
      otpId: body.otpId,
      otpCode: body.otpCode
    });
    return ok(res, result, 'Email verified');
  })
);

// ─── POST /register/verify-mobile (public, no JWT) ──────────────

router.post(
  '/register/verify-mobile',
  validate({ body: registerVerifyBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as RegisterVerifyBody;
    const result = await authFlows.registerVerifyMobile({
      userId: body.userId,
      otpId: body.otpId,
      otpCode: body.otpCode
    });
    return ok(res, result, 'Mobile verified');
  })
);

// ─── POST /login ─────────────────────────────────────────────────

router.post(
  '/login',
  validate({ body: loginBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as import('../../../modules/auth/auth.schemas').LoginBody;
    const result = await authService.login({
      identifier: body.identifier,
      password: body.password,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null
    });
    return ok(res, result, 'Login successful');
  })
);

// ─── POST /logout ────────────────────────────────────────────────

/**
 * Logout uses `authenticate` to prove the caller actually holds a
 * valid access token, then pulls the JWT payload off the header a
 * second time so the service can read jti/exp for revocation. We
 * don't stash the raw payload on req.user because the middleware
 * deliberately keeps that interface clean.
 */
router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    const header = req.headers.authorization ?? '';
    const token = header.replace(/^Bearer\s+/i, '').trim();
    if (!token) throw AppError.unauthorized('Missing bearer token');

    const payload = verifyAccessToken(token);
    await authService.logout(payload);
    return ok(res, { revoked: true }, 'Logged out');
  })
);

// ─── POST /refresh ───────────────────────────────────────────────

router.post(
  '/refresh',
  validate({ body: refreshBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as import('../../../modules/auth/auth.schemas').RefreshBody;
    const result = await authService.refresh(body.refreshToken);
    return ok(res, result, 'Token refreshed');
  })
);

// ─── GET /me ─────────────────────────────────────────────────────

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    // authenticate has guaranteed req.user is populated.
    const me = await authService.getMe(req.user!);
    return ok(res, me, 'OK');
  })
);

// ═══════════════════════════════════════════════════════════════
//   Step 11 — OTP-driven flows
// ═══════════════════════════════════════════════════════════════

// ─── POST /forgot-password (public, dual-channel initiate) ──────

router.post(
  '/forgot-password',
  validate({ body: forgotPasswordInitiateBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as ForgotPasswordInitiateBody;
    const result = await authFlows.forgotPasswordInitiate(body.email, body.mobile);
    return ok(res, result, 'Verification codes sent');
  })
);

// ─── POST /forgot-password/verify (public, dual-channel complete)

router.post(
  '/forgot-password/verify',
  validate({ body: forgotPasswordCompleteBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as ForgotPasswordCompleteBody;
    const result = await authFlows.forgotPasswordComplete(body);
    return ok(res, result, 'Password has been reset');
  })
);

// ─── POST /reset-password (auth, dual-channel initiate) ─────────

router.post(
  '/reset-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const result = await authFlows.resetPasswordInitiate(userId);
    return ok(res, result, 'Verification codes sent');
  })
);

// ─── POST /reset-password/verify (auth, dual-channel complete) ──

router.post(
  '/reset-password/verify',
  authenticate,
  validate({ body: resetPasswordCompleteBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as ResetPasswordCompleteBody;
    const userId = req.user!.id;
    const result = await authFlows.resetPasswordComplete({
      userId,
      ...body
    });
    return ok(res, result, 'Password has been changed');
  })
);

// ─── POST /verify-email (auth, single-channel initiate) ─────────

router.post(
  '/verify-email',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const result = await authFlows.verifyEmailInitiate(userId);
    return ok(res, result, 'Verification email sent');
  })
);

// ─── POST /verify-email/confirm (auth, single-channel complete) ─

router.post(
  '/verify-email/confirm',
  authenticate,
  validate({ body: verifyContactCompleteBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as VerifyContactCompleteBody;
    const userId = req.user!.id;
    const result = await authFlows.verifyEmailComplete({
      userId,
      otpId: body.otpId,
      otpCode: body.otpCode
    });
    return ok(res, result, 'Email verified');
  })
);

// ─── POST /verify-mobile (auth, single-channel initiate) ────────

router.post(
  '/verify-mobile',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const result = await authFlows.verifyMobileInitiate(userId);
    return ok(res, result, 'Verification SMS sent');
  })
);

// ─── POST /verify-mobile/confirm (auth, single-channel complete)

router.post(
  '/verify-mobile/confirm',
  authenticate,
  validate({ body: verifyContactCompleteBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as VerifyContactCompleteBody;
    const userId = req.user!.id;
    const result = await authFlows.verifyMobileComplete({
      userId,
      otpId: body.otpId,
      otpCode: body.otpCode
    });
    return ok(res, result, 'Mobile verified');
  })
);

// ─── POST /change-email (auth, OTP to new address) ──────────────

router.post(
  '/change-email',
  authenticate,
  validate({ body: changeEmailInitiateBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as ChangeEmailInitiateBody;
    const userId = req.user!.id;
    const result = await authFlows.changeEmailInitiate(userId, body.newEmail);
    return ok(res, result, 'Verification code sent to new email');
  })
);

// ─── POST /change-email/confirm (auth, complete request) ────────

router.post(
  '/change-email/confirm',
  authenticate,
  validate({ body: changeContactCompleteBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as ChangeContactCompleteBody;
    const result = await authFlows.changeEmailComplete(body);
    return ok(res, result, 'Email changed; please re-login');
  })
);

// ─── POST /change-mobile (auth, OTP to new number) ──────────────

router.post(
  '/change-mobile',
  authenticate,
  validate({ body: changeMobileInitiateBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as ChangeMobileInitiateBody;
    const userId = req.user!.id;
    const result = await authFlows.changeMobileInitiate(userId, body.newMobile);
    return ok(res, result, 'Verification code sent to new mobile');
  })
);

// ─── POST /change-mobile/confirm (auth, complete request) ───────

router.post(
  '/change-mobile/confirm',
  authenticate,
  validate({ body: changeContactCompleteBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as ChangeContactCompleteBody;
    const result = await authFlows.changeMobileComplete(body);
    return ok(res, result, 'Mobile changed; please re-login');
  })
);

export default router;
