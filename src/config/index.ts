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

  bunny: {
    storageZone: process.env.BUNNY_STORAGE_ZONE!,
    storageKey: process.env.BUNNY_STORAGE_KEY!,
    storageUrl: process.env.BUNNY_STORAGE_URL!,
    cdnUrl: process.env.BUNNY_CDN_URL!,
    accountApiKey: process.env.BUNNY_ACCOUNT_API_KEY || '',
    streamApiKey: process.env.BUNNY_STREAM_API_KEY || '',
    streamLibraryId: process.env.BUNNY_STREAM_LIBRARY_ID || '',
    streamCdn: process.env.BUNNY_STREAM_CDN || '',
    streamTokenKey: process.env.BUNNY_STREAM_TOKEN_KEY || '',
    /** Phase 3.1 — default signed-URL TTL for embed playback */
    streamTokenTtlSeconds: parseInt(process.env.BUNNY_STREAM_TOKEN_TTL_SECONDS || '3600'),
    /** Phase 3.3 — shared secret for Bunny Stream webhook HMAC verification */
    streamWebhookSecret: process.env.BUNNY_STREAM_WEBHOOK_SECRET || '',
  },

  rateLimit: { windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), max: parseInt(process.env.RATE_LIMIT_MAX || '1000'), disabled: process.env.RATE_LIMIT_DISABLED === 'true' },

  cors: { origins: (process.env.CORS_ORIGINS || '*').split(',').map((s: string) => s.trim()) },

  upload: { maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '50') },

  razorpay: { keyId: process.env.RAZORPAY_KEY_ID!, keySecret: process.env.RAZORPAY_KEY_SECRET!, webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '', currency: process.env.RAZORPAY_CURRENCY || 'INR' },

  /**
   * Phase 9 — RazorpayX (bank payouts) + TDS Section 194-O.
   * `mode` = 'disabled' (default — dev / pre-launch; no API calls, marks
   *          settlements as gateway='dev-stub' so the flow can be exercised
   *          end-to-end without real money)
   *        = 'razorpayx' (real bank payouts via RazorpayX)
   */
  payouts: {
    mode: (process.env.PAYOUT_GATEWAY || 'disabled') as 'disabled' | 'razorpayx',
    razorpayx: {
      keyId: process.env.RAZORPAYX_KEY_ID || '',
      keySecret: process.env.RAZORPAYX_KEY_SECRET || '',
      accountNumber: process.env.RAZORPAYX_ACCOUNT_NUMBER || '', // platform's bank account number registered with RazorpayX
      webhookSecret: process.env.RAZORPAYX_WEBHOOK_SECRET || '',
      mode: (process.env.RAZORPAYX_MODE || 'IMPS') as 'IMPS' | 'NEFT' | 'RTGS' | 'UPI',
    },
    tds: {
      /** Standard rate for Section 194-O — currently 1% (will be 0.1% post-government-amendment 2025) */
      rate: parseFloat(process.env.TDS_RATE_PERCENT || '1.0'),
      /** Penalty rate under Section 206AA when PAN is missing — typically 5%. */
      noPanRate: parseFloat(process.env.TDS_NO_PAN_RATE_PERCENT || '5.0'),
      /** Annual aggregate threshold below which TDS isn't deducted (Section 194-O proviso) */
      annualExemptionThreshold: parseFloat(process.env.TDS_ANNUAL_EXEMPTION_THRESHOLD || '5000'),
    },
  },

  socket: { pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL || '25000'), pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT || '20000') },

  /**
   * Phase 7.2 — Background queues (BullMQ on Upstash Redis).
   * When `enabled` is false, services fall back to synchronous direct
   * delivery (existing pre-Phase-7 behaviour). Flip to true once a worker
   * process is running (`npm run worker`).
   */
  queue: {
    enabled: process.env.QUEUE_ENABLED === 'true',
    prefix: process.env.QUEUE_PREFIX || 'gum',
    defaultAttempts: parseInt(process.env.QUEUE_DEFAULT_ATTEMPTS || '5'),
    defaultBackoffMs: parseInt(process.env.QUEUE_DEFAULT_BACKOFF_MS || '5000'),
    workerConcurrency: parseInt(process.env.QUEUE_WORKER_CONCURRENCY || '5'),
    /** seconds completed jobs stay in Redis before BullMQ trims them */
    completedRetentionSeconds: parseInt(process.env.QUEUE_COMPLETED_RETENTION_SECONDS || '86400'),
    /** seconds failed jobs stay (longer — for DLQ inspection) */
    failedRetentionSeconds: parseInt(process.env.QUEUE_FAILED_RETENTION_SECONDS || '604800'),
  },

  /**
   * Phase 7.5 — Sentry. When DSN is unset, the SDK becomes a no-op so
   * dev/local environments don't ship telemetry anywhere.
   */
  sentry: {
    dsn: process.env.SENTRY_DSN || '',
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || process.env.npm_package_version || 'unknown',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.05'),
  },

  /**
   * Phase 7.6 — /metrics endpoint. Disabled by default so dev runs
   * stay quiet; enable in staging/prod.
   */
  metrics: {
    enabled: process.env.METRICS_ENABLED === 'true',
    /** Restrict /metrics to a comma-separated list of IPs/CIDRs. Empty = no restriction. */
    allowedIps: (process.env.METRICS_ALLOWED_IPS || '').split(',').map(s => s.trim()).filter(Boolean),
  },

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  /**
   * Phase 11.2 — Web Push (VAPID). Public key is shipped to the frontend via
   * GET /push/vapid-public-key; private key signs the JWT auth on every push.
   * Subject must be a mailto: or https: URL identifying you to push services.
   */
  push: {
    vapidPublicKey:  process.env.VAPID_PUBLIC_KEY  || '',
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
    vapidSubject:    process.env.VAPID_SUBJECT     || 'mailto:girishinindia@gmail.com',
    /** When unset, push.service falls back to direct fanout (no queue). */
    queueEnabled:    (process.env.PUSH_QUEUE_ENABLED || process.env.QUEUE_ENABLED || 'true') === 'true',
  },

  /**
   * Phase 45 — Mobile push via Firebase Cloud Messaging (Android + iOS).
   * Web push stays on VAPID above; Firebase is ONLY the mobile transport.
   * Prod: paste the full service-account JSON into FIREBASE_SERVICE_ACCOUNT_JSON
   * (one line). Dev: drop firebase-service-account.json in the API root.
   * When neither is present, mobile push is silently disabled (web unaffected).
   */
  firebase: {
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
    projectId:          process.env.FIREBASE_PROJECT_ID           || '',
  },

  /**
   * Phase 46 — On-demand revalidation of the public site (gum_web).
   * When an admin saves CMS / people content (About, Homepage, Team,
   * Careers, instructor activation), the API pings gum_web's
   * POST /api/revalidate so the change shows immediately instead of after
   * the ISR window. Both apps must share REVALIDATE_SECRET; WEB_BASE_URL is
   * the public site origin (e.g. https://growupmore.com). When either is
   * unset, revalidation silently no-ops (dev / local).
   */
  web: {
    baseUrl: (process.env.WEB_BASE_URL || process.env.PUBLIC_WEB_URL || '').replace(/\/+$/, ''),
    revalidateSecret: process.env.REVALIDATE_SECRET || '',
  },
} as const;
