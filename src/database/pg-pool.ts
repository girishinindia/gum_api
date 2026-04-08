import dns from 'node:dns';
import { Pool, PoolConfig } from 'pg';

import { env } from '../config/env';
import { logger } from '../core/logger/logger';

// ─── Force IPv4 DNS resolution ──────────────────────────────
// Supabase direct connection resolves to IPv6 only, which most
// EC2 instances can't reach (ENETUNREACH).
// Even with the Session pooler (which has IPv4), we keep this
// as a safety net so DNS always prefers IPv4 addresses.
dns.setDefaultResultOrder('ipv4first');

// ─── Pool Configuration ──────────────────────────────────────
// DATABASE_URL should point to Supabase Session pooler for IPv4:
//   postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
// NOT the direct connection (db.PROJECT_REF.supabase.co) which is IPv6-only.

const poolConfig: PoolConfig = {
  connectionString: env.DATABASE_URL,
  max: 20, // max connections in pool
  idleTimeoutMillis: 30_000, // close idle connections after 30s
  connectionTimeoutMillis: 5_000, // fail if can't connect in 5s
  allowExitOnIdle: true, // let Node exit if pool is idle
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
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
