import { CorsOptions } from 'cors';

import { env } from './env';

export const buildCorsOptions = (): CorsOptions => ({
  origin(origin, callback) {
    if (!origin || env.CORS_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('CORS origin not allowed'));
  },
  credentials: true
});
