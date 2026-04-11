import pino, { Logger, LoggerOptions } from 'pino';

import { env } from '../../config/env';

// ═══════════════════════════════════════════════════════════════
// Structured logger (pino).
//   - Pretty-printed in development, JSON in production.
//   - Log level controlled via LOG_LEVEL env var.
//   - All modules should import { logger } from here — never call
//     console.log / console.error directly.
// ═══════════════════════════════════════════════════════════════

const baseOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  base: {
    app: env.APP_NAME,
    env: env.NODE_ENV
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.password_hash',
      '*.jwt',
      '*.accessToken',
      '*.refreshToken',
      '*.otp'
    ],
    censor: '[REDACTED]'
  }
};

const devTransport =
  env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
          }
        }
      }
    : {};

export const logger: Logger = pino({ ...baseOptions, ...devTransport });
