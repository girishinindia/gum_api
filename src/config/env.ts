import 'dotenv/config';

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════
// Environment Variable Schema & Validation
// ═══════════════════════════════════════════════════════════════
// All env vars are validated at startup using Zod.
// If any required variable is missing or invalid, the app
// will print the error and exit immediately (fail-fast).
//
// To add a new env var:
//   1. Add it to the schema below with validation rules
//   2. Add it to the .env file (and hosting/setup-growupmore-api.sh)
//   3. Use it via: import { env } from '../config/env';
// ═══════════════════════════════════════════════════════════════

const schema = z.object({

  // ─── Server ─────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5001),
  APP_URL: z.string().min(1),               // e.g. https://api.growupmore.com
  API_VERSION: z.string().default('v1'),
  APP_NAME: z.string().min(1),              // Shown in health check and logs
  TIMEZONE: z.string().min(1),              // e.g. Asia/Kolkata

  // ─── Supabase / PostgreSQL ──────────────────────────────────
  // DATABASE_URL must include ?sslmode=require for production (Supabase)
  SUPABASE_URL: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),

  // ─── JWT ────────────────────────────────────────────────────
  // Secrets must be at least 32 chars for security
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().min(1),   // e.g. 15m, 1h, 7d
  JWT_REFRESH_EXPIRES_IN: z.string().min(1),  // e.g. 7d, 30d

  // ─── CORS ───────────────────────────────────────────────────
  // Comma-separated origins: * or https://app.growupmore.com,https://admin.growupmore.com
  CORS_ORIGINS: z.string().min(1),

  // ─── Redis (Upstash) ───────────────────────────────────────
  // URL format: rediss://default:PASSWORD@HOST:6379
  UPSTASH_REDIS_URL: z.string().min(1),
  REDIS_SESSION_TTL: z.coerce.number().int().positive(),    // seconds (1800 = 30min)
  REDIS_CACHE_TTL: z.coerce.number().int().positive(),      // seconds (300 = 5min)
  REDIS_OTP_TTL: z.coerce.number().int().positive(),        // seconds (600 = 10min)

  // ─── Bunny Storage (file uploads → CDN) ────────────────────
  BUNNY_STORAGE_ZONE: z.string().min(1),
  BUNNY_STORAGE_KEY: z.string().min(1),
  BUNNY_STORAGE_URL: z.string().min(1),     // e.g. https://sg.storage.bunnycdn.com
  BUNNY_CDN_URL: z.string().min(1),         // e.g. https://cdn.growupmore.com

  // ─── Bunny Stream (video hosting) ──────────────────────────
  BUNNY_STREAM_API_KEY: z.string().min(1),
  BUNNY_STREAM_LIBRARY_ID: z.string().min(1),
  BUNNY_STREAM_CDN: z.string().min(1),      // e.g. https://stream.growupmore.com
  BUNNY_STREAM_TOKEN_KEY: z.string().min(1),

  // ─── Bunny Account ─────────────────────────────────────────
  BUNNY_ACCOUNT_API_KEY: z.string().min(1),

  // ─── Email (Brevo / Sendinblue) ────────────────────────────
  BREVO_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().email(),            // Sender address: info@growupmore.com
  EMAIL_FROM_NAME: z.string().min(1),        // Sender display name: Grow Up More
  EMAIL_ADMIN: z.string().email(),           // Admin email for system notifications
  EMAIL_ADMIN_NOTIFY: z.string().email(),    // Notify email (e.g. for alerts)

  // ─── SMS (SMSGatewayHub — India DLT) ──────────────────────
  SMS_API_KEY: z.string().min(1),
  SMS_SENDER_ID: z.string().min(1),          // 6-char sender ID: GUMORE
  SMS_ROUTE: z.string().min(1),              // Route type: clickhere
  SMS_CHANNEL: z.string().min(1),            // Channel: 2
  SMS_DCS: z.string().min(1),                // Data coding scheme: 0
  SMS_FLASH: z.string().min(1),              // Flash SMS: 0
  SMS_ENTITY_ID: z.string().min(1),          // DLT entity ID
  SMS_DLT_TEMPLATE_ID: z.string().min(1),    // DLT template ID for OTP messages
  // When 'true', real SMS is dispatched even outside production. Default
  // is 'false' — dev/test runs rely on the dev OTP echo channel (logger +
  // devMobileOtp in the response) so the verify-auth-flows harness never
  // burns SMSGatewayHub credits. Flip this to 'true' in a local .env to
  // test actual SMS delivery end-to-end without setting NODE_ENV=production.
  SMS_FORCE_SEND: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),

  // ─── Razorpay (payments) ───────────────────────────────────
  RAZORPAY_KEY_ID: z.string().min(1),
  RAZORPAY_KEY_SECRET: z.string().min(1),
  RAZORPAY_CURRENCY: z.string().default('INR'),

  // ─── reCAPTCHA (Google Enterprise — toggleable) ────────────
  // Set RECAPTCHA_ENABLED=true to enforce on /register/initiate and /login
  // When false (default): middleware auto-skips, no token needed
  // When true + production: token required, verified via Google API
  RECAPTCHA_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  RECAPTCHA_SITE_KEY: z.string().default(''),        // Only needed when enabled
  RECAPTCHA_SECRET_KEY: z.string().default(''),      // Only needed when enabled
  RECAPTCHA_API_KEY: z.string().default(''),          // Google API key for Enterprise
  RECAPTCHA_PROJECT_ID: z.string().default(''),       // Google Cloud project ID
  RECAPTCHA_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.5),  // 0.0–1.0, higher = stricter

  // ─── Rate Limiting ─────────────────────────────────────────
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive(),   // Window in ms (900000 = 15min)
  RATE_LIMIT_MAX: z.coerce.number().int().positive(),         // Global max requests per window
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive(),    // Auth endpoints max per window

  // ─── File Upload ───────────────────────────────────────────
  MAX_FILE_SIZE_MB: z.coerce.number().positive(),
  ALLOWED_IMAGE_TYPES: z.string().min(1),    // Comma-separated MIME types
  ALLOWED_DOC_TYPES: z.string().min(1),      // Comma-separated MIME types

  // ─── Logging ───────────────────────────────────────────────
  LOG_LEVEL: z.string().default('info'),     // debug | info | warn | error
  LOG_DIR: z.string().default('logs'),       // Directory for log files

  // ─── OTP Configuration ─────────────────────────────────────
  OTP_LENGTH: z.coerce.number().int().positive(),              // Digits in OTP (e.g. 6)
  OTP_EXPIRY_MINUTES: z.coerce.number().int().positive(),      // OTP validity window
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive(),        // Max wrong attempts before burn
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive(), // Cooldown between resends

  // ─── Security ──────────────────────────────────────────────
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().positive(),      // Password hash rounds (12)

  // ─── Localization ──────────────────────────────────────────
  DEFAULT_LANG_CODE: z.string().min(1),      // e.g. en
  DEFAULT_LANG_ID: z.coerce.number().int().positive()  // e.g. 1
});

// ─── Parse & Validate ────────────────────────────────────────

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('═══════════════════════════════════════════════');
  console.error('  FATAL: Invalid environment variables');
  console.error('═══════════════════════════════════════════════');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

// ─── Export (with comma-separated strings → arrays) ──────────

export const env = {
  ...parsed.data,
  CORS_ORIGINS: parsed.data.CORS_ORIGINS.split(',').map((value) => value.trim()),
  ALLOWED_IMAGE_TYPES: parsed.data.ALLOWED_IMAGE_TYPES.split(',').map((value) => value.trim()),
  ALLOWED_DOC_TYPES: parsed.data.ALLOWED_DOC_TYPES.split(',').map((value) => value.trim())
};
