import { redis } from '../config/redis';
import { config } from '../config';
import { generateOTP, hashSha256 } from '../utils/helpers';

// Key builders — separate namespace for registration vs password reset
const K = {
  // Registration flow
  reg: (id: string) => `reg:${id}`,
  regOtpEmail: (id: string) => `otp:email:${id}`,
  regOtpSms: (id: string) => `otp:sms:${id}`,

  // Password reset flow
  reset: (id: string) => `reset:${id}`,
  resetOtpEmail: (id: string) => `otp:reset:email:${id}`,
  resetOtpSms: (id: string) => `otp:reset:sms:${id}`,

  // Shared
  cooldown: (dest: string) => `otp:cooldown:${dest}`,
  rateLimit: (dest: string) => `otp:ratelimit:${dest}`,
};

// ── Rate limiting / cooldown (shared) ──

export async function checkRateLimit(dest: string): Promise<boolean> {
  const c = await redis.incr(K.rateLimit(dest));
  if (c === 1) await redis.expire(K.rateLimit(dest), 3600);
  return c <= config.otp.maxPerHour;
}

export async function checkCooldown(dest: string): Promise<{ ok: boolean; retryAfter: number }> {
  const ttl = await redis.ttl(K.cooldown(dest));
  return { ok: ttl <= 0, retryAfter: Math.max(ttl, 0) };
}

export async function setCooldown(dest: string): Promise<void> {
  await redis.set(K.cooldown(dest), '1', 'EX', config.otp.resendCooldown);
}

// ══════════════════════════════════════════════════
// REGISTRATION flow
// ══════════════════════════════════════════════════

export async function storeRegistration(pendingId: string, data: any): Promise<void> {
  await redis.set(K.reg(pendingId), JSON.stringify(data), 'EX', config.redis.otpTtl);
}

export async function getRegistration(pendingId: string): Promise<any | null> {
  const d = await redis.get(K.reg(pendingId));
  return d ? JSON.parse(d) : null;
}

export async function updateRegistration(pendingId: string, data: any): Promise<void> {
  const ttl = await redis.ttl(K.reg(pendingId));
  await redis.set(K.reg(pendingId), JSON.stringify(data), 'EX', Math.max(ttl, 1));
}

export async function storeAndGetOTP(pendingId: string, channel: 'email' | 'sms'): Promise<string> {
  const otp = generateOTP(config.otp.length);
  const key = channel === 'email' ? K.regOtpEmail(pendingId) : K.regOtpSms(pendingId);
  await redis.set(key, JSON.stringify({ hash: hashSha256(otp), attempts: 0 }), 'EX', config.otp.expirySeconds);
  return otp;
}

export async function verifyOTP(pendingId: string, channel: 'email' | 'sms', otpInput: string): Promise<{ valid: boolean; reason?: string; remaining?: number }> {
  const key = channel === 'email' ? K.regOtpEmail(pendingId) : K.regOtpSms(pendingId);
  return verifyOtpKey(key, otpInput);
}

export async function cleanup(pendingId: string): Promise<void> {
  await redis.del(K.reg(pendingId), K.regOtpEmail(pendingId), K.regOtpSms(pendingId));
}

// ══════════════════════════════════════════════════
// PASSWORD RESET flow
// ══════════════════════════════════════════════════

export async function storeReset(pendingId: string, data: any): Promise<void> {
  await redis.set(K.reset(pendingId), JSON.stringify(data), 'EX', config.redis.otpTtl);
}

export async function getReset(pendingId: string): Promise<any | null> {
  const d = await redis.get(K.reset(pendingId));
  return d ? JSON.parse(d) : null;
}

export async function updateReset(pendingId: string, data: any): Promise<void> {
  const ttl = await redis.ttl(K.reset(pendingId));
  await redis.set(K.reset(pendingId), JSON.stringify(data), 'EX', Math.max(ttl, 1));
}

export async function storeAndGetResetOTP(pendingId: string, channel: 'email' | 'sms'): Promise<string> {
  const otp = generateOTP(config.otp.length);
  const key = channel === 'email' ? K.resetOtpEmail(pendingId) : K.resetOtpSms(pendingId);
  await redis.set(key, JSON.stringify({ hash: hashSha256(otp), attempts: 0 }), 'EX', config.otp.expirySeconds);
  return otp;
}

export async function verifyResetOTP(pendingId: string, channel: 'email' | 'sms', otpInput: string): Promise<{ valid: boolean; reason?: string; remaining?: number }> {
  const key = channel === 'email' ? K.resetOtpEmail(pendingId) : K.resetOtpSms(pendingId);
  return verifyOtpKey(key, otpInput);
}

export async function cleanupReset(pendingId: string): Promise<void> {
  await redis.del(K.reset(pendingId), K.resetOtpEmail(pendingId), K.resetOtpSms(pendingId));
}

// ── Shared OTP verification logic ──
async function verifyOtpKey(key: string, otpInput: string): Promise<{ valid: boolean; reason?: string; remaining?: number }> {
  const raw = await redis.get(key);
  if (!raw) return { valid: false, reason: 'expired' };
  const rec = JSON.parse(raw);
  if (rec.attempts >= config.otp.maxAttempts) return { valid: false, reason: 'max_attempts' };
  rec.attempts++;
  const ttl = await redis.ttl(key);
  await redis.set(key, JSON.stringify(rec), 'EX', Math.max(ttl, 1));
  if (hashSha256(otpInput) !== rec.hash) return { valid: false, reason: 'invalid', remaining: config.otp.maxAttempts - rec.attempts };
  await redis.del(key);
  return { valid: true };
}

// ══════════════════════════════════════════════════
// PROFILE UPDATE flows (change password, update email, update mobile)
// Uses a generic "profile" namespace with a purpose tag
// ══════════════════════════════════════════════════

const profileKey = (pendingId: string) => `profile:${pendingId}`;
const profileOtpKey = (pendingId: string, channel: 'email' | 'sms') => `otp:profile:${channel}:${pendingId}`;

export async function storeProfileAction(pendingId: string, data: any): Promise<void> {
  await redis.set(profileKey(pendingId), JSON.stringify(data), 'EX', config.redis.otpTtl);
}

export async function getProfileAction(pendingId: string): Promise<any | null> {
  const d = await redis.get(profileKey(pendingId));
  return d ? JSON.parse(d) : null;
}

export async function updateProfileAction(pendingId: string, data: any): Promise<void> {
  const ttl = await redis.ttl(profileKey(pendingId));
  await redis.set(profileKey(pendingId), JSON.stringify(data), 'EX', Math.max(ttl, 1));
}

export async function storeAndGetProfileOTP(pendingId: string, channel: 'email' | 'sms'): Promise<string> {
  const otp = generateOTP(config.otp.length);
  const key = profileOtpKey(pendingId, channel);
  await redis.set(key, JSON.stringify({ hash: hashSha256(otp), attempts: 0 }), 'EX', config.otp.expirySeconds);
  return otp;
}

export async function verifyProfileOTP(pendingId: string, channel: 'email' | 'sms', otpInput: string): Promise<{ valid: boolean; reason?: string; remaining?: number }> {
  return verifyOtpKey(profileOtpKey(pendingId, channel), otpInput);
}

export async function cleanupProfile(pendingId: string): Promise<void> {
  await redis.del(profileKey(pendingId), profileOtpKey(pendingId, 'email'), profileOtpKey(pendingId, 'sms'));
}
