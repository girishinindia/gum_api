import { createServer } from 'http';
import app from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { initSocket } from './socket';
import { initCronJobs } from './cron';

/* ── Process-level error handlers ── */
process.on('uncaughtException', (err) => {
  logger.fatal(err, 'Uncaught exception — shutting down');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
  // Don't exit — let the process recover. In production, a process manager
  // (PM2 / Docker restart policy) handles restarts if needed.
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received — graceful shutdown');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received — shutting down');
  process.exit(0);
});

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
    ['RAZORPAY_KEY_ID', 'Payment processing'],
    ['RAZORPAY_KEY_SECRET', 'Payment processing'],
    ['RAZORPAY_WEBHOOK_SECRET', 'Razorpay webhook verification (falls back to key_secret)'],
  ];
  const missingOptional = recommended.filter(([k]) => !process.env[k]);
  if (missingOptional.length) {
    logger.warn(`Missing optional env vars (features may be degraded):\n${missingOptional.map(([k, desc]) => `  • ${k} — ${desc}`).join('\n')}`);
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
  });
};

start().catch((err) => { logger.fatal(err, 'Failed to start'); process.exit(1); });
