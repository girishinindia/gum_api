import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import * as otpSvc from '../../services/otp.service';
import { sendOtpEmail } from '../../services/email.service';
import { sendSms } from '../../services/sms.service';
import { logAuth } from '../../services/activityLog.service';
import { ok, err } from '../../utils/response';
import { getClientIp, generatePendingId, maskEmail, maskMobile } from '../../utils/helpers';

// ══════════════════════════════════════════════════════
// FLOW 1: CHANGE PASSWORD
// ══════════════════════════════════════════════════════

export async function changePasswordInitiate(req: Request, res: Response) {
  const userId = req.user!.id;
  const { old_password } = req.body;
  if (!old_password) return err(res, 'old_password is required', 400);

  const { data: user } = await supabase.from('users').select('id, first_name, email, mobile, password_hash').eq('id', userId).single();
  if (!user) return err(res, 'User not found', 404);

  const valid = await bcrypt.compare(old_password, user.password_hash);
  if (!valid) return err(res, 'Current password is incorrect', 400);

  const pendingId = generatePendingId();
  await otpSvc.storeProfileAction(pendingId, {
    purpose: 'change_password', user_id: userId, first_name: user.first_name,
    email: user.email, mobile: user.mobile, email_verified: false, mobile_verified: false,
  });

  const emailOtp = await otpSvc.storeAndGetProfileOTP(pendingId, 'email');
  const mobileOtp = await otpSvc.storeAndGetProfileOTP(pendingId, 'sms');
  await Promise.all([otpSvc.setCooldown(user.email), otpSvc.setCooldown(user.mobile)]);

  // Send both OTPs concurrently — don't let one failure block the other
  const [emailResult, smsResult] = await Promise.allSettled([
    sendOtpEmail(user.email, user.first_name, emailOtp, 'change_password'),
    sendSms(user.mobile, user.first_name, mobileOtp, 'reset_password'),
  ]);

  if (emailResult.status === 'rejected') console.error('[ChangePassword] Email OTP send failed:', emailResult.reason);
  if (smsResult.status === 'rejected') console.error('[ChangePassword] SMS OTP send failed:', smsResult.reason);

  if (emailResult.status === 'rejected' && smsResult.status === 'rejected') {
    return err(res, 'Failed to send OTPs. Please try again.', 500);
  }

  logAuth({ userId, action: 'change_password_initiated', identifier: user.email, ip: getClientIp(req) });

  return ok(res, {
    pending_id: pendingId, email: maskEmail(user.email), mobile: maskMobile(user.mobile),
    otp_expiry_seconds: config.otp.expirySeconds, resend_cooldown_seconds: config.otp.resendCooldown,
  }, 'OTP sent to both email and mobile');
}

export async function changePasswordVerifyOtp(req: Request, res: Response) {
  const { pending_id, channel, otp } = req.body;
  if (!pending_id || !channel || !otp) return err(res, 'pending_id, channel, otp required', 400);

  const action = await otpSvc.getProfileAction(pending_id);
  if (!action || action.purpose !== 'change_password') return err(res, 'Invalid or expired session', 400);

  const otpChannel: 'email' | 'sms' = channel === 'mobile' ? 'sms' : 'email';
  const result = await otpSvc.verifyProfileOTP(pending_id, otpChannel, otp);
  if (!result.valid) {
    if (result.reason === 'expired') return err(res, `${channel} OTP expired. Resend.`, 410);
    if (result.reason === 'max_attempts') return err(res, 'Max attempts. Resend OTP.', 429);
    return err(res, 'Invalid OTP', 400, { remaining_attempts: result.remaining });
  }

  if (channel === 'email') action.email_verified = true;
  else action.mobile_verified = true;
  await otpSvc.updateProfileAction(pending_id, action);

  const bothVerified = action.email_verified && action.mobile_verified;
  logAuth({ userId: action.user_id, action: `otp_verified_${otpChannel}`, identifier: channel === 'email' ? action.email : action.mobile, ip: getClientIp(req), metadata: { flow: 'change_password' } });

  return ok(res, {
    email_verified: action.email_verified, mobile_verified: action.mobile_verified,
    both_verified: bothVerified, can_set_password: bothVerified,
  }, `${channel} verified${bothVerified ? '. You can now set new password.' : '. Verify remaining channel.'}`);
}

