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

// ─── Parse DATABASE_URL into individual components ──────────
// WHY: The `pg` library's internal connection-string parser reads
// ?sslmode=require and sets ssl: true (strict cert validation).
// This OVERRIDES our ssl: { rejectUnauthorized: false } config,
// causing SELF_SIGNED_CERT_IN_CHAIN with Supabase's pooler certs.
//
// FIX: We parse the URL ourselves and pass host/port/user/password/database
// as individual properties. This gives us FULL control over SSL
// with zero interference from connection-string parsing.
//
// DATABASE_URL format:
//   postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require

const dbUrl = new URL(env.DATABASE_URL);

const poolConfig: PoolConfig = {
  host: dbUrl.hostname,                           // aws-1-ap-south-1.pooler.supabase.com
  port: parseInt(dbUrl.port || '5432', 10),       // 5432 (Session mode)
  user: decodeURIComponent(dbUrl.username),        // postgres.ixygmsqbpyyvjhxphpso
  password: decodeURIComponent(dbUrl.password),    // database password
  database: dbUrl.pathname.slice(1) || 'postgres', // postgres (strip leading /)
  max: 20,                                         // max connections in pool
  idleTimeoutMillis: 30_000,                       // close idle connections after 30s
  connectionTimeoutMillis: 5_000,                  // fail if can't connect in 5s
  allowExitOnIdle: true,                           // let Node exit if pool is idle
  // SSL: Accept Supabase's self-signed pooler certificates.
  // rejectUnauthorized: false skips cert chain validation.
  // This is safe because we're connecting to a known Supabase endpoint.
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
