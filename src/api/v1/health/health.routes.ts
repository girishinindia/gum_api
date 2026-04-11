import { Router } from 'express';

import { env } from '../../../config/env';
import { asyncHandler } from '../../../core/utils/async-handler';
import { ok } from '../../../core/utils/api-response';
import { getPool } from '../../../database/pg-pool';
import { getRedisClient } from '../../../database/redis';

const router = Router();

/**
 * @openapi
 * /api/v1/health:
 *   get:
 *     tags: [Health]
 *     summary: Liveness probe
 *     responses:
 *       200:
 *         description: Service is alive
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    return ok(
      res,
      {
        app: env.APP_NAME,
        env: env.NODE_ENV,
        version: env.API_VERSION,
        timestamp: new Date().toISOString()
      },
      'Service is alive'
    );
  })
);

/**
 * @openapi
 * /api/v1/health/ready:
 *   get:
 *     tags: [Health]
 *     summary: Readiness probe (checks DB + Redis)
 *     responses:
 *       200:
 *         description: All dependencies healthy
 *       503:
 *         description: One or more dependencies unavailable
 */
router.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    const checks: Record<string, 'ok' | 'fail'> = {};

    try {
      await getPool().query('SELECT 1');
      checks.database = 'ok';
    } catch {
      checks.database = 'fail';
    }

    try {
      const redis = getRedisClient();
      const pong = await redis.ping();
      checks.redis = pong === 'PONG' ? 'ok' : 'fail';
    } catch {
      checks.redis = 'fail';
    }

    const allOk = Object.values(checks).every((v) => v === 'ok');
    return res.status(allOk ? 200 : 503).json({
      success: allOk,
      message: allOk ? 'Ready' : 'Not ready',
      data: checks
    });
  })
);

export default router;
