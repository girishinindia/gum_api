import Redis from 'ioredis';

import { env } from '../config/env';
import { logger } from '../core/logger/logger';

// ─── Singleton Client ────────────────────────────────────────

let redisClient: Redis | null = null;

export const getRedisClient = (): Redis => {
  if (!redisClient) {
    redisClient = new Redis(env.UPSTASH_REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 200, 2000),
      enableReadyCheck: false,
      lazyConnect: true
    });

    redisClient.on('error', (error) => {
      logger.error({ error }, 'Redis connection error');
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected');
    });
  }

  return redisClient;
};

/**
 * Gracefully close the Redis connection. Used by verification
 * scripts and shutdown hooks so the process can exit cleanly.
 * Safe to call multiple times and safe to call when no client
 * has been created.
 */
export const closeRedis = async (): Promise<void> => {
  if (!redisClient) return;
  try {
    await redisClient.quit();
  } catch {
    // If quit races with an open command, force-disconnect as a
    // last resort rather than leaving the event loop pinned.
    redisClient.disconnect();
  } finally {
    redisClient = null;
  }
};

// ─── Key Prefixes ────────────────────────────────────────────

const KEYS = {
  session: (userId: string) => `session:${userId}`,
  otp: (identifier: string) => `otp:${identifier}`,
  otpAttempts: (identifier: string) => `otp_attempts:${identifier}`,
  otpCooldown: (identifier: string) => `otp_cooldown:${identifier}`,
  otpResendCount: (identifier: string) => `otp_resend:${identifier}`,
  pendingSession: (key: string) => `pending:${key}`,
  cache: (key: string) => `cache:${key}`,
  revoked: (jti: string) => `revoked:${jti}`
} as const;

// ─── Session Helpers ─────────────────────────────────────────

export const redisSession = {
  /** Store a refresh token for a user (revocable sessions) */
  async store(userId: string, refreshToken: string): Promise<void> {
    const client = getRedisClient();
    await client.set(KEYS.session(userId), refreshToken, 'EX', env.REDIS_SESSION_TTL);
  },

  /** Get the stored refresh token for a user */
  async get(userId: string): Promise<string | null> {
    const client = getRedisClient();
    return client.get(KEYS.session(userId));
  },

  /** Revoke a session (logout) */
  async revoke(userId: string): Promise<void> {
    const client = getRedisClient();
    await client.del(KEYS.session(userId));
  },

  /** Check if a refresh token is still valid (not revoked) */
  async isValid(userId: string, refreshToken: string): Promise<boolean> {
    const stored = await this.get(userId);
    return stored === refreshToken;
  }
};

// ─── OTP Helpers ─────────────────────────────────────────────

