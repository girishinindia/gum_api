import app from './app';
import { config } from './config';
import { logger } from './utils/logger';

const start = async () => {
  // Validate critical env vars
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'UPSTASH_REDIS_URL', 'BREVO_API_KEY', 'SMS_API_KEY'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) { logger.fatal(`Missing env vars: ${missing.join(', ')}`); process.exit(1); }

  app.listen(config.port, () => {
    logger.info(`${config.appName} running on port ${config.port} [${config.env}]`);
    logger.info(`API base: http://localhost:${config.port}/api/${config.apiVersion}`);
  });
};

start().catch((err) => { logger.fatal(err, 'Failed to start'); process.exit(1); });
