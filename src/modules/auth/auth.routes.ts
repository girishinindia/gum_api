import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { recaptcha } from '../../middleware/recaptcha';
import { authMiddleware } from '../../middleware/auth';
import { registerSchema, verifyOtpSchema, resendOtpSchema, loginSchema, refreshSchema } from './auth.schema';
import * as ctrl from './auth.controller';

const r = Router();
r.post('/register',   recaptcha(), validate(registerSchema), ctrl.register);
r.post('/verify-otp', validate(verifyOtpSchema), ctrl.verifyOtp);
r.post('/resend-otp', validate(resendOtpSchema), ctrl.resendOtp);
r.post('/login',      recaptcha(), validate(loginSchema), ctrl.login);
r.post('/refresh',    validate(refreshSchema), ctrl.refresh);
r.post('/logout',     authMiddleware, ctrl.logout);
export default r;
