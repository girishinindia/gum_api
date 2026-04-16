import crypto from 'crypto';

export const normalizeMobile = (mobile: string): string => {
  let clean = mobile.replace(/[^0-9+]/g, '');
  const digits = clean.replace(/[^0-9]/g, '');
  if (digits.length === 10) return '+91' + digits;
  if (!clean.startsWith('+')) clean = '+' + clean;
  return clean;
};

export const generateOTP = (length = 6): string => {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return crypto.randomInt(min, max).toString();
};

export const hashSha256 = (val: string) => crypto.createHash('sha256').update(val).digest('hex');
export const generatePendingId = () => crypto.randomBytes(16).toString('hex');
export const maskEmail = (e: string) => { const [u, d] = e.split('@'); return u.slice(0, 2) + '***@' + d; };
export const maskMobile = (m: string) => m.slice(0, 3) + '******' + m.slice(-2);
export const getDeviceType = (ua?: string) => { if (!ua) return 'unknown'; const l = ua.toLowerCase(); if (/tablet|ipad/.test(l)) return 'tablet'; if (/mobile|android|iphone/.test(l)) return 'mobile'; return 'desktop'; };
export const getClientIp = (req: any): string | null => req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
