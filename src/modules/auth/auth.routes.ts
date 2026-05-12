import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { recaptcha } from '../../middleware/recaptcha';
import { authMiddleware } from '../../middleware/auth';
import { authLimiter, otpLimiter, passwordResetLimiter } from '../../middleware/rateLimiter';
import {
  registerSchema, verifyOtpSchema, resendOtpSchema, loginSchema, refreshSchema,
  forgotPasswordSchema, verifyResetOtpSchema, resendResetOtpSchema, resetPasswordSchema
} from './auth.schema';
import * as ctrl from './auth.controller';

const r = Router();

// ── Registration flow ──

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     description: Creates an unverified account and sends an OTP to the user's email/phone.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string, example: "John Doe" }
 *               email: { type: string, format: email }
 *               phone: { type: string, example: "9876543210" }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       201: { description: OTP sent successfully }
 *       400: { description: Validation error, $ref: '#/components/schemas/Error' }
 *       429: { description: Rate limited }
 */
r.post('/register',   authLimiter, recaptcha(), validate(registerSchema), ctrl.register);

/**
 * @openapi
 * /auth/verify-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify registration OTP
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email: { type: string, format: email }
 *               otp: { type: string, example: "123456" }
 *     responses:
 *       200: { description: Account verified, returns tokens }
 *       400: { description: Invalid or expired OTP }
 */
r.post('/verify-otp', otpLimiter, validate(verifyOtpSchema), ctrl.verifyOtp);

/**
 * @openapi
 * /auth/resend-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Resend registration OTP
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: OTP resent }
 *       429: { description: Cooldown active }
 */
r.post('/resend-otp', otpLimiter, validate(resendOtpSchema), ctrl.resendOtp);

// ── Login / Token ──

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email and password
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200: { description: Returns access and refresh tokens }
 *       401: { description: Invalid credentials }
 */
r.post('/login',    authLimiter, recaptcha(), validate(loginSchema), ctrl.login);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: New access token }
 *       401: { description: Invalid or expired refresh token }
 */
r.post('/refresh',  validate(refreshSchema), ctrl.refresh);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout (invalidate refresh token)
 *     responses:
 *       200: { description: Logged out }
 */
r.post('/logout',   authMiddleware, ctrl.logout);

// ── Forgot password flow ──

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request password reset OTP
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: OTP sent to email }
 */
r.post('/forgot-password',    authLimiter, recaptcha(), validate(forgotPasswordSchema), ctrl.forgotPassword);

/**
 * @openapi
 * /auth/verify-reset-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify password reset OTP
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email: { type: string, format: email }
 *               otp: { type: string }
 *     responses:
 *       200: { description: OTP verified, returns reset token }
 */
r.post('/verify-reset-otp',   otpLimiter, validate(verifyResetOtpSchema), ctrl.verifyResetOtp);

/**
 * @openapi
 * /auth/resend-reset-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Resend password reset OTP
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: OTP resent }
 */
r.post('/resend-reset-otp',   otpLimiter, validate(resendResetOtpSchema), ctrl.resendResetOtp);

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password with verified token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, resetToken, newPassword]
 *             properties:
 *               email: { type: string, format: email }
 *               resetToken: { type: string }
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       200: { description: Password updated }
 */
r.post('/reset-password',     passwordResetLimiter, validate(resetPasswordSchema), ctrl.resetPassword);

export default r;