export async function changePasswordConfirm(req: Request, res: Response) {
  const { pending_id, new_password } = req.body;
  if (!pending_id || !new_password) return err(res, 'pending_id and new_password required', 400);
  if (new_password.length < 8) return err(res, 'Password must be at least 8 characters', 400);

  const action = await otpSvc.getProfileAction(pending_id);
  if (!action || action.purpose !== 'change_password') return err(res, 'Invalid or expired session', 400);
  if (!action.email_verified || !action.mobile_verified) return err(res, 'Both OTPs must be verified first', 400);

  const userId = action.user_id;
  const passwordHash = await bcrypt.hash(new_password, config.bcrypt.saltRounds);

  await supabase.from('users').update({ password_hash: passwordHash, password_changed_at: new Date().toISOString() }).eq('id', userId);
  await supabase.from('login_sessions').update({ is_active: false, revoked_at: new Date().toISOString(), revoked_reason: 'password_changed' }).eq('user_id', userId).eq('is_active', true);
  await redis.del(`perms:${userId}`, `has_session:${userId}`);
  await otpSvc.cleanupProfile(pending_id);

  logAuth({ userId, action: 'password_changed', identifier: action.email, ip: getClientIp(req) });
  return ok(res, { logged_out: true }, 'Password changed successfully. Please sign in with your new password.');
}

export async function changePasswordResendOtp(req: Request, res: Response) {
  const { pending_id, channel } = req.body;
  if (!pending_id || !channel) return err(res, 'pending_id and channel required', 400);

  const action = await otpSvc.getProfileAction(pending_id);
  if (!action || action.purpose !== 'change_password') return err(res, 'Invalid or expired session', 400);

  const dest = channel === 'email' ? action.email : action.mobile;
  const cd = await otpSvc.checkCooldown(dest);
  if (!cd.ok) return err(res, `Wait ${cd.retryAfter}s before resending`, 429, { retry_after: cd.retryAfter });

  const otpChannel: 'email' | 'sms' = channel === 'mobile' ? 'sms' : 'email';
  const newOtp = await otpSvc.storeAndGetProfileOTP(pending_id, otpChannel);
  await otpSvc.setCooldown(dest);

  if (channel === 'email') await sendOtpEmail(action.email, action.first_name, newOtp, 'change_password');
  else await sendSms(action.mobile, action.first_name, newOtp, 'reset_password');

  return ok(res, { otp_expiry_seconds: config.otp.expirySeconds }, `OTP resent to ${channel}`);
}

// ══════════════════════════════════════════════════════
// FLOW 2: UPDATE EMAIL
// ══════════════════════════════════════════════════════

