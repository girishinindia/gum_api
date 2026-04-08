import crypto from 'crypto';

import { AppError } from '../../core/errors/app-error';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../core/utils/jwt';
import { redisSession, redisPending } from '../../database/redis';
import { brevoService } from '../../integrations/email/brevo.service';
import { welcomeTemplate } from '../../integrations/email/templates/welcome.template';

import { passwordChangedTemplate } from '../../integrations/email/templates/password-changed.template';
import { emailChangedNotifyTemplate, emailChangedWelcomeTemplate } from '../../integrations/email/templates/email-changed.template';
import { mobileChangedTemplate } from '../../integrations/email/templates/mobile-changed.template';

import { db } from '../../database/db';
import { logger } from '../../core/logger/logger';
import { authRepository } from './auth.repository';
import { otpService } from './otp.service';
import {
  AuthUserRow,
  AuthUserPublic,
  LoginInput,
  RegisterInitiateInput,
  ForgotPasswordInitiateInput,
  ChangePasswordInitiateInput,
  ChangeEmailInitiateInput,
  ChangeMobileInitiateInput,
  PendingRegisterSession,
  PendingForgotPasswordSession,
  PendingChangePasswordSession,
  PendingChangeEmailSession,
  PendingChangeMobileSession
} from './auth.types';

// ─── Row → Public User Mapper ──────────────────────────────

const toPublicUser = (row: AuthUserRow): AuthUserPublic => ({
  id: row.user_id,
  firstName: row.user_first_name,
  lastName: row.user_last_name,
  email: row.user_email,
  mobile: row.user_mobile,
  isActive: row.user_is_active,
  isEmailVerified: row.user_is_email_verified,
  isMobileVerified: row.user_is_mobile_verified,
  lastLogin: row.user_last_login,
  createdAt: row.user_created_at,
  updatedAt: row.user_updated_at
});

/** Generate a random session key for multi-step flows */
const generateSessionKey = (): string => crypto.randomBytes(24).toString('hex');

// ═══════════════════════════════════════════════════════════
// AUTH SERVICE
// ═══════════════════════════════════════════════════════════

class AuthService {

  // ─────────────────────────────────────────────────────────
  // 1. REGISTRATION (multi-step with OTP)
  // ─────────────────────────────────────────────────────────

  /** Step 1: Validate, check existence, send OTPs, store pending data */
  async registerInitiate(input: RegisterInitiateInput) {
    // Check email not already registered
    const emailExists = await authRepository.emailExists(input.email);
    if (emailExists) {
      throw new AppError('Email is already registered.', 409, 'EMAIL_ALREADY_EXISTS');
    }

    // Check mobile not already registered
    const mobileExists = await authRepository.mobileExists(input.mobile);
    if (mobileExists) {
      throw new AppError('Mobile number is already registered.', 409, 'MOBILE_ALREADY_EXISTS');
    }

    // Generate session key for this registration flow
    const sessionKey = generateSessionKey();
    const userName = `${input.firstName} ${input.lastName}`.trim();

    // Store pending registration data in Redis
    const pendingData: PendingRegisterSession = {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      mobile: input.mobile,
      password: input.password
    };
    await redisPending.store(`register:${sessionKey}`, pendingData as unknown as Record<string, unknown>);

    // Send OTPs to both email and mobile
    await otpService.sendToBoth({
      flow: 'register',
      sessionKey,
      email: input.email,
      mobile: input.mobile,
      userName
    });

    return {
      sessionKey,
      message: 'OTPs sent to your email and mobile. Please verify to complete registration.'
    };
  }

