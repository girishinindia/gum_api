import { Router } from 'express';

import { authMiddleware } from '../../../core/middlewares/auth.middleware';
import { authRateLimiter, otpResendRateLimiter } from '../../../core/middlewares/rate-limit.middleware';
import { recaptchaMiddleware } from '../../../core/middlewares/recaptcha.middleware';
import { validate } from '../../../core/middlewares/validate.middleware';

import {
  registerInitiateDto,
  registerVerifyOtpDto,
  registerResendOtpDto,
  loginDto,
  refreshDto,
  forgotPasswordInitiateDto,
  forgotPasswordVerifyOtpDto,
  forgotPasswordResetDto,
  forgotPasswordResendOtpDto,
  changePasswordInitiateDto,
  changePasswordVerifyOtpDto,
  changePasswordResendOtpDto,
  changeEmailInitiateDto,
  changeEmailVerifyOtpDto,
  changeEmailResendOtpDto,
  changeMobileInitiateDto,
  changeMobileVerifyOtpDto,
  changeMobileResendOtpDto
} from './auth.dto';

import {
  registerInitiate,
  registerVerifyOtp,
  registerResendOtp,
  login,
  refresh,
  logout,
  forgotPasswordInitiate,
  forgotPasswordVerifyOtp,
  forgotPasswordReset,
  forgotPasswordResendOtp,
  changePasswordInitiate,
  changePasswordVerifyOtp,
  changePasswordResendOtp,
  changeEmailInitiate,
  changeEmailVerifyOtp,
  changeEmailResendOtp,
  changeMobileInitiate,
  changeMobileVerifyOtp,
  changeMobileResendOtp
} from './auth.controller';

const authRoutes = Router();

// ═══════════════════════════════════════════════════════════
// Registration (public, multi-step with OTP)
// ═══════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/v1/auth/register/initiate:
 *   post:
 *     tags: [Auth]
 *     summary: Start registration
 *     description: Validates user details, checks email/mobile uniqueness, sends OTPs to email and mobile. Stores pending registration in Redis.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, email, mobile, password]
 *             properties:
 *               firstName: { type: string, minLength: 2, maxLength: 80, example: "Girish" }
 *               lastName: { type: string, minLength: 1, maxLength: 80, example: "Kumar" }
 *               email: { type: string, format: email, example: "girish@example.com" }
 *               mobile: { type: string, pattern: "^\\d{10}$", example: "9876543210" }
 *               password: { type: string, minLength: 8, maxLength: 128, example: "SecurePass1" }
 *               roleCode: { type: string, enum: [student, instructor], default: student, description: "Role to assign on registration. Defaults to student." }
 *               recaptchaToken: { type: string, description: "Required only when RECAPTCHA_ENABLED=true in production" }
 *     responses:
 *       200:
 *         description: OTPs sent to email and mobile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "OTPs sent for registration" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionKey: { type: string, example: "a1b2c3d4e5f6...", description: "Used for OTP verification" }
 *       400:
 *         description: Validation error (invalid email, weak password, etc.)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Validation failed" }
 *                 errors:
 *                   type: object
 *                   properties:
 *                     fieldErrors: { type: object }
 *                     formErrors: { type: array, items: { type: string } }
 *       409:
 *         description: Email or mobile already registered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Email already registered" }
 *                 code: { type: string, example: "EMAIL_ALREADY_REGISTERED" }
 *       429:
 *         description: Too many registration attempts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Rate limit exceeded" }
 *                 code: { type: string, example: "RATE_LIMIT_EXCEEDED" }
 */
