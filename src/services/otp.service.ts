import { redis } from '../config/redis';
import { config } from '../config';
import { generateOTP, hashSha256 } from '../utils/helpers';

const K = {
  reg: (id: string) => `reg:${id}`,
  otpEmail: (id: string) => `otp:email:${id}`,
  otpSms: (id: string) => `otp:sms:${id}`,
  cooldown: (dest: string) => `otp:cooldown:${dest}`,
  rateLimit: (dest: string) => `otp:ratelimit:${dest}`,
};

export async function checkRateLimit(dest: string): Promise<boolean> {
  const c = await redis.incr(K.rateLimit(dest));
  if (c === 1) await redis.expire(K.rateLimit(dest), 3600);
  return c <= config.otp.maxPerHour;
}

export async function checkCooldown(dest: string): Promise<{ ok: boolean; retryAfter: number }> {
  const ttl = await redis.ttl(K.cooldown(dest));
  return { ok: ttl <= 0, retryAfter: Math.max(ttl, 0) };
}

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
  const key = channel === 'email' ? K.otpEmail(pendingId) : K.otpSms(pendingId);
  await redis.set(key, JSON.stringify({ hash: hashSha256(otp), attempts: 0 }), 'EX', config.otp.expirySeconds);
  return otp;
}

export async function verifyOTP(pendingId: string, channel: 'email' | 'sms', otpInput: string): Promise<{ valid: boolean; reason?: string; remaining?: number }> {
  const key = channel === 'email' ? K.otpEmail(pendingId) : K.otpSms(pendingId);
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

export async function setCooldown(dest: string): Promise<void> {
  await redis.set(K.cooldown(dest), '1', 'EX', config.otp.resendCooldown);
}

export async function cleanup(pendingId: string): Promise<void> {
  await redis.del(K.reg(pendingId), K.otpEmail(pendingId), K.otpSms(pendingId));
}
