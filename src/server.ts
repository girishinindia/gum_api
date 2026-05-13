import 'dotenv/config';

// ── Sentry (must initialise BEFORE other imports for proper instrumentation) ──
import { config } from './config';
if (config.sentry.dsn) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Sentry = require('@sentry/node');
  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.sentry.environment,
    release: config.sentry.release,
    tracesSampleRate: config.sentry.tracesSampleRate,
  });
}

import { createServer } from 'http';
import app from './app';
import { logger } from './utils/logger';
import { initSocket } from './socket';
import { initCronJobs } from './cron';
import { shutdownQueues } from './services/queue.service';

/* ── Process-level error handlers ── */
process.on('uncaughtException', (err) => {
  logger.fatal(err, 'Uncaught exception — shutting down');
  if (config.sentry.dsn) {
    try { require('@sentry/node').captureException(err); } catch { /* swallow */ }
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
  if (config.sentry.dsn) {
    try { require('@sentry/node').captureException(reason); } catch { /* swallow */ }
  }
  // Don't exit — let the process recover. In production, a process manager
  // (PM2 / Docker restart policy) handles restarts if needed.
});

async function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  await shutdownQueues().catch((err) => logger.warn({ err }, 'queue shutdown failed'));
  process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

const start = async () => {
  // Validate critical env vars
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'UPSTASH_REDIS_URL', 'BREVO_API_KEY', 'SMS_API_KEY'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) { logger.fatal(`Missing env vars: ${missing.join(', ')}`); process.exit(1); }

  // Warn about optional but recommended env vars
  const recommended: [string, string][] = [
    ['BUNNY_STORAGE_ZONE', 'Bunny CDN file uploads'],
    ['BUNNY_STORAGE_KEY', 'Bunny CDN file uploads'],
    ['BUNNY_CDN_URL', 'Bunny CDN file serving'],
    ['BUNNY_STREAM_API_KEY', 'Bunny Stream video uploads'],
    ['BUNNY_STREAM_LIBRARY_ID', 'Bunny Stream video library'],
    ['BUNNY_STREAM_TOKEN_KEY', 'Bunny Stream signed embed URLs (Phase 3)'],
    ['BUNNY_STREAM_WEBHOOK_SECRET', 'Bunny Stream webhook HMAC verification (Phase 3)'],
    ['RAZORPAY_KEY_ID', 'Payment processing'],
    ['RAZORPAY_KEY_SECRET', 'Payment processing'],
    ['RAZORPAY_WEBHOOK_SECRET', 'Razorpay webhook verification (falls back to key_secret)'],
    ['SENTRY_DSN', 'Error tracking (Phase 7)'],
  ];
  const missingOptional = recommended.filter(([k]) => !process.env[k]);
  if (missingOptional.length) {
    logger.warn(`Missing optional env vars (features may be degraded):\n${missingOptional.map(([k, desc]) => `  • ${k} — ${desc}`).join('\n')}`);
  }

  // Log Phase-7 mode banners
  if (config.queue.enabled) {
    logger.info({ prefix: config.queue.prefix }, '[Queue] enabled — services will enqueue jobs');
  } else {
    logger.info('[Queue] disabled — services run synchronously (set QUEUE_ENABLED=true to enable)');
  }
  if (config.sentry.dsn) {
    logger.info({ env: config.sentry.environment }, '[Sentry] initialised');
  }

  // Create HTTP server (shared by Express + Socket.io)
  const httpServer = createServer(app);

  // Initialize Socket.io (attaches to httpServer, sets up Redis adapter + namespaces)
  initSocket(httpServer);

  // Initialize scheduled jobs (cron)
  initCronJobs();

  httpServer.listen(config.port, () => {
    logger.info(`${config.appName} running on port ${config.port} [${config.env}]`);
    logger.info(`API base: http://localhost:${config.port}/api/${config.apiVersion}`);
    logger.info(`API docs: http://localhost:${config.port}/api-docs`);
    logger.info(`WebSocket: ws://localhost:${config.port} (namespaces: /chat, /admin)`);
    if (config.metrics.enabled) logger.info(`Metrics: http://localhost:${config.port}/metrics`);
  });
};

start().catch((err) => { logger.fatal(err, 'Failed to start'); process.exit(1); });
