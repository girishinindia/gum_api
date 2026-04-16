import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { config } from '../../config';
import { supabase } from '../../config/supabase';
import * as otpSvc from '../../services/otp.service';
import { sendOtpEmail } from '../../services/email.service';
import { sendOtpSms } from '../../services/sms.service';
import { generateTokens, verifyRefresh } from '../../services/token.service';
import { logAuth, logAdmin } from '../../services/activityLog.service';
import { ok, err } from '../../utils/response';
import { normalizeMobile, generatePendingId, hashSha256, maskEmail, maskMobile, getClientIp, getDeviceType } from '../../utils/helpers';

export async function register(req: Request, res: Response) {
  const { first_name, last_name, email, mobile, password } = (req as any).validated;
  const cleanEmail = email.trim().toLowerCase();
  const cleanMobile = normalizeMobile(mobile);
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || null;

  const { data: emailOk } = await supabase.rpc('is_email_available', { p_email: cleanEmail });
  if (!emailOk) return err(res, 'Email already registered', 409);

  const { data: mobileOk } = await supabase.rpc('is_mobile_available', { p_mobile: cleanMobile });
  if (!mobileOk) return err(res, 'Mobile already registered', 409);

  for (const dest of [cleanEmail, cleanMobile]) {
    if (!(await otpSvc.checkRateLimit(dest))) return err(res, 'Too many attempts. Try after 1 hour.', 429);
  }

  const passwordHash = await bcrypt.hash(password, config.bcrypt.saltRounds);
  const pendingId = generatePendingId();

  await otpSvc.storeRegistration(pendingId, { first_name: first_name.trim(), last_name: last_name.trim(), email: cleanEmail, mobile: cleanMobile, password_hash: passwordHash, email_verified: false, mobile_verified: false });

  const emailOtp = await otpSvc.storeAndGetOTP(pendingId, 'email');
  const mobileOtp = await otpSvc.storeAndGetOTP(pendingId, 'sms');
  await otpSvc.setCooldown(cleanEmail);
  await otpSvc.setCooldown(cleanMobile);

  await sendOtpEmail(cleanEmail, first_name.trim(), emailOtp);
  await sendOtpSms(cleanMobile, first_name.trim(), mobileOtp);

  logAuth({ action: 'register_initiated', identifier: cleanEmail, ip, userAgent: ua });
  logAuth({ action: 'otp_sent_email', identifier: cleanEmail, ip });
  logAuth({ action: 'otp_sent_sms', identifier: cleanMobile, ip });

  return ok(res, { pending_id: pendingId, email: maskEmail(cleanEmail), mobile: maskMobile(cleanMobile), otp_expiry_seconds: config.otp.expirySeconds, resend_cooldown_seconds: config.otp.resendCooldown }, 'OTP sent to both email and mobile');
}

export async function verifyOtp(req: Request, res: Response) {
  const { pending_id, channel, otp } = (req as any).validated;
  const ip = getClientIp(req);

  const reg = await otpSvc.getRegistration(pending_id);
  if (!reg) return err(res, 'Registration expired. Start again.', 410);

  const otpChannel = channel === 'mobile' ? 'sms' : 'email';
  const result = await otpSvc.verifyOTP(pending_id, otpChannel, otp);

  if (!result.valid) {
    logAuth({ action: `otp_failed_${otpChannel}`, identifier: channel === 'email' ? reg.email : reg.mobile, ip, metadata: { reason: result.reason } });
    if (result.reason === 'expired') return err(res, `${channel} OTP expired. Resend.`, 410);
    if (result.reason === 'max_attempts') return err(res, 'Max attempts. Resend OTP.', 429);
    return err(res, 'Invalid OTP', 400, { remaining_attempts: result.remaining });
  }

  if (channel === 'email') reg.email_verified = true;
  else reg.mobile_verified = true;
  await otpSvc.updateRegistration(pending_id, reg);

  logAuth({ action: `otp_verified_${otpChannel}`, identifier: channel === 'email' ? reg.email : reg.mobile, ip });

  if (reg.email_verified && reg.mobile_verified) {
    const { data: userId, error: dbErr } = await supabase.rpc('create_verified_user', { p_first_name: reg.first_name, p_last_name: reg.last_name, p_email: reg.email, p_mobile: reg.mobile, p_password_hash: reg.password_hash });
    if (dbErr) return err(res, 'Account creation failed', 500);

    const tokens = generateTokens(userId);
    await supabase.rpc('create_session', { p_user_id: userId, p_login_method: 'email_password', p_refresh_hash: hashSha256(tokens.refresh_token), p_ip: ip, p_user_agent: req.headers['user-agent'] || null, p_device_type: getDeviceType(req.headers['user-agent']) });
    await otpSvc.cleanup(pending_id);

    logAuth({ userId, action: 'register_completed', identifier: reg.email, ip, userAgent: req.headers['user-agent'] || null, deviceType: getDeviceType(req.headers['user-agent']) });

    return ok(res, { user: { id: userId, first_name: reg.first_name, last_name: reg.last_name, email: reg.email, mobile: reg.mobile }, ...tokens }, 'Registration complete!', 201);
  }

  return ok(res, { both_verified: false, email_verified: reg.email_verified, mobile_verified: reg.mobile_verified }, `${channel} verified`);
}

