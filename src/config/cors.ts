import { CorsOptions } from 'cors';

import { env } from './env';

export const buildCorsOptions = (): CorsOptions => ({
  origin(origin, callback) {
    // Allow requests with no origin (Postman, server-to-server, curl, etc.)
    if (!origin) {
      callback(null, true);
      return;
    }

    // Wildcard — allow all origins
    if (env.CORS_ORIGINS.includes('*')) {
      callback(null, true);
      return;
    }

    // Check against whitelist
    if (env.CORS_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('CORS origin not allowed'));
  },
  credentials: true
});