authRoutes.post('/register/initiate', authRateLimiter, recaptchaMiddleware('REGISTER'), validate(registerInitiateDto), registerInitiate);
/**
 * @swagger
 * /api/v1/auth/register/verify-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify registration OTPs
 *     description: Verifies email and mobile OTPs, creates user account, auto-assigns role (student/instructor), returns access and refresh tokens.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionKey, emailOtp, mobileOtp]
 *             properties:
 *               sessionKey: { type: string, minLength: 20 }
 *               emailOtp: { type: string, minLength: 4, maxLength: 8 }
 *               mobileOtp: { type: string, minLength: 4, maxLength: 8 }
 *     responses:
 *       200:
 *         description: Registration successful, user account created, tokens returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Registration successful" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken: { type: string, description: "JWT access token" }
 *                     refreshToken: { type: string, description: "JWT refresh token" }
 *                     user:
 *                       type: object
 *                       properties:
 *                         id: { type: integer, example: 1 }
 *                         firstName: { type: string, example: "Girish" }
 *                         lastName: { type: string, example: "Kumar" }
 *                         email: { type: string, example: "girish@example.com" }
 *                         mobile: { type: string, example: "9876543210" }
 *                         isActive: { type: boolean, example: true }
 *                         isEmailVerified: { type: boolean, example: true }
 *                         isMobileVerified: { type: boolean, example: true }
 *       400:
 *         description: Invalid OTP, expired session, or race condition (duplicate registration)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Invalid OTP" }
 *                 code: { type: string, example: "INVALID_OTP" }
 *       409:
 *         description: Race condition - email or mobile registered by another request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Email already registered" }
 *                 code: { type: string, example: "EMAIL_ALREADY_REGISTERED" }
 */
authRoutes.post('/register/verify-otp', authRateLimiter, validate(registerVerifyOtpDto), registerVerifyOtp);
/**
 * @swagger
 * /api/v1/auth/register/resend-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Resend registration OTPs
 *     description: Resends OTPs for pending registration. Subject to cooldown and max resend limits.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionKey]
 *             properties:
 *               sessionKey: { type: string, minLength: 20 }
 *     responses:
 *       200:
 *         description: OTPs resent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "OTPs resent" }
 *                 data: { type: object }
 *       400:
 *         description: Session expired or cooldown period still active
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Session expired" }
 *                 code: { type: string, example: "SESSION_EXPIRED" }
 *       429:
 *         description: Too many resend attempts within the window
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Rate limit exceeded" }
 *                 code: { type: string, example: "RATE_LIMIT_EXCEEDED" }
 */
authRoutes.post('/register/resend-otp', otpResendRateLimiter, validate(registerResendOtpDto), registerResendOtp);

// ═══════════════════════════════════════════════════════════
// Login / Refresh / Logout
// ═══════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login
 *     description: Authenticates user with email and password. Returns access token, refresh token, and user profile.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: "girish@example.com" }
 *               password: { type: string, minLength: 8, maxLength: 128 }
 *               recaptchaToken: { type: string, description: "Required only when RECAPTCHA_ENABLED=true" }
 *     responses:
 *       200:
 *         description: Login successful, credentials verified
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Login successful" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken: { type: string, description: "JWT access token" }
 *                     refreshToken: { type: string, description: "JWT refresh token" }
 *                     user:
 *                       type: object
 *                       properties:
 *                         id: { type: integer, example: 1 }
 *                         firstName: { type: string, example: "Girish" }
 *                         lastName: { type: string, example: "Kumar" }
 *                         email: { type: string, example: "girish@example.com" }
 *                         mobile: { type: string, example: "9876543210" }
 *                         isActive: { type: boolean, example: true }
 *                         isEmailVerified: { type: boolean, example: true }
 *                         isMobileVerified: { type: boolean, example: true }
 *       400:
 *         description: Validation error (invalid email format, missing fields)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Validation failed" }
 *                 errors:
 *                   type: object
 *                   properties:
 *                     fieldErrors: { type: object }
 *                     formErrors: { type: array, items: { type: string } }
 *       401:
 *         description: Invalid email or password
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Invalid credentials" }
 *                 code: { type: string, example: "INVALID_CREDENTIALS" }
 *       429:
 *         description: Too many login attempts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Rate limit exceeded" }
 *                 code: { type: string, example: "RATE_LIMIT_EXCEEDED" }
 */
