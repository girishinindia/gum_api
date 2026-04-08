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

authRoutes.post('/register/initiate', authRateLimiter, recaptchaMiddleware('REGISTER'), validate(registerInitiateDto), registerInitiate);
authRoutes.post('/register/verify-otp', authRateLimiter, validate(registerVerifyOtpDto), registerVerifyOtp);
authRoutes.post('/register/resend-otp', otpResendRateLimiter, validate(registerResendOtpDto), registerResendOtp);

// ═══════════════════════════════════════════════════════════
// Login / Refresh / Logout
// ═══════════════════════════════════════════════════════════

authRoutes.post('/login', authRateLimiter, recaptchaMiddleware('LOGIN'), validate(loginDto), login);
authRoutes.post('/refresh', authRateLimiter, validate(refreshDto), refresh);
authRoutes.post('/logout', authMiddleware, logout);

// ═══════════════════════════════════════════════════════════
// Forgot Password (public, multi-step with OTP)
// ═══════════════════════════════════════════════════════════

authRoutes.post('/forgot-password/initiate', authRateLimiter, validate(forgotPasswordInitiateDto), forgotPasswordInitiate);
authRoutes.post('/forgot-password/verify-otp', authRateLimiter, validate(forgotPasswordVerifyOtpDto), forgotPasswordVerifyOtp);
authRoutes.post('/forgot-password/reset-password', authRateLimiter, validate(forgotPasswordResetDto), forgotPasswordReset);
authRoutes.post('/forgot-password/resend-otp', otpResendRateLimiter, validate(forgotPasswordResendOtpDto), forgotPasswordResendOtp);

// ═══════════════════════════════════════════════════════════
// Change Password (authenticated, multi-step with OTP)
// ═══════════════════════════════════════════════════════════

authRoutes.post('/change-password/initiate', authMiddleware, authRateLimiter, validate(changePasswordInitiateDto), changePasswordInitiate);
authRoutes.post('/change-password/verify-otp', authMiddleware, authRateLimiter, validate(changePasswordVerifyOtpDto), changePasswordVerifyOtp);
authRoutes.post('/change-password/resend-otp', authMiddleware, otpResendRateLimiter, validate(changePasswordResendOtpDto), changePasswordResendOtp);

// ═══════════════════════════════════════════════════════════
// Change Email (authenticated, multi-step with OTP)
// ═══════════════════════════════════════════════════════════

authRoutes.post('/change-email/initiate', authMiddleware, authRateLimiter, validate(changeEmailInitiateDto), changeEmailInitiate);
authRoutes.post('/change-email/verify-otp', authMiddleware, authRateLimiter, validate(changeEmailVerifyOtpDto), changeEmailVerifyOtp);
authRoutes.post('/change-email/resend-otp', authMiddleware, otpResendRateLimiter, validate(changeEmailResendOtpDto), changeEmailResendOtp);

// ═══════════════════════════════════════════════════════════
// Change Mobile (authenticated, multi-step with OTP)
// ═══════════════════════════════════════════════════════════

authRoutes.post('/change-mobile/initiate', authMiddleware, authRateLimiter, validate(changeMobileInitiateDto), changeMobileInitiate);
authRoutes.post('/change-mobile/verify-otp', authMiddleware, authRateLimiter, validate(changeMobileVerifyOtpDto), changeMobileVerifyOtp);
authRoutes.post('/change-mobile/resend-otp', authMiddleware, otpResendRateLimiter, validate(changeMobileResendOtpDto), changeMobileResendOtp);

export { authRoutes };
