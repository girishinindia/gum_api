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

  // ⚠️  TEMPORARY: Expose error details in production for debugging.
  //     Revert to safe error messages once the issue is identified.
  //     Original code: only show details when isDev = true.
  return res.status(500).json({
    success: false,
    message: error instanceof Error ? error.message : 'Internal server error',
    ...(error instanceof Error && {
      errorName: error.name,
      stack: error.stack,
      // Include PostgreSQL/Redis specific error properties if present
      code: (error as { code?: string }).code ?? undefined,
      address: (error as { address?: string }).address ?? undefined,
      port: (error as { port?: number }).port ?? undefined
    })
  });
};