authRoutes.post('/login', authRateLimiter, recaptchaMiddleware('LOGIN'), validate(loginDto), login);
/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 *     description: Exchanges a valid refresh token for a new access token.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string, minLength: 20 }
 *     responses:
 *       200:
 *         description: New access token generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Access token refreshed" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken: { type: string, description: "New JWT access token" }
 *       401:
 *         description: Invalid, expired, or revoked refresh token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Invalid refresh token" }
 *                 code: { type: string, example: "INVALID_REFRESH_TOKEN" }
 */
authRoutes.post('/refresh', authRateLimiter, validate(refreshDto), refresh);
/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout
 *     description: Revokes the current session from Redis. Access token becomes invalid immediately.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Session revoked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Logged out successfully" }
 *                 data: { type: object }
 *       401:
 *         description: Not authenticated (missing or invalid JWT)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Not authenticated" }
 *                 code: { type: string, example: "NOT_AUTHENTICATED" }
 */
authRoutes.post('/logout', authMiddleware, logout);

// ═══════════════════════════════════════════════════════════
// Forgot Password (public, multi-step with OTP)
// ═══════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/v1/auth/forgot-password/initiate:
 *   post:
 *     tags: [Auth]
 *     summary: Start password reset
 *     description: Sends OTPs to email and mobile for password reset verification.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, mobile]
 *             properties:
 *               email: { type: string, format: email }
 *               mobile: { type: string, pattern: "^\\d{10}$" }
 *     responses:
 *       200:
 *         description: Reset OTPs sent to email and mobile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Reset OTPs sent" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionKey: { type: string, description: "Used for OTP verification" }
 *       400:
 *         description: Validation error (invalid email or mobile format)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Validation failed" }
 *                 errors: { type: object }
 *       404:
 *         description: User not found (email and mobile don't match any account)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "User not found" }
 *                 code: { type: string, example: "USER_NOT_FOUND" }
 *       429:
 *         description: Too many password reset attempts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Rate limit exceeded" }
 *                 code: { type: string, example: "RATE_LIMIT_EXCEEDED" }
 */
authRoutes.post('/forgot-password/initiate', authRateLimiter, validate(forgotPasswordInitiateDto), forgotPasswordInitiate);
/**
 * @swagger
 * /api/v1/auth/forgot-password/verify-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify password reset OTPs
 *     description: Verifies both OTPs and returns a reset token for setting the new password.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionKey, emailOtp, mobileOtp]
 *             properties:
 *               sessionKey: { type: string }
 *               emailOtp: { type: string }
 *               mobileOtp: { type: string }
 *     responses:
 *       200:
 *         description: OTPs verified, reset token issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "OTPs verified" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     resetToken: { type: string, description: "Token for password reset" }
 *       400:
 *         description: Invalid OTP or session expired
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Invalid OTP" }
 *                 code: { type: string, example: "INVALID_OTP" }
 */
authRoutes.post('/forgot-password/verify-otp', authRateLimiter, validate(forgotPasswordVerifyOtpDto), forgotPasswordVerifyOtp);
/**
 * @swagger
 * /api/v1/auth/forgot-password/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Set new password
 *     description: Sets a new password using the reset token obtained from verify-otp.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resetToken, newPassword]
 *             properties:
 *               resetToken: { type: string }
 *               newPassword: { type: string, minLength: 8, maxLength: 128 }
 *     responses:
 *       200:
 *         description: Password updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Password reset successful" }
 *                 data: { type: object }
 *       400:
 *         description: Invalid, expired, or malformed reset token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Invalid reset token" }
 *                 code: { type: string, example: "INVALID_RESET_TOKEN" }
 */
authRoutes.post('/forgot-password/reset-password', authRateLimiter, validate(forgotPasswordResetDto), forgotPasswordReset);
/**
 * @swagger
 * /api/v1/auth/forgot-password/resend-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Resend password reset OTPs
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionKey]
 *             properties:
 *               sessionKey: { type: string }
 *     responses:
 *       200:
 *         description: Reset OTPs resent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "OTPs resent" }
 *                 data: { type: object }
 *       400:
 *         description: Session expired or cooldown period active
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Session expired" }
 *                 code: { type: string, example: "SESSION_EXPIRED" }
 *       429:
 *         description: Too many resend attempts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Rate limit exceeded" }
 *                 code: { type: string, example: "RATE_LIMIT_EXCEEDED" }
 */
authRoutes.post('/forgot-password/resend-otp', otpResendRateLimiter, validate(forgotPasswordResendOtpDto), forgotPasswordResendOtp);

// ═══════════════════════════════════════════════════════════
// Change Password (authenticated, multi-step with OTP)
// ═══════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/v1/auth/change-password/initiate:
 *   post:
 *     tags: [Auth]
 *     summary: Start password change
 *     description: Verifies old password, sends OTPs to email and mobile for confirmation.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oldPassword, newPassword]
 *             properties:
 *               oldPassword: { type: string }
 *               newPassword: { type: string, minLength: 8, maxLength: 128 }
 *     responses:
 *       200:
 *         description: Old password verified, confirmation OTPs sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Confirmation OTPs sent" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionKey: { type: string, description: "For OTP verification" }
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Validation failed" }
 *                 errors: { type: object }
 *       401:
 *         description: Not authenticated or old password incorrect
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Old password incorrect" }
 *                 code: { type: string, example: "INVALID_PASSWORD" }
 */
