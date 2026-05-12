import { createServer } from 'http';
import app from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { initSocket } from './socket';
import { initCronJobs } from './cron';

const start = async () => {
  // Validate critical env vars
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'UPSTASH_REDIS_URL', 'BREVO_API_KEY', 'SMS_API_KEY'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) { logger.fatal(`Missing env vars: ${missing.join(', ')}`); process.exit(1); }

  // Create HTTP server (shared by Express + Socket.io)
  const httpServer = createServer(app);

  // Initialize Socket.io (attaches to httpServer, sets up Redis adapter + namespaces)
  initSocket(httpServer);

  // Initialize scheduled jobs (cron)
  initCronJobs();

  httpServer.listen(config.port, () => {
    logger.info(`${config.appName} running on port ${config.port} [${config.env}]`);
    logger.info(`API base: http://localhost:${config.port}/api/${config.apiVersion}`);
    logger.info(`WebSocket: ws://localhost:${config.port} (namespaces: /chat, /admin)`);
  });
};

start().catch((err) => { logger.fatal(err, 'Failed to start'); process.exit(1); });