export async function updateEmailInitiate(req: Request, res: Response) {
  const userId = req.user!.id;
  const { new_email } = req.body;
  if (!new_email) return err(res, 'new_email is required', 400);
  const cleanEmail = new_email.trim().toLowerCase();

  const { data: user } = await supabase.from('users').select('id, first_name, email, mobile').eq('id', userId).single();
  if (!user) return err(res, 'User not found', 404);
  if (user.email === cleanEmail) return err(res, 'New email is same as current', 400);

  const { data: dup } = await supabase.from('users').select('id').eq('email', cleanEmail).neq('id', userId).limit(1);
  if (dup && dup.length > 0) return err(res, 'This email is already registered to another account', 409);

  const pendingId = generatePendingId();
  await otpSvc.storeProfileAction(pendingId, {
    purpose: 'update_email', user_id: userId, first_name: user.first_name,
    old_email: user.email, new_email: cleanEmail, mobile: user.mobile, otp_verified: false,
  });

  const emailOtp = await otpSvc.storeAndGetProfileOTP(pendingId, 'email');
  await otpSvc.setCooldown(cleanEmail);

  // Send both notifications concurrently
  const [emailRes, smsRes] = await Promise.allSettled([
    sendOtpEmail(cleanEmail, user.first_name, emailOtp, 'update_email'),
    sendSms(user.mobile, user.first_name, emailOtp, 'update_email'),
  ]);

  if (emailRes.status === 'rejected') console.error('[UpdateEmail] Email OTP send failed:', emailRes.reason);
  if (smsRes.status === 'rejected') console.error('[UpdateEmail] SMS notification send failed:', smsRes.reason);

  if (emailRes.status === 'rejected' && smsRes.status === 'rejected') {
    return err(res, 'Failed to send OTPs. Please try again.', 500);
  }

  logAuth({ userId, action: 'update_email_initiated', identifier: cleanEmail, ip: getClientIp(req), metadata: { old_email: user.email } });

  return ok(res, {
    pending_id: pendingId, new_email: maskEmail(cleanEmail),
    otp_expiry_seconds: config.otp.expirySeconds, resend_cooldown_seconds: config.otp.resendCooldown,
  }, 'OTP sent to new email');
}

export async function updateEmailVerifyOtp(req: Request, res: Response) {
  const { pending_id, otp } = req.body;
  if (!pending_id || !otp) return err(res, 'pending_id and otp required', 400);

  const action = await otpSvc.getProfileAction(pending_id);
  if (!action || action.purpose !== 'update_email') return err(res, 'Invalid or expired session', 400);

  const result = await otpSvc.verifyProfileOTP(pending_id, 'email', otp);
  if (!result.valid) {
    if (result.reason === 'expired') return err(res, 'OTP expired. Resend.', 410);
    if (result.reason === 'max_attempts') return err(res, 'Max attempts. Resend OTP.', 429);
    return err(res, 'Invalid OTP', 400, { remaining_attempts: result.remaining });
  }

  await supabase.from('users').update({ email: action.new_email }).eq('id', action.user_id);
  await supabase.from('login_sessions').update({ is_active: false, revoked_at: new Date().toISOString(), revoked_reason: 'email_changed' }).eq('user_id', action.user_id).eq('is_active', true);
  await redis.del(`perms:${action.user_id}`, `has_session:${action.user_id}`);
  await otpSvc.cleanupProfile(pending_id);

  logAuth({ userId: action.user_id, action: 'email_updated', identifier: action.new_email, ip: getClientIp(req), metadata: { old_email: action.old_email } });
  return ok(res, { logged_out: true, new_email: action.new_email }, 'Email updated. Please sign in with your new email.');
}

export async function updateEmailResendOtp(req: Request, res: Response) {
  const { pending_id } = req.body;
  if (!pending_id) return err(res, 'pending_id required', 400);
  const action = await otpSvc.getProfileAction(pending_id);
  if (!action || action.purpose !== 'update_email') return err(res, 'Invalid or expired session', 400);

  const cd = await otpSvc.checkCooldown(action.new_email);
  if (!cd.ok) return err(res, `Wait ${cd.retryAfter}s`, 429, { retry_after: cd.retryAfter });

  const newOtp = await otpSvc.storeAndGetProfileOTP(pending_id, 'email');
  await otpSvc.setCooldown(action.new_email);
  await sendOtpEmail(action.new_email, action.first_name, newOtp, 'update_email');

  return ok(res, { otp_expiry_seconds: config.otp.expirySeconds }, 'OTP resent to new email');
}

// ══════════════════════════════════════════════════════
// FLOW 3: UPDATE MOBILE
// ══════════════════════════════════════════════════════

