import { Router } from 'express';

import { getHealth, getDebugHealth } from './health.controller';

const healthRoutes = Router();

/**
 * @swagger
 * /api/v1/health:
 *   get:
 *     tags: [Health]
 *     summary: Health check
 *     description: Returns API status, version, and timezone. No authentication required.
 *     responses:
 *       200:
 *         description: API is running and healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "API is healthy" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     status: { type: string, example: "OK" }
 *                     version: { type: string, example: "1.0.0" }
 *                     timestamp: { type: string, format: date-time }
 *                     timezone: { type: string, example: "UTC" }
 */
healthRoutes.get('/', getHealth);

// ⚠️  Debug endpoint — REMOVE after identifying the production issue
/**
 * @swagger
 * /api/v1/health/debug:
 *   get:
 *     tags: [Health]
 *     summary: Debug health check
 *     description: Returns extended debug information including database and Redis connectivity. For development/troubleshooting only.
 *     responses:
 *       200:
 *         description: Extended debug information returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Debug info" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     status: { type: string, example: "OK" }
 *                     version: { type: string, example: "1.0.0" }
 *                     timestamp: { type: string, format: date-time }
 *                     timezone: { type: string, example: "UTC" }
 *                     database:
 *                       type: object
 *                       properties:
 *                         connected: { type: boolean, example: true }
 *                         latency: { type: integer, description: "Response time in milliseconds" }
 *                     redis:
 *                       type: object
 *                       properties:
 *                         connected: { type: boolean, example: true }
 *                         latency: { type: integer, description: "Response time in milliseconds" }
 */
healthRoutes.get('/debug', getDebugHealth);

export { healthRoutes };
