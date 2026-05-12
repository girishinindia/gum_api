import { redis } from '../config/redis';
import { logger } from '../utils/logger';

const LOCK_PREFIX = 'cron:lock:';
const DEFAULT_TTL = 300; // 5 minutes — prevents stuck locks

/**
 * Acquire a distributed lock via Redis SETNX.
 * Returns true if the lock was acquired, false if another instance holds it.
 */
export async function acquireLock(jobName: string, ttlSeconds = DEFAULT_TTL): Promise<boolean> {
  const key = `${LOCK_PREFIX}${jobName}`;
  const result = await redis.set(key, Date.now().toString(), 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}

/**
 * Release a distributed lock.
 */
export async function releaseLock(jobName: string): Promise<void> {
  const key = `${LOCK_PREFIX}${jobName}`;
  await redis.del(key);
}

/**
 * Wrapper that acquires lock, runs the job, then releases.
 * Skips silently if lock is held by another instance.
 */
export async function withLock(jobName: string, fn: () => Promise<void>, ttlSeconds = DEFAULT_TTL): Promise<boolean> {
  const acquired = await acquireLock(jobName, ttlSeconds);
  if (!acquired) {
    logger.debug({ jobName }, '[Cron] Lock held by another instance — skipping');
    return false;
  }

  try {
    await fn();
    return true;
  } catch (err: any) {
    logger.error({ err: err.message, jobName }, '[Cron] Job failed');
    return false;
  } finally {
    await releaseLock(jobName);
  }
}