export async function updateMobileInitiate(req: Request, res: Response) {
  const userId = req.user!.id;
  const { new_mobile } = req.body;
  if (!new_mobile) return err(res, 'new_mobile is required', 400);
  let cleanMobile = new_mobile.trim().replace(/\s+/g, '');
  if (/^\d{10}$/.test(cleanMobile)) cleanMobile = '+91' + cleanMobile;

  const { data: user } = await supabase.from('users').select('id, first_name, email, mobile').eq('id', userId).single();
  if (!user) return err(res, 'User not found', 404);
  if (user.mobile === cleanMobile) return err(res, 'New mobile is same as current', 400);

  const { data: dup } = await supabase.from('users').select('id').eq('mobile', cleanMobile).neq('id', userId).limit(1);
  if (dup && dup.length > 0) return err(res, 'This mobile is already registered to another account', 409);

  const pendingId = generatePendingId();
  await otpSvc.storeProfileAction(pendingId, {
    purpose: 'update_mobile', user_id: userId, first_name: user.first_name,
    email: user.email, old_mobile: user.mobile, new_mobile: cleanMobile, otp_verified: false,
  });

  const mobileOtp = await otpSvc.storeAndGetProfileOTP(pendingId, 'sms');
  await otpSvc.setCooldown(cleanMobile);

  await sendSms(cleanMobile, user.first_name, mobileOtp, 'update_mobile');

  logAuth({ userId, action: 'update_mobile_initiated', identifier: cleanMobile, ip: getClientIp(req), metadata: { old_mobile: user.mobile } });

  return ok(res, {
    pending_id: pendingId, new_mobile: maskMobile(cleanMobile),
    otp_expiry_seconds: config.otp.expirySeconds, resend_cooldown_seconds: config.otp.resendCooldown,
  }, 'OTP sent to new mobile');
}

export async function updateMobileVerifyOtp(req: Request, res: Response) {
  const { pending_id, otp } = req.body;
  if (!pending_id || !otp) return err(res, 'pending_id and otp required', 400);

  const action = await otpSvc.getProfileAction(pending_id);
  if (!action || action.purpose !== 'update_mobile') return err(res, 'Invalid or expired session', 400);

  const result = await otpSvc.verifyProfileOTP(pending_id, 'sms', otp);
  if (!result.valid) {
    if (result.reason === 'expired') return err(res, 'OTP expired. Resend.', 410);
    if (result.reason === 'max_attempts') return err(res, 'Max attempts. Resend OTP.', 429);
    return err(res, 'Invalid OTP', 400, { remaining_attempts: result.remaining });
  }

  await supabase.from('users').update({ mobile: action.new_mobile }).eq('id', action.user_id);
  await supabase.from('login_sessions').update({ is_active: false, revoked_at: new Date().toISOString(), revoked_reason: 'mobile_changed' }).eq('user_id', action.user_id).eq('is_active', true);
  await redis.del(`perms:${action.user_id}`, `has_session:${action.user_id}`);
  await otpSvc.cleanupProfile(pending_id);

  logAuth({ userId: action.user_id, action: 'mobile_updated', identifier: action.new_mobile, ip: getClientIp(req), metadata: { old_mobile: action.old_mobile } });
  return ok(res, { logged_out: true, new_mobile: action.new_mobile }, 'Mobile updated. Please sign in with your new mobile.');
}

export async function updateMobileResendOtp(req: Request, res: Response) {
  const { pending_id } = req.body;
  if (!pending_id) return err(res, 'pending_id required', 400);
  const action = await otpSvc.getProfileAction(pending_id);
  if (!action || action.purpose !== 'update_mobile') return err(res, 'Invalid or expired session', 400);

  const cd = await otpSvc.checkCooldown(action.new_mobile);
  if (!cd.ok) return err(res, `Wait ${cd.retryAfter}s`, 429, { retry_after: cd.retryAfter });

  const newOtp = await otpSvc.storeAndGetProfileOTP(pending_id, 'sms');
  await otpSvc.setCooldown(action.new_mobile);
  await sendSms(action.new_mobile, action.first_name, newOtp, 'update_mobile');

  return ok(res, { otp_expiry_seconds: config.otp.expirySeconds }, 'OTP resent to new mobile');
}
