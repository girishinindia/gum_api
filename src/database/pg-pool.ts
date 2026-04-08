import { Pool, PoolConfig } from 'pg';

import { env } from '../config/env';
import { logger } from '../core/logger/logger';

// ─── Pool Configuration ──────────────────────────────────────

const poolConfig: PoolConfig = {
  connectionString: env.DATABASE_URL,
  max: 20, // max connections in pool
  idleTimeoutMillis: 30_000, // close idle connections after 30s
  connectionTimeoutMillis: 5_000, // fail if can't connect in 5s
  allowExitOnIdle: true // let Node exit if pool is idle
};

// ─── Singleton Pool ──────────────────────────────────────────

let pool: Pool | null = null;

export const getPool = (): Pool => {
  if (!pool) {
    pool = new Pool(poolConfig);

    pool.on('error', (error) => {
      logger.error({ error: error.message }, 'PostgreSQL pool error (idle client)');
    });

    pool.on('connect', () => {
      logger.debug('PostgreSQL pool: new client connected');
    });

    logger.info('PostgreSQL connection pool created');
  }

  return pool;
};

// ─── Graceful Shutdown ───────────────────────────────────────

export const closePool = async (): Promise<void> => {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('PostgreSQL connection pool closed');
  }
};
