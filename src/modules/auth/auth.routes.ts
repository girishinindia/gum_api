import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { recaptcha } from '../../middleware/recaptcha';
import { authMiddleware } from '../../middleware/auth';
import {
  registerSchema, verifyOtpSchema, resendOtpSchema, loginSchema, refreshSchema,
  forgotPasswordSchema, verifyResetOtpSchema, resendResetOtpSchema, resetPasswordSchema
} from './auth.schema';
import * as ctrl from './auth.controller';

const r = Router();

// ── Registration flow ──
r.post('/register',   recaptcha(), validate(registerSchema), ctrl.register);
r.post('/verify-otp', validate(verifyOtpSchema), ctrl.verifyOtp);
r.post('/resend-otp', validate(resendOtpSchema), ctrl.resendOtp);

// ── Login / Token ──
r.post('/login',    recaptcha(), validate(loginSchema), ctrl.login);
r.post('/refresh',  validate(refreshSchema), ctrl.refresh);
r.post('/logout',   authMiddleware, ctrl.logout);

// ── Forgot password flow ──
r.post('/forgot-password',    recaptcha(), validate(forgotPasswordSchema), ctrl.forgotPassword);
r.post('/verify-reset-otp',   validate(verifyResetOtpSchema), ctrl.verifyResetOtp);
r.post('/resend-reset-otp',   validate(resendResetOtpSchema), ctrl.resendResetOtp);
r.post('/reset-password',     validate(resetPasswordSchema), ctrl.resetPassword);

export default r;