authRoutes.post('/change-password/initiate', authMiddleware, authRateLimiter, validate(changePasswordInitiateDto), changePasswordInitiate);
/**
 * @swagger
 * /api/v1/auth/change-password/verify-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify password change OTPs
 *     description: Verifies OTPs and changes password. Forces logout from all sessions.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionKey, emailOtp, mobileOtp]
 *             properties:
 *               sessionKey: { type: string }
 *               emailOtp: { type: string }
 *               mobileOtp: { type: string }
 *     responses:
 *       200:
 *         description: Password changed, all sessions revoked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Password changed successfully" }
 *                 data: { type: object }
 *       400:
 *         description: Invalid OTP or session expired
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Invalid OTP" }
 *                 code: { type: string, example: "INVALID_OTP" }
 */
authRoutes.post('/change-password/verify-otp', authMiddleware, authRateLimiter, validate(changePasswordVerifyOtpDto), changePasswordVerifyOtp);
/**
 * @swagger
 * /api/v1/auth/change-password/resend-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Resend password change OTPs
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionKey]
 *             properties:
 *               sessionKey: { type: string }
 *     responses:
 *       200:
 *         description: OTPs resent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "OTPs resent" }
 *                 data: { type: object }
 *       429:
 *         description: Too many resend attempts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Rate limit exceeded" }
 *                 code: { type: string, example: "RATE_LIMIT_EXCEEDED" }
 */
authRoutes.post('/change-password/resend-otp', authMiddleware, otpResendRateLimiter, validate(changePasswordResendOtpDto), changePasswordResendOtp);

// ═══════════════════════════════════════════════════════════
// Change Email (authenticated, multi-step with OTP)
// ═══════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/v1/auth/change-email/initiate:
 *   post:
 *     tags: [Auth]
 *     summary: Start email change
 *     description: Sends OTP to the new email address for verification.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newEmail]
 *             properties:
 *               newEmail: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Verification OTP sent to new email
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "OTP sent to new email" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionKey: { type: string, description: "For OTP verification" }
 *       400:
 *         description: Validation error (invalid email format)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Validation failed" }
 *                 errors: { type: object }
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Not authenticated" }
 *                 code: { type: string, example: "NOT_AUTHENTICATED" }
 *       409:
 *         description: Email already registered to another account
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Email already registered" }
 *                 code: { type: string, example: "EMAIL_ALREADY_REGISTERED" }
 */