  /** Step 2: Verify both OTPs and create user */
  async registerVerifyOtp(sessionKey: string, emailOtp: string, mobileOtp: string) {
    // Get pending session
    const pending = await redisPending.get<PendingRegisterSession>(`register:${sessionKey}`);
    if (!pending) {
      throw new AppError('Registration session expired or invalid. Please start over.', 400, 'SESSION_EXPIRED');
    }

    // Verify both OTPs
    await otpService.verifyBoth('register', sessionKey, emailOtp, mobileOtp);

    // Re-check existence (race condition guard)
    const emailExists = await authRepository.emailExists(pending.email);
    if (emailExists) {
      throw new AppError('Email was registered by another user during verification.', 409, 'EMAIL_ALREADY_EXISTS');
    }
    const mobileExists = await authRepository.mobileExists(pending.mobile);
    if (mobileExists) {
      throw new AppError('Mobile was registered by another user during verification.', 409, 'MOBILE_ALREADY_EXISTS');
    }

    // Create user (both email & mobile verified since OTPs confirmed)
    const { id } = await authRepository.createUser({
      firstName: pending.firstName,
      lastName: pending.lastName,
      email: pending.email,
      mobile: pending.mobile,
      password: pending.password
    });

    // Auto-assign "student" role to newly registered user
    try {
      await db.query(
        `INSERT INTO user_role_assignments (user_id, role_id, assigned_by)
         SELECT $1, r.id, $1
         FROM roles r
         WHERE r.code = 'student' AND r.is_deleted = FALSE`,
        [id]
      );
    } catch (err) {
      // Log but don't fail registration — role can be assigned manually
      logger.error({ err, userId: id }, 'Failed to auto-assign student role on registration');
    }

    // Clean up pending session and OTP keys
    await otpService.cleanup('register', sessionKey);

    // Fetch created user and build auth response
    const user = await authRepository.findById(id);
    if (!user) {
      throw new AppError('User creation failed.', 500, 'USER_CREATION_FAILED');
    }

    const authResponse = await this.buildAuthResponse(user);

    // Send welcome email (fire-and-forget)
    const fullName = `${user.user_first_name} ${user.user_last_name}`.trim();
    brevoService
      .sendWithAdminNotify({
        to: pending.email,
        toName: fullName,
        subject: `Welcome to Grow Up More, ${user.user_first_name}!`,
        html: welcomeTemplate(fullName)
      })
      .catch(() => {});

    return authResponse;
  }

  /** Step 3: Resend registration OTPs */
  async registerResendOtp(sessionKey: string) {
    const pending = await redisPending.get<PendingRegisterSession>(`register:${sessionKey}`);
    if (!pending) {
      throw new AppError('Registration session expired or invalid. Please start over.', 400, 'SESSION_EXPIRED');
    }

    const userName = `${pending.firstName} ${pending.lastName}`.trim();

    await otpService.sendToBoth({
      flow: 'register',
      sessionKey,
      email: pending.email,
      mobile: pending.mobile,
      userName
    });

    return { message: 'OTPs resent to your email and mobile.' };
  }

  // ─────────────────────────────────────────────────────────
  // 2. LOGIN (unchanged — single step)
  // ─────────────────────────────────────────────────────────

  async login(input: LoginInput) {
    const user = await authRepository.verifyCredentials(input.email, input.password);

    if (!user) {
      throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    if (!user.user_is_active) {
      throw new AppError('Your account has been deactivated.', 403, 'ACCOUNT_DEACTIVATED');
    }

    // Update last_login (fire-and-forget)
    authRepository.updateLastLogin(user.user_id).catch(() => {});

    return this.buildAuthResponse(user);
  }

  // ─────────────────────────────────────────────────────────
  // 3. REFRESH TOKEN
  // ─────────────────────────────────────────────────────────

  async refresh(refreshToken: string) {
    let payload;

    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new AppError('Invalid or expired refresh token.', 401, 'INVALID_REFRESH_TOKEN');
    }

    const userId = String(payload.userId);
    const isValid = await redisSession.isValid(userId, refreshToken);
    if (!isValid) {
      throw new AppError('Refresh token has been revoked.', 401, 'REFRESH_TOKEN_REVOKED');
    }

    const user = await authRepository.findById(payload.userId);
    if (!user) {
      throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }

    if (!user.user_is_active) {
      throw new AppError('Your account has been deactivated.', 403, 'ACCOUNT_DEACTIVATED');
    }

    return this.buildAuthResponse(user);
  }

