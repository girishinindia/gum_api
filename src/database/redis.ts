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

// ─── Key Prefixes ────────────────────────────────────────────

const KEYS = {
  session: (userId: string) => `session:${userId}`,
  otp: (identifier: string) => `otp:${identifier}`,
  otpAttempts: (identifier: string) => `otp_attempts:${identifier}`,
  otpCooldown: (identifier: string) => `otp_cooldown:${identifier}`,
  cache: (key: string) => `cache:${key}`
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

  /** Verify OTP and track attempts */
  async verify(identifier: string, otp: string): Promise<{ valid: boolean; attemptsLeft: number }> {
    const client = getRedisClient();
    const stored = await client.get(KEYS.otp(identifier));

    if (!stored) {
      return { valid: false, attemptsLeft: 0 };
    }

    // Increment attempt counter
    const attempts = await client.incr(KEYS.otpAttempts(identifier));
    await client.expire(KEYS.otpAttempts(identifier), env.REDIS_OTP_TTL);

    if (attempts > env.OTP_MAX_ATTEMPTS) {
      // Max attempts exceeded — burn the OTP
      await client.del(KEYS.otp(identifier));
      await client.del(KEYS.otpAttempts(identifier));
      return { valid: false, attemptsLeft: 0 };
    }

    const valid = stored === otp;

    if (valid) {
      // OTP used — clean up
      await client.del(KEYS.otp(identifier));
      await client.del(KEYS.otpAttempts(identifier));
    }

    return { valid, attemptsLeft: env.OTP_MAX_ATTEMPTS - attempts };
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
