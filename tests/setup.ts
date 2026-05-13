/**
 * Test setup — runs before any test file imports `src/config`.
 * Stuffs the bare-minimum env vars so the config module doesn't crash on
 * `process.env.X!` non-null assertions when imported in a test process.
 *
 * Tests that need real env values can override per-suite via process.env.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
process.env.UPSTASH_REDIS_URL = process.env.UPSTASH_REDIS_URL || 'redis://localhost:6379';
process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || 'test-brevo';
process.env.SMS_API_KEY = process.env.SMS_API_KEY || 'test-sms';
process.env.SMS_ENTITY_ID = process.env.SMS_ENTITY_ID || 'test-entity';
process.env.SMS_DLT_TEMPLATE_ID = process.env.SMS_DLT_TEMPLATE_ID || 'test-dlt';
process.env.BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || 'test-zone';
process.env.BUNNY_STORAGE_KEY = process.env.BUNNY_STORAGE_KEY || 'test-storage-key';
process.env.BUNNY_STORAGE_URL = process.env.BUNNY_STORAGE_URL || 'https://test.storage.bunnycdn.com';
process.env.BUNNY_CDN_URL = process.env.BUNNY_CDN_URL || 'https://test.b-cdn.net';
process.env.BUNNY_STREAM_LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID || '629329';
process.env.BUNNY_STREAM_TOKEN_KEY = process.env.BUNNY_STREAM_TOKEN_KEY || 'test-token-key';
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_key';
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'rzp_test_secret';

// Disable queue + sentry + metrics by default so tests don't accidentally
// open Redis connections or report errors
process.env.QUEUE_ENABLED = process.env.QUEUE_ENABLED || 'false';
process.env.SENTRY_DSN = process.env.SENTRY_DSN || '';
process.env.METRICS_ENABLED = process.env.METRICS_ENABLED || 'false';

// Phase 9 — dev-stub gateway so tests don't ever try real RazorpayX calls
process.env.PAYOUT_GATEWAY = 'disabled';

// Phase 11.2 — fixed VAPID keypair for push tests (generated once for tests only)
process.env.VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY  || 'BNxxXt-9oN0vXq6tJ9hYzVxOUaJ4hQwSiH3pOuS8XzwDdmFIcMmwUm7xRQiOezKePCEhYvBeXq-T8eqxRlT45Bg';
process.env.VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'XJ6gMzKvU_x6F3I9Eil2gM3T_wPmKuQp4ToK85Bh9rE';
process.env.VAPID_SUBJECT     = process.env.VAPID_SUBJECT     || 'mailto:test@example.com';
process.env.PUSH_QUEUE_ENABLED = 'false';