  // ─────────────────────────────────────────────────────────
  // 4. LOGOUT
  // ─────────────────────────────────────────────────────────

  async logout(userId: string) {
    await redisSession.revoke(userId);
    return { message: 'Logged out successfully.' };
  }

  // ─────────────────────────────────────────────────────────
  // 5. FORGOT PASSWORD (multi-step with OTP)
  // ─────────────────────────────────────────────────────────

  /** Step 1: Validate email+mobile combo, send OTPs */
  async forgotPasswordInitiate(input: ForgotPasswordInitiateInput) {
    // Check email+mobile belong to same non-deleted user
    const user = await authRepository.findByEmailMobile(input.email, input.mobile);
    if (!user) {
      throw new AppError(
        'No account found with this email and mobile combination.',
        404,
        'USER_NOT_FOUND'
      );
    }

    if (!user.user_is_active) {
      throw new AppError('Your account has been deactivated.', 403, 'ACCOUNT_DEACTIVATED');
    }

    const sessionKey = generateSessionKey();
    const userName = `${user.user_first_name} ${user.user_last_name}`.trim();

    // Store pending session
    const pendingData: PendingForgotPasswordSession = {
      userId: user.user_id,
      email: input.email,
      mobile: input.mobile
    };
    await redisPending.store(`forgot_password:${sessionKey}`, pendingData as unknown as Record<string, unknown>);

    // Send OTPs to both
    await otpService.sendToBoth({
      flow: 'forgot_password',
      sessionKey,
      email: input.email,
      mobile: input.mobile,
      userName
    });

    return {
      sessionKey,
      message: 'OTPs sent to your email and mobile. Please verify to reset your password.'
    };
  }

  /** Step 2: Verify OTPs — returns a reset token (the same sessionKey, now verified) */
  async forgotPasswordVerifyOtp(sessionKey: string, emailOtp: string, mobileOtp: string) {
    const pending = await redisPending.get<PendingForgotPasswordSession>(`forgot_password:${sessionKey}`);
    if (!pending) {
      throw new AppError('Password reset session expired or invalid. Please start over.', 400, 'SESSION_EXPIRED');
    }

    await otpService.verifyBoth('forgot_password', sessionKey, emailOtp, mobileOtp);

    // Mark session as verified (extend TTL for password reset step)
    await redisPending.store(`forgot_password_verified:${sessionKey}`, {
      userId: pending.userId
    }, 600); // 10 minutes to enter new password

    // Clean up OTP keys but keep verified session
    await redisPending.del(`forgot_password:${sessionKey}`);

    return {
      resetToken: sessionKey,
      message: 'OTPs verified. Please set your new password.'
    };
  }

  /** Step 3: Reset password (after OTP verified) */
  async forgotPasswordReset(resetToken: string, newPassword: string) {
    const verified = await redisPending.get<{ userId: number }>(`forgot_password_verified:${resetToken}`);
    if (!verified) {
      throw new AppError('Reset token expired or invalid. Please start the process again.', 400, 'SESSION_EXPIRED');
    }

    await authRepository.updatePassword(verified.userId, newPassword);

    // Clean up
    await redisPending.del(`forgot_password_verified:${resetToken}`);

    // Revoke existing sessions (force re-login)
    await redisSession.revoke(String(verified.userId));

    // Send password changed confirmation email (fire-and-forget)
    const fpUser = await authRepository.findById(verified.userId);
    if (fpUser?.user_email) {
      const fpName = `${fpUser.user_first_name} ${fpUser.user_last_name}`.trim();
      brevoService.sendToOne({
        to: fpUser.user_email,
        toName: fpName,
        subject: 'Password Changed - Grow Up More',
        html: passwordChangedTemplate(fpName)
      }).catch(() => {});
    }

    return { message: 'Password reset successfully. Please login with your new password.' };
  }

