import 'dotenv/config';

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5001'),
  appName: process.env.APP_NAME || 'GrowUpMore API',
  apiVersion: process.env.API_VERSION || 'v1',

  supabase: { url: process.env.SUPABASE_URL!, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY! },

  redis: { url: process.env.UPSTASH_REDIS_URL!, otpTtl: parseInt(process.env.REDIS_OTP_TTL || '600'), cacheTtl: parseInt(process.env.REDIS_CACHE_TTL || '300') },

  jwt: { accessSecret: process.env.JWT_ACCESS_SECRET!, refreshSecret: process.env.JWT_REFRESH_SECRET!, accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m', refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' },

  otp: { length: parseInt(process.env.OTP_LENGTH || '6'), expirySeconds: parseInt(process.env.OTP_EXPIRY_MINUTES || '3') * 60, maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '3'), resendCooldown: parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '60'), maxPerHour: 5 },

  bcrypt: { saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12') },

  email: { brevoApiKey: process.env.BREVO_API_KEY!, from: process.env.EMAIL_FROM || 'info@growupmore.com', fromName: process.env.EMAIL_FROM_NAME || 'Grow Up More' },

  sms: { apiKey: process.env.SMS_API_KEY!, senderId: process.env.SMS_SENDER_ID || 'GUMORE', route: process.env.SMS_ROUTE || 'clickhere', channel: process.env.SMS_CHANNEL || '2', dcs: process.env.SMS_DCS || '0', flash: process.env.SMS_FLASH || '0', entityId: process.env.SMS_ENTITY_ID!, dltTemplateId: process.env.SMS_DLT_TEMPLATE_ID!, forceSend: process.env.SMS_FORCE_SEND === 'true' },

  recaptcha: { enabled: process.env.RECAPTCHA_ENABLED === 'true', secretKey: process.env.RECAPTCHA_SECRET_KEY || '', minScore: parseFloat(process.env.RECAPTCHA_MIN_SCORE || '0.5') },

  bunny: { storageZone: process.env.BUNNY_STORAGE_ZONE!, storageKey: process.env.BUNNY_STORAGE_KEY!, storageUrl: process.env.BUNNY_STORAGE_URL!, cdnUrl: process.env.BUNNY_CDN_URL! },

  rateLimit: { windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), max: parseInt(process.env.RATE_LIMIT_MAX || '100') },

  cors: { origins: (process.env.CORS_ORIGINS || '*').split(',').map((s: string) => s.trim()) },

  upload: { maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '50') },
} as const;
