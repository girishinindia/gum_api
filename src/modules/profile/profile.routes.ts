import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions } from '../../middleware/rbac';
import * as ctrl from './profile.controller';

const r = Router();
r.use(authMiddleware, attachPermissions());

// Change password (requires dual OTP: email + mobile)
r.post('/change-password/initiate',    ctrl.changePasswordInitiate);
r.post('/change-password/verify-otp',  ctrl.changePasswordVerifyOtp);
r.post('/change-password/confirm',     ctrl.changePasswordConfirm);
r.post('/change-password/resend-otp',  ctrl.changePasswordResendOtp);

// Update email (OTP to new email)
r.post('/update-email/initiate',       ctrl.updateEmailInitiate);
r.post('/update-email/verify-otp',     ctrl.updateEmailVerifyOtp);
r.post('/update-email/resend-otp',     ctrl.updateEmailResendOtp);

// Update mobile (OTP to new mobile)
r.post('/update-mobile/initiate',      ctrl.updateMobileInitiate);
r.post('/update-mobile/verify-otp',    ctrl.updateMobileVerifyOtp);
r.post('/update-mobile/resend-otp',    ctrl.updateMobileResendOtp);

export default r;