authRoutes.post('/change-email/initiate', authMiddleware, authRateLimiter, validate(changeEmailInitiateDto), changeEmailInitiate);
/**
 * @swagger
 * /api/v1/auth/change-email/verify-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify email change OTP
 *     description: Verifies OTP and updates email. Forces logout from all sessions.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionKey, emailOtp]
 *             properties:
 *               sessionKey: { type: string }
 *               emailOtp: { type: string }
 *     responses:
 *       200:
 *         description: Email updated, all sessions revoked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Email changed successfully" }
 *                 data: { type: object }
 *       400:
 *         description: Invalid OTP or session expired
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Invalid OTP" }
 *                 code: { type: string, example: "INVALID_OTP" }
 */
authRoutes.post('/change-email/verify-otp', authMiddleware, authRateLimiter, validate(changeEmailVerifyOtpDto), changeEmailVerifyOtp);
/**
 * @swagger
 * /api/v1/auth/change-email/resend-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Resend email change OTP
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionKey]
 *             properties:
 *               sessionKey: { type: string }
 *     responses:
 *       200:
 *         description: OTP resent to email
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "OTP resent" }
 *                 data: { type: object }
 *       429:
 *         description: Too many resend attempts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Rate limit exceeded" }
 *                 code: { type: string, example: "RATE_LIMIT_EXCEEDED" }
 */
authRoutes.post('/change-email/resend-otp', authMiddleware, otpResendRateLimiter, validate(changeEmailResendOtpDto), changeEmailResendOtp);

// ═══════════════════════════════════════════════════════════
// Change Mobile (authenticated, multi-step with OTP)
// ═══════════════════════════════════════════════════════════

/**
 * @swagger
 * /api/v1/auth/change-mobile/initiate:
 *   post:
 *     tags: [Auth]
 *     summary: Start mobile change
 *     description: Sends OTP to the new mobile number for verification.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newMobile]
 *             properties:
 *               newMobile: { type: string, pattern: "^\\d{10}$" }
 *     responses:
 *       200:
 *         description: Verification OTP sent to new mobile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "OTP sent to new mobile" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionKey: { type: string, description: "For OTP verification" }
 *       400:
 *         description: Validation error (invalid mobile format)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Validation failed" }
 *                 errors: { type: object }
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Not authenticated" }
 *                 code: { type: string, example: "NOT_AUTHENTICATED" }
 *       409:
 *         description: Mobile number already registered to another account
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Mobile already registered" }
 *                 code: { type: string, example: "MOBILE_ALREADY_REGISTERED" }
 */
authRoutes.post('/change-mobile/initiate', authMiddleware, authRateLimiter, validate(changeMobileInitiateDto), changeMobileInitiate);
/**
 * @swagger
 * /api/v1/auth/change-mobile/verify-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify mobile change OTP
 *     description: Verifies OTP and updates mobile number. Forces logout from all sessions.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionKey, mobileOtp]
 *             properties:
 *               sessionKey: { type: string }
 *               mobileOtp: { type: string }
 *     responses:
 *       200:
 *         description: Mobile updated, all sessions revoked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Mobile changed successfully" }
 *                 data: { type: object }
 *       400:
 *         description: Invalid OTP or session expired
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Invalid OTP" }
 *                 code: { type: string, example: "INVALID_OTP" }
 */
authRoutes.post('/change-mobile/verify-otp', authMiddleware, authRateLimiter, validate(changeMobileVerifyOtpDto), changeMobileVerifyOtp);
/**
 * @swagger
 * /api/v1/auth/change-mobile/resend-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Resend mobile change OTP
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionKey]
 *             properties:
 *               sessionKey: { type: string }
 *     responses:
 *       200:
 *         description: OTP resent to mobile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "OTP resent" }
 *                 data: { type: object }
 *       429:
 *         description: Too many resend attempts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Rate limit exceeded" }
 *                 code: { type: string, example: "RATE_LIMIT_EXCEEDED" }
 */
authRoutes.post('/change-mobile/resend-otp', authMiddleware, otpResendRateLimiter, validate(changeMobileResendOtpDto), changeMobileResendOtp);

export { authRoutes };
