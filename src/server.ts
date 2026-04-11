import { buildApp } from './app';
import { env } from './config/env';
import { logger } from './core/logger/logger';
import { closePool, getPool } from './database/pg-pool';
import { getRedisClient } from './database/redis';

// ═══════════════════════════════════════════════════════════════
// Server bootstrap.
//   1. Build the app
//   2. Start listening
//   3. Register graceful shutdown hooks
// ═══════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const app = buildApp();

  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, app: env.APP_NAME },
      `${env.APP_NAME} listening on :${env.PORT}`
    );
  });

  // ─── Graceful shutdown ────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => logger.info('HTTP server closed'));

    try {
      await closePool();
    } catch (error) {
      logger.error({ error }, 'Error closing pg pool');
    }

    try {
      const redis = getRedisClient();
      await redis.quit();
    } catch (error) {
      logger.error({ error }, 'Error closing redis client');
    }

    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ error }, 'Uncaught exception');
    process.exit(1);
  });

  // Touch pg pool so startup logs announce creation immediately.
  void getPool();
}

main().catch((error) => {
  logger.fatal({ error }, 'Fatal startup error');
  process.exit(1);
});
