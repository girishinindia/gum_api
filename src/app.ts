import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { apiRouter } from './api';
import { buildCorsOptions } from './config/cors';
import { env } from './config/env';
import { swaggerSpec } from './config/swagger';
import { errorHandler } from './core/errors/error-handler';
import { notFoundMiddleware } from './core/middlewares/not-found.middleware';
import { globalRateLimiter } from './core/middlewares/rate-limit.middleware';
import { requestLogger } from './core/logger/request-logger';

const app = express();

// Trust first proxy (Nginx) — required for correct IP detection
// in rate limiting, logging, and X-Forwarded-* headers
if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet());
app.use(compression());
app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(globalRateLimiter);
app.use(requestLogger);

// Files are served from Bunny CDN (cdn.growupmore.com), not from this server.

app.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: `${env.APP_NAME} is running`,
    data: {
      version: env.API_VERSION,
      timezone: env.TIMEZONE,
      docsHint: 'Use /api/v1/health to verify API routing.'
    }
  });
});

// ─── Swagger API Docs ─────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'GrowUpMore API Docs',
  customCss: '.swagger-ui .topbar { display: none }',
  swaggerOptions: { persistAuthorization: true, docExpansion: 'none', filter: true }
}));
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

app.use('/api', apiRouter);
app.use(notFoundMiddleware);
app.use(errorHandler);

export { app };