export async function resendOtp(req: Request, res: Response) {
  const { pending_id, channel } = (req as any).validated;
  const ip = getClientIp(req);

  const reg = await otpSvc.getRegistration(pending_id);
  if (!reg) return err(res, 'Registration expired', 410);
  if (channel === 'email' && reg.email_verified) return err(res, 'Email already verified', 400);
  if (channel === 'mobile' && reg.mobile_verified) return err(res, 'Mobile already verified', 400);

  const dest = channel === 'email' ? reg.email : reg.mobile;
  const cd = await otpSvc.checkCooldown(dest);
  if (!cd.ok) return err(res, `Wait ${cd.retryAfter} seconds`, 429);
  if (!(await otpSvc.checkRateLimit(dest))) return err(res, 'Too many OTPs', 429);

  const otpChannel = channel === 'mobile' ? 'sms' : 'email';
  const newOtp = await otpSvc.storeAndGetOTP(pending_id, otpChannel);
  await otpSvc.setCooldown(dest);

  if (channel === 'email') await sendOtpEmail(reg.email, reg.first_name, newOtp);
  else await sendOtpSms(reg.mobile, reg.first_name, newOtp);

  logAuth({ action: 'otp_resent', identifier: dest, ip, metadata: { channel } });
  return ok(res, { otp_expiry_seconds: config.otp.expirySeconds }, `OTP resent to ${channel}`);
}

export async function login(req: Request, res: Response) {
  const { identifier, password } = (req as any).validated;
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || null;

  const { data: users, error: dbErr } = await supabase.rpc('find_user_for_login', { p_identifier: identifier });
  if (dbErr || !users?.length) { logAuth({ action: 'login_failed', identifier, ip, userAgent: ua, metadata: { reason: 'not_found' } }); return err(res, 'Invalid credentials', 401); }
  const u = users[0];

  if (u.status === 'suspended') return err(res, 'Account suspended', 403);
  if (u.locked_until && new Date(u.locked_until) > new Date()) { const w = Math.ceil((new Date(u.locked_until).getTime() - Date.now()) / 60000); return err(res, `Account locked. Try in ${w} min.`, 429); }

  const valid = await bcrypt.compare(password, u.password_hash);
  if (!valid) {
    await supabase.rpc('update_login_failure', { p_user_id: u.user_id });
    logAuth({ userId: u.user_id, action: 'login_failed', identifier, ip, userAgent: ua, metadata: { reason: 'wrong_password' } });
    if (u.failed_login_count + 1 >= 5) logAuth({ userId: u.user_id, action: 'account_locked', identifier, ip });
    return err(res, 'Invalid credentials', 401);
  }

  const tokens = generateTokens(u.user_id);
  await supabase.rpc('update_login_success', { p_user_id: u.user_id, p_method: 'email_password' });
  await supabase.rpc('create_session', { p_user_id: u.user_id, p_login_method: 'email_password', p_refresh_hash: hashSha256(tokens.refresh_token), p_ip: ip, p_user_agent: ua, p_device_type: getDeviceType(ua || undefined) });

  logAuth({ userId: u.user_id, action: 'login_success', identifier, ip, userAgent: ua, deviceType: getDeviceType(ua || undefined), metadata: { method: 'email_password' } });

  return ok(res, { user: { id: u.user_id, first_name: u.first_name, last_name: u.last_name, email: u.email, mobile: u.mobile }, ...tokens });
}

export async function refresh(req: Request, res: Response) {
  const { refresh_token } = (req as any).validated;
  try { verifyRefresh(refresh_token); } catch { return err(res, 'Invalid refresh token', 401); }

  const { data: sessions } = await supabase.rpc('verify_refresh_session', { p_refresh_hash: hashSha256(refresh_token) });
  if (!sessions?.length) return err(res, 'Session expired', 401);
  const s = sessions[0];

  const tokens = generateTokens(s.user_id);
  await supabase.rpc('revoke_session', { p_session_id: s.session_id, p_reason: 'token_refresh' });
  await supabase.rpc('create_session', { p_user_id: s.user_id, p_login_method: 'email_password', p_refresh_hash: hashSha256(tokens.refresh_token), p_ip: getClientIp(req), p_user_agent: req.headers['user-agent'] || null, p_device_type: getDeviceType(req.headers['user-agent']) });

  logAuth({ userId: s.user_id, action: 'token_refreshed', ip: getClientIp(req) });
  return ok(res, { user: { id: s.user_id, first_name: s.first_name, last_name: s.last_name, email: s.email, mobile: s.mobile }, ...tokens });
}

export async function logout(req: Request, res: Response) {
  const { refresh_token } = req.body || {};
  if (refresh_token) {
    await supabase.from('login_sessions').update({ is_active: false, revoked_at: new Date().toISOString(), revoked_reason: 'logout' }).eq('refresh_token_hash', hashSha256(refresh_token)).eq('is_active', true);
  }
  logAuth({ userId: req.user?.id, action: 'logout', ip: getClientIp(req) });
  return ok(res, null, 'Logged out');
}
