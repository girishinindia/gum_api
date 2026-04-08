import 'dotenv/config';

import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5001),
  APP_URL: z.string().min(1),
  API_VERSION: z.string().default('v1'),
  APP_NAME: z.string().min(1),
  TIMEZONE: z.string().min(1),

  SUPABASE_URL: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().min(1),
  JWT_REFRESH_EXPIRES_IN: z.string().min(1),

  CORS_ORIGINS: z.string().min(1),

  UPSTASH_REDIS_URL: z.string().min(1),
  REDIS_SESSION_TTL: z.coerce.number().int().positive(),
  REDIS_CACHE_TTL: z.coerce.number().int().positive(),
  REDIS_OTP_TTL: z.coerce.number().int().positive(),

  BUNNY_STORAGE_ZONE: z.string().min(1),
  BUNNY_STORAGE_KEY: z.string().min(1),
  BUNNY_STORAGE_URL: z.string().min(1),
  BUNNY_CDN_URL: z.string().min(1),

  BUNNY_STREAM_API_KEY: z.string().min(1),
  BUNNY_STREAM_LIBRARY_ID: z.string().min(1),
  BUNNY_STREAM_CDN: z.string().min(1),
  BUNNY_STREAM_TOKEN_KEY: z.string().min(1),

  BUNNY_ACCOUNT_API_KEY: z.string().min(1),

  BREVO_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().email(),
  EMAIL_FROM_NAME: z.string().min(1),
  EMAIL_ADMIN: z.string().email(),
  EMAIL_ADMIN_NOTIFY: z.string().email(),

  SMS_API_KEY: z.string().min(1),
  SMS_SENDER_ID: z.string().min(1),
  SMS_ROUTE: z.string().min(1),
  SMS_CHANNEL: z.string().min(1),
  SMS_DCS: z.string().min(1),
  SMS_FLASH: z.string().min(1),
  SMS_ENTITY_ID: z.string().min(1),
  SMS_DLT_TEMPLATE_ID: z.string().min(1),

  RAZORPAY_KEY_ID: z.string().min(1),
  RAZORPAY_KEY_SECRET: z.string().min(1),
  RAZORPAY_CURRENCY: z.string().default('INR'),

  RECAPTCHA_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  RECAPTCHA_SITE_KEY: z.string().default(''),
  RECAPTCHA_SECRET_KEY: z.string().default(''),
  RECAPTCHA_API_KEY: z.string().default(''),
  RECAPTCHA_PROJECT_ID: z.string().default(''),
  RECAPTCHA_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.5),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive(),
  RATE_LIMIT_MAX: z.coerce.number().int().positive(),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive(),

  MAX_FILE_SIZE_MB: z.coerce.number().positive(),
  ALLOWED_IMAGE_TYPES: z.string().min(1),
  ALLOWED_DOC_TYPES: z.string().min(1),

  LOG_LEVEL: z.string().default('info'),
  LOG_DIR: z.string().default('logs'),

  OTP_LENGTH: z.coerce.number().int().positive(),
  OTP_EXPIRY_MINUTES: z.coerce.number().int().positive(),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive(),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive(),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().positive(),

  DEFAULT_LANG_CODE: z.string().min(1),
  DEFAULT_LANG_ID: z.coerce.number().int().positive()
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  CORS_ORIGINS: parsed.data.CORS_ORIGINS.split(',').map((value) => value.trim()),
  ALLOWED_IMAGE_TYPES: parsed.data.ALLOWED_IMAGE_TYPES.split(',').map((value) => value.trim()),
  ALLOWED_DOC_TYPES: parsed.data.ALLOWED_DOC_TYPES.split(',').map((value) => value.trim())
};
