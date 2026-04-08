import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { AppError } from './app-error';
import { logger } from '../logger/logger';

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: error.flatten()
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      code: error.code,
      details: error.details ?? null
    });
  }

  // Log full error details (always visible in PM2 logs)
  const errorDetail = error instanceof Error
    ? { message: error.message, name: error.name, stack: error.stack }
    : { raw: String(error) };

  logger.error({ error: errorDetail, url: _req.originalUrl, method: _req.method }, 'Unhandled error');

  // In production: safe message only. In dev: include actual error for debugging.
  const isDev = process.env.NODE_ENV !== 'production';

  return res.status(500).json({
    success: false,
    message: isDev
      ? (error instanceof Error ? error.message : 'Internal server error')
      : 'Internal server error',
    ...(isDev && error instanceof Error && { stack: error.stack })
  });
};
