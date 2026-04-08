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
 *         description: API is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "API is healthy" }
 *                 data: { type: object }
 */
healthRoutes.get('/', getHealth);

// ⚠️  Debug endpoint — REMOVE after identifying the production issue
/**
 * @swagger
 * /api/v1/health/debug:
 *   get:
 *     tags: [Health]
 *     summary: Debug health check
 *     description: Returns extended debug information. For development/troubleshooting only.
 *     responses:
 *       200:
 *         description: Debug info returned
 */
healthRoutes.get('/debug', getDebugHealth);

export { healthRoutes };