export const redisOtp = {
  /** Store an OTP with TTL */
  async store(identifier: string, otp: string): Promise<void> {
    const client = getRedisClient();
    await client.set(KEYS.otp(identifier), otp, 'EX', env.REDIS_OTP_TTL);
    // Reset attempts on new OTP
    await client.del(KEYS.otpAttempts(identifier));
  },

  /** Get stored OTP */
  async get(identifier: string): Promise<string | null> {
    const client = getRedisClient();
    return client.get(KEYS.otp(identifier));
  },

  /**
   * Verify OTP and track attempts.
   *
   * Semantics (with OTP_MAX_ATTEMPTS = N):
   *   - The user gets exactly N chances, counting both correct and incorrect
   *     guesses.
   *   - On the N-th guess — whether it succeeds or fails — the OTP is burned
   *     (along with its attempts counter).
   *   - `attemptsLeft` never goes negative.
   *
   * Prior versions used `attempts > N` which gave the user N+1 effective
   * guesses AND returned `attemptsLeft=0` on the N-th wrong attempt without
   * actually burning the OTP — both were incorrect.
   */
  async verify(identifier: string, otp: string): Promise<{ valid: boolean; attemptsLeft: number }> {
    const client = getRedisClient();
    const stored = await client.get(KEYS.otp(identifier));

    if (!stored) {
      return { valid: false, attemptsLeft: 0 };
    }

    // Increment attempt counter (single atomic op)
    const attempts = await client.incr(KEYS.otpAttempts(identifier));
    await client.expire(KEYS.otpAttempts(identifier), env.REDIS_OTP_TTL);

    const valid = stored === otp;
    const exhausted = attempts >= env.OTP_MAX_ATTEMPTS;
    const attemptsLeft = Math.max(env.OTP_MAX_ATTEMPTS - attempts, 0);

    // Burn the OTP on success OR when the user has exhausted their tries.
    if (valid || exhausted) {
      await client.del(KEYS.otp(identifier));
      await client.del(KEYS.otpAttempts(identifier));
    }

    return { valid, attemptsLeft };
  },

  /** Check if resend cooldown is active */
  async isOnCooldown(identifier: string): Promise<boolean> {
    const client = getRedisClient();
    const exists = await client.exists(KEYS.otpCooldown(identifier));
    return exists === 1;
  },

  /** Set resend cooldown */
  async setCooldown(identifier: string): Promise<void> {
    const client = getRedisClient();
    await client.set(KEYS.otpCooldown(identifier), '1', 'EX', env.OTP_RESEND_COOLDOWN_SECONDS);
  },

  /** Get resend count (how many times OTP was resent) */
  async getResendCount(identifier: string): Promise<number> {
    const client = getRedisClient();
    const count = await client.get(KEYS.otpResendCount(identifier));
    return count ? parseInt(count, 10) : 0;
  },

  /** Increment resend count (TTL = OTP expiry window so it auto-resets) */
  async incrementResendCount(identifier: string): Promise<number> {
    const client = getRedisClient();
    const count = await client.incr(KEYS.otpResendCount(identifier));
    await client.expire(KEYS.otpResendCount(identifier), env.REDIS_OTP_TTL);
    return count;
  },

  /** Clean up all OTP-related keys for an identifier */
  async cleanup(identifier: string): Promise<void> {
    const client = getRedisClient();
    await client.del(
      KEYS.otp(identifier),
      KEYS.otpAttempts(identifier),
      KEYS.otpCooldown(identifier),
      KEYS.otpResendCount(identifier)
    );
  }
};

// ─── Pending Session Helpers (multi-step OTP flows) ──────────

export const redisPending = {
  /** Store pending session data (registration, forgot-password, etc.) */
  async store(key: string, data: Record<string, unknown>, ttlSeconds?: number): Promise<void> {
    const client = getRedisClient();
    await client.set(
      KEYS.pendingSession(key),
      JSON.stringify(data),
      'EX',
      ttlSeconds ?? env.REDIS_OTP_TTL
    );
  },

  /** Get pending session data */
  async get<T = Record<string, unknown>>(key: string): Promise<T | null> {
    const client = getRedisClient();
    const raw = await client.get(KEYS.pendingSession(key));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  /** Delete pending session */
  async del(key: string): Promise<void> {
    const client = getRedisClient();
    await client.del(KEYS.pendingSession(key));
  }
};

// ─── JWT Revocation Helpers (per-jti blocklist) ──────────────
//
// authenticate() does one EXISTS per request. That's O(1) on Redis
// and gives us immediate revocation without the cost of a full
// session lookup. The TTL should match the remaining life of the
// access token so the key auto-expires and we never leak memory.

export const redisRevoked = {
  /** Add a jti to the blocklist with a TTL in seconds. */
  async add(jti: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return; // token is already expired — nothing to revoke
    const client = getRedisClient();
    await client.set(KEYS.revoked(jti), '1', 'EX', ttlSeconds);
  },

  /** True if the jti is on the blocklist. */
  async isRevoked(jti: string): Promise<boolean> {
    const client = getRedisClient();
    const exists = await client.exists(KEYS.revoked(jti));
    return exists === 1;
  },

  /** Remove a jti from the blocklist (not typically needed). */
  async remove(jti: string): Promise<void> {
    const client = getRedisClient();
    await client.del(KEYS.revoked(jti));
  }
};

// ─── Cache Helpers ───────────────────────────────────────────

export const redisCache = {
  /** Get cached value (auto-parse JSON) */
  async get<T>(key: string): Promise<T | null> {
    const client = getRedisClient();
    const raw = await client.get(KEYS.cache(key));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  },

  /** Set cache with optional custom TTL (defaults to REDIS_CACHE_TTL) */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const client = getRedisClient();
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    await client.set(KEYS.cache(key), serialized, 'EX', ttlSeconds ?? env.REDIS_CACHE_TTL);
  },

  /** Delete a cache entry */
  async del(key: string): Promise<void> {
    const client = getRedisClient();
    await client.del(KEYS.cache(key));
  }
};