  /** Resend forgot-password OTPs */
  async forgotPasswordResendOtp(sessionKey: string) {
    const pending = await redisPending.get<PendingForgotPasswordSession>(`forgot_password:${sessionKey}`);
    if (!pending) {
      throw new AppError('Password reset session expired or invalid. Please start over.', 400, 'SESSION_EXPIRED');
    }

    // Get user name for SMS template
    const user = await authRepository.findById(pending.userId);
    const userName = user ? `${user.user_first_name} ${user.user_last_name}`.trim() : 'User';

    await otpService.sendToBoth({
      flow: 'forgot_password',
      sessionKey,
      email: pending.email,
      mobile: pending.mobile,
      userName
    });

    return { message: 'OTPs resent to your email and mobile.' };
  }

  // ─────────────────────────────────────────────────────────
  // 6. CHANGE PASSWORD (authenticated, multi-step OTP)
  // ─────────────────────────────────────────────────────────

  /** Step 1: Verify old password, send OTPs to user's email + mobile */
  async changePasswordInitiate(userId: number, input: ChangePasswordInitiateInput) {
    // Verify old password
    const isValid = await authRepository.verifyPassword(userId, input.oldPassword);
    if (!isValid) {
      throw new AppError('Current password is incorrect.', 401, 'INVALID_PASSWORD');
    }

    // Fetch user for email + mobile
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }

    if (!user.user_email || !user.user_mobile) {
      throw new AppError('Both email and mobile are required for password change.', 400, 'MISSING_CONTACT_INFO');
    }

    const sessionKey = generateSessionKey();
    const userName = `${user.user_first_name} ${user.user_last_name}`.trim();

    // Store pending session
    const pendingData: PendingChangePasswordSession = {
      userId,
      email: user.user_email,
      mobile: user.user_mobile,
      newPassword: input.newPassword
    };
    await redisPending.store(`change_password:${sessionKey}`, pendingData as unknown as Record<string, unknown>);

    // Send OTPs to both
    await otpService.sendToBoth({
      flow: 'change_password',
      sessionKey,
      email: user.user_email,
      mobile: user.user_mobile,
      userName
    });

