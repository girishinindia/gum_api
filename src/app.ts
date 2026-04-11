import 'express-async-errors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Express, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import hpp from 'hpp';
import { v4 as uuidv4 } from 'uuid';
import swaggerUi from 'swagger-ui-express';

import { API_PREFIX } from './config/constants';
import { buildCorsOptions } from './config/cors';
import { env } from './config/env';
import { globalRateLimiter } from './config/rate-limit';
import { swaggerSpec } from './config/swagger';
import { errorHandler, notFoundHandler } from './core/errors/error-handler';
import { logger } from './core/logger/logger';

import apiRouter from './api';

// ═══════════════════════════════════════════════════════════════
// Express application wiring.
// Order matters: security → parsers → logging → routes → 404 → errors.
// ═══════════════════════════════════════════════════════════════

export const buildApp = (): Express => {
  const app = express();

  // ─── Trust proxy (needed for correct IPs behind a load balancer) ──
  app.set('trust proxy', 1);

  // ─── Request ID (attach first so logs can correlate) ───
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.requestId = (req.headers['x-request-id'] as string) ?? uuidv4();
    next();
  });

  // ─── Security ──────────────────────────────────────────
  app.use(helmet());
  app.use(cors(buildCorsOptions()));
  app.use(hpp());

  // ─── Parsers ───────────────────────────────────────────
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));
  app.use(cookieParser());
  app.use(compression());

  // ─── Rate limit (global) ───────────────────────────────
  app.use(globalRateLimiter);

  // ─── Request logging (lightweight) ─────────────────────
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug({ requestId: req.requestId, method: req.method, path: req.path }, 'incoming');
    next();
  });

  // ─── Swagger UI ────────────────────────────────────────
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

  // ─── Mounted API ───────────────────────────────────────
  app.use(API_PREFIX, apiRouter);

  // ─── Root ──────────────────────────────────────────────
  app.get('/', (_req, res) => {
    res.json({
      success: true,
      message: `${env.APP_NAME} is running`,
      data: { version: env.API_VERSION, docs: '/api/docs' }
    });
  });

  // ─── 404 + terminal error handler (must be last) ───────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
