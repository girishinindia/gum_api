import { Request, Response } from 'express';

import { sendSuccess } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { authService } from '../../../modules/auth/auth.service';

// ═══════════════════════════════════════════════════════════
// REGISTRATION
// ═══════════════════════════════════════════════════════════

export const registerInitiate = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.registerInitiate(req.body);
  return sendSuccess(res, result, 'OTPs sent for registration');
});

export const registerVerifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const { sessionKey, emailOtp, mobileOtp } = req.body;
  const result = await authService.registerVerifyOtp(sessionKey, emailOtp, mobileOtp);
  return sendSuccess(res, result, 'User registered successfully', 201);
});

export const registerResendOtp = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.registerResendOtp(req.body.sessionKey);
  return sendSuccess(res, result, 'OTPs resent');
});

// ═══════════════════════════════════════════════════════════
// LOGIN / REFRESH / LOGOUT
// ═══════════════════════════════════════════════════════════

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body);
  return sendSuccess(res, result, 'Login successful');
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.refresh(req.body.refreshToken);
  return sendSuccess(res, result, 'Token refreshed');
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const userId = String(req.user!.userId);
  const result = await authService.logout(userId);
  return sendSuccess(res, result, 'Logged out successfully');
});

// ═══════════════════════════════════════════════════════════
// FORGOT PASSWORD
// ═══════════════════════════════════════════════════════════

export const forgotPasswordInitiate = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.forgotPasswordInitiate(req.body);
  return sendSuccess(res, result, 'OTPs sent for password reset');
});

export const forgotPasswordVerifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const { sessionKey, emailOtp, mobileOtp } = req.body;
  const result = await authService.forgotPasswordVerifyOtp(sessionKey, emailOtp, mobileOtp);
  return sendSuccess(res, result, 'OTPs verified');
});

export const forgotPasswordReset = asyncHandler(async (req: Request, res: Response) => {
  const { resetToken, newPassword } = req.body;
  const result = await authService.forgotPasswordReset(resetToken, newPassword);
  return sendSuccess(res, result, 'Password reset successfully');
});

export const forgotPasswordResendOtp = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.forgotPasswordResendOtp(req.body.sessionKey);
  return sendSuccess(res, result, 'OTPs resent');
});

// ═══════════════════════════════════════════════════════════
// CHANGE PASSWORD (authenticated)
// ═══════════════════════════════════════════════════════════

export const changePasswordInitiate = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const result = await authService.changePasswordInitiate(userId, req.body);
  return sendSuccess(res, result, 'OTPs sent for password change');
});

export const changePasswordVerifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { sessionKey, emailOtp, mobileOtp } = req.body;
  const result = await authService.changePasswordVerifyOtp(userId, sessionKey, emailOtp, mobileOtp);
  return sendSuccess(res, result, 'Password changed successfully');
});

export const changePasswordResendOtp = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const result = await authService.changePasswordResendOtp(userId, req.body.sessionKey);
  return sendSuccess(res, result, 'OTPs resent');
});

// ═══════════════════════════════════════════════════════════
// CHANGE EMAIL (authenticated)
// ═══════════════════════════════════════════════════════════

export const changeEmailInitiate = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const result = await authService.changeEmailInitiate(userId, req.body);
  return sendSuccess(res, result, 'OTP sent for email change');
});

export const changeEmailVerifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { sessionKey, emailOtp } = req.body;
  const result = await authService.changeEmailVerifyOtp(userId, sessionKey, emailOtp);
  return sendSuccess(res, result, 'Email changed successfully');
});

export const changeEmailResendOtp = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const result = await authService.changeEmailResendOtp(userId, req.body.sessionKey);
  return sendSuccess(res, result, 'OTP resent');
});

// ═══════════════════════════════════════════════════════════
// CHANGE MOBILE (authenticated)
// ═══════════════════════════════════════════════════════════

export const changeMobileInitiate = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const result = await authService.changeMobileInitiate(userId, req.body);
  return sendSuccess(res, result, 'OTP sent for mobile change');
});

export const changeMobileVerifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { sessionKey, mobileOtp } = req.body;
  const result = await authService.changeMobileVerifyOtp(userId, sessionKey, mobileOtp);
  return sendSuccess(res, result, 'Mobile changed successfully');
});

export const changeMobileResendOtp = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const result = await authService.changeMobileResendOtp(userId, req.body.sessionKey);
  return sendSuccess(res, result, 'OTP resent');
});