    return {
      sessionKey,
      message: 'OTPs sent to your email and mobile. Please verify to change your password.'
    };
  }

  /** Step 2: Verify OTPs, save new password, force logout */
  async changePasswordVerifyOtp(userId: number, sessionKey: string, emailOtp: string, mobileOtp: string) {
    const pending = await redisPending.get<PendingChangePasswordSession>(`change_password:${sessionKey}`);
    if (!pending || pending.userId !== userId) {
      throw new AppError('Password change session expired or invalid.', 400, 'SESSION_EXPIRED');
    }

    await otpService.verifyBoth('change_password', sessionKey, emailOtp, mobileOtp);

    // Update password
    await authRepository.updatePassword(userId, pending.newPassword);

    // Clean up
    await otpService.cleanup('change_password', sessionKey);

    // Force logout (revoke sessions)
    await redisSession.revoke(String(userId));

    // Send password changed confirmation email (fire-and-forget)
    const cpUser = await authRepository.findById(userId);
    if (cpUser?.user_email) {
      const cpName = `${cpUser.user_first_name} ${cpUser.user_last_name}`.trim();
      brevoService.sendToOne({
        to: cpUser.user_email,
        toName: cpName,
        subject: 'Password Changed - Grow Up More',
        html: passwordChangedTemplate(cpName)
      }).catch(() => {});
    }

    return { message: 'Password changed successfully. Please login with your new password.' };
  }

  /** Resend change-password OTPs */
  async changePasswordResendOtp(userId: number, sessionKey: string) {
    const pending = await redisPending.get<PendingChangePasswordSession>(`change_password:${sessionKey}`);
    if (!pending || pending.userId !== userId) {
      throw new AppError('Password change session expired or invalid.', 400, 'SESSION_EXPIRED');
    }

    const user = await authRepository.findById(userId);
    const userName = user ? `${user.user_first_name} ${user.user_last_name}`.trim() : 'User';

    await otpService.sendToBoth({
      flow: 'change_password',
      sessionKey,
      email: pending.email,
      mobile: pending.mobile,
      userName
    });

    return { message: 'OTPs resent to your email and mobile.' };
  }

  // ─────────────────────────────────────────────────────────
  // 7. CHANGE EMAIL (authenticated, OTP to new email)
  // ─────────────────────────────────────────────────────────

  /** Step 1: Check new email not taken, send OTP to new email */
  async changeEmailInitiate(userId: number, input: ChangeEmailInitiateInput) {
    // Check new email not already registered
    const emailExists = await authRepository.emailExists(input.newEmail);
    if (emailExists) {
      throw new AppError('This email is already registered.', 409, 'EMAIL_ALREADY_EXISTS');
    }

    const user = await authRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }

    const sessionKey = generateSessionKey();
    const userName = `${user.user_first_name} ${user.user_last_name}`.trim();

    // Store pending session
    const pendingData: PendingChangeEmailSession = {
      userId,
      newEmail: input.newEmail
    };
    await redisPending.store(`change_email:${sessionKey}`, pendingData as unknown as Record<string, unknown>);

    // Send OTP to new email only
    await otpService.sendToEmail({
      flow: 'change_email',
      sessionKey,
      email: input.newEmail,
      userName
    });

    return {
      sessionKey,
      message: 'OTP sent to your new email. Please verify to complete the change.'
    };
  }

  /** Step 2: Verify OTP, update email, force logout */
  async changeEmailVerifyOtp(userId: number, sessionKey: string, emailOtp: string) {
    const pending = await redisPending.get<PendingChangeEmailSession>(`change_email:${sessionKey}`);
    if (!pending || pending.userId !== userId) {
      throw new AppError('Email change session expired or invalid.', 400, 'SESSION_EXPIRED');
    }

    await otpService.verifyEmail('change_email', sessionKey, emailOtp);

    // Re-check email (race condition guard)
    const emailExists = await authRepository.emailExists(pending.newEmail);
    if (emailExists) {
      throw new AppError('This email was registered by another user during verification.', 409, 'EMAIL_ALREADY_EXISTS');
    }

    // Get user info before update (for old email notification)
    const ceUser = await authRepository.findById(userId);
    const ceName = ceUser ? `${ceUser.user_first_name} ${ceUser.user_last_name}`.trim() : 'User';
    const oldEmail = ceUser?.user_email;

    // Update email (mark as verified)
    await authRepository.updateEmail(userId, pending.newEmail);

    // Clean up
    await otpService.cleanup('change_email', sessionKey);

    // Force logout
    await redisSession.revoke(String(userId));

    // Send notification to OLD email (fire-and-forget)
    if (oldEmail) {
      brevoService.sendToOne({
        to: oldEmail,
        toName: ceName,
        subject: 'Email Address Changed - Grow Up More',
        html: emailChangedNotifyTemplate(ceName, pending.newEmail)
      }).catch(() => {});
    }

    // Send welcome to NEW email (fire-and-forget)
    brevoService.sendToOne({
      to: pending.newEmail,
      toName: ceName,
      subject: 'Email Updated Successfully - Grow Up More',
      html: emailChangedWelcomeTemplate(ceName)
    }).catch(() => {});

    return { message: 'Email changed successfully. Please login with your new email.' };
  }

  /** Resend change-email OTP */
  async changeEmailResendOtp(userId: number, sessionKey: string) {
    const pending = await redisPending.get<PendingChangeEmailSession>(`change_email:${sessionKey}`);
    if (!pending || pending.userId !== userId) {
      throw new AppError('Email change session expired or invalid.', 400, 'SESSION_EXPIRED');
    }

    const user = await authRepository.findById(userId);
    const userName = user ? `${user.user_first_name} ${user.user_last_name}`.trim() : 'User';

    await otpService.sendToEmail({
      flow: 'change_email',
      sessionKey,
      email: pending.newEmail,
      userName
    });

    return { message: 'OTP resent to your new email.' };
  }

  // ─────────────────────────────────────────────────────────
  // 8. CHANGE MOBILE (authenticated, OTP to new mobile)
  // ─────────────────────────────────────────────────────────

  /** Step 1: Check new mobile not taken, send OTP to new mobile */
  async changeMobileInitiate(userId: number, input: ChangeMobileInitiateInput) {
    // Check new mobile not already registered
    const mobileExists = await authRepository.mobileExists(input.newMobile);
    if (mobileExists) {
      throw new AppError('This mobile number is already registered.', 409, 'MOBILE_ALREADY_EXISTS');
    }

    const user = await authRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }

    const sessionKey = generateSessionKey();
    const userName = `${user.user_first_name} ${user.user_last_name}`.trim();

    // Store pending session
    const pendingData: PendingChangeMobileSession = {
      userId,
      newMobile: input.newMobile
    };
    await redisPending.store(`change_mobile:${sessionKey}`, pendingData as unknown as Record<string, unknown>);

    // Send OTP to new mobile only
    await otpService.sendToMobile({
      flow: 'change_mobile',
      sessionKey,
      mobile: input.newMobile,
      userName
    });

    return {
      sessionKey,
      message: 'OTP sent to your new mobile. Please verify to complete the change.'
    };
  }

  /** Step 2: Verify OTP, update mobile, force logout */
  async changeMobileVerifyOtp(userId: number, sessionKey: string, mobileOtp: string) {
    const pending = await redisPending.get<PendingChangeMobileSession>(`change_mobile:${sessionKey}`);
    if (!pending || pending.userId !== userId) {
      throw new AppError('Mobile change session expired or invalid.', 400, 'SESSION_EXPIRED');
    }

    await otpService.verifyMobile('change_mobile', sessionKey, mobileOtp);

    // Re-check mobile (race condition guard)
    const mobileExists = await authRepository.mobileExists(pending.newMobile);
    if (mobileExists) {
      throw new AppError('This mobile was registered by another user during verification.', 409, 'MOBILE_ALREADY_EXISTS');
    }

    // Update mobile (mark as verified)
    await authRepository.updateMobile(userId, pending.newMobile);

    // Clean up
    await otpService.cleanup('change_mobile', sessionKey);

    // Force logout
    await redisSession.revoke(String(userId));

    // Send mobile changed confirmation email (fire-and-forget)
    const cmUser = await authRepository.findById(userId);
    if (cmUser?.user_email) {
      const cmName = `${cmUser.user_first_name} ${cmUser.user_last_name}`.trim();
      brevoService.sendToOne({
        to: cmUser.user_email,
        toName: cmName,
        subject: 'Mobile Number Changed - Grow Up More',
        html: mobileChangedTemplate(cmName, pending.newMobile)
      }).catch(() => {});
    }

    return { message: 'Mobile changed successfully. Please login again.' };
  }

  /** Resend change-mobile OTP */
  async changeMobileResendOtp(userId: number, sessionKey: string) {
    const pending = await redisPending.get<PendingChangeMobileSession>(`change_mobile:${sessionKey}`);
    if (!pending || pending.userId !== userId) {
      throw new AppError('Mobile change session expired or invalid.', 400, 'SESSION_EXPIRED');
    }

    const user = await authRepository.findById(userId);
    const userName = user ? `${user.user_first_name} ${user.user_last_name}`.trim() : 'User';

    await otpService.sendToMobile({
      flow: 'change_mobile',
      sessionKey,
      mobile: pending.newMobile,
      userName
    });

    return { message: 'OTP resent to your new mobile.' };
  }

  // ─────────────────────────────────────────────────────────
  // Private: Build Auth Response (JWT + user data)
  // ─────────────────────────────────────────────────────────

  private async buildAuthResponse(user: AuthUserRow) {
    const tokenPayload = {
      userId: user.user_id,
      email: user.user_email ?? ''
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    // Store refresh token in Redis for revocable sessions
    await redisSession.store(String(user.user_id), refreshToken);

    return {
      user: toPublicUser(user),
      tokens: {
        accessToken,
        refreshToken
      }
    };
  }
}

export const authService = new AuthService();
