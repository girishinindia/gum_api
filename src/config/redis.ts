import Redis from 'ioredis';
import { config } from './index';
import { logger } from '../utils/logger';

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => Math.min(times * 200, 2000),
});
redis.on('error', (err) => logger.error({ err }, '[Redis] Error'));
redis.on('connect', () => logger.info('[Redis] Connected'));
