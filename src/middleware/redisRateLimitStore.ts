/**
 * Redis-backed Store for express-rate-limit
 * ─────────────────────────────────────────
 * The default express-rate-limit store is per-process memory: limits reset on
 * restart and are NOT shared across instances/workers, so a horizontally
 * scaled deployment multiplies every limit by the instance count.
 *
 * This store keeps counters in the existing ioredis (Upstash) connection
 * using INCR + PEXPIRE — no extra dependency needed.
 *
 * Fail-open by design: if Redis is briefly unavailable, requests are allowed
 * (totalHits=1) rather than 500-ing every endpoint behind a limiter.
 */

import type { Store, Options, ClientRateLimitInfo } from 'express-rate-limit';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

export class RedisRateLimitStore implements Store {
  /** Distinct prefix per limiter so different windows don't share counters.
   *  Public because express-rate-limit's Store interface declares `prefix`. */
  public readonly prefix: string;
  private windowMs = 60_000;

  constructor(prefix: string) {
    this.prefix = `rl:${prefix}:`;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private key(key: string): string {
    return `${this.prefix}${key}`;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const k = this.key(key);
    try {
      const totalHits = await redis.incr(k);
      if (totalHits === 1) {
        await redis.pexpire(k, this.windowMs);
      }
      let ttl = await redis.pttl(k);
      if (ttl < 0) {
        // Key somehow has no TTL — repair it so it can't grow forever.
        await redis.pexpire(k, this.windowMs);
        ttl = this.windowMs;
      }
      return { totalHits, resetTime: new Date(Date.now() + ttl) };
    } catch (e: any) {
      logger.warn({ err: e?.message, key: k }, '[RateLimit] Redis unavailable — failing open');
      return { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) };
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      await redis.decr(this.key(key));
    } catch { /* best-effort */ }
  }

  async resetKey(key: string): Promise<void> {
    try {
      await redis.del(this.key(key));
    } catch { /* best-effort */ }
  }
}
