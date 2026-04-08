import { app } from './app';
import { env } from './config/env';
import { logger } from './core/logger/logger';
import { closePool } from './database/pg-pool';

const server = app.listen(env.PORT, () => {
  logger.info(`${env.APP_NAME} is running on port ${env.PORT}`);
  logger.info(`Base URL: ${env.APP_URL}`);
});

// ─── Graceful Shutdown ───────────────────────────────────────

const shutdown = async (signal: string) => {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    await closePool();
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
