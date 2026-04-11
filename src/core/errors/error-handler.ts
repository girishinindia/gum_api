import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { env } from '../../config/env';
import { logger } from '../logger/logger';

import { AppError } from './app-error';

// ═══════════════════════════════════════════════════════════════
// Terminal error handler.
// Mounted LAST, after all routes. Every thrown error lands here.
//   - AppError → status + code + message (+ optional details)
//   - ZodError → 400 VALIDATION_ERROR with issue list
//   - anything else → 500 INTERNAL_ERROR, stack hidden in prod
// ═══════════════════════════════════════════════════════════════

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // ─── AppError (known business errors) ──────────────────
  if (err instanceof AppError) {
    logger.warn(
      { requestId: req.requestId, code: err.code, statusCode: err.statusCode, path: req.path },
      err.message
    );
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
      ...(err.details ? { details: err.details } : {})
    });
    return;
  }

  // ─── ZodError (validation) ─────────────────────────────
  if (err instanceof ZodError) {
    const issues = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code
    }));
    logger.warn({ requestId: req.requestId, issues, path: req.path }, 'Validation failed');
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: issues
    });
    return;
  }

  // ─── Unknown errors ────────────────────────────────────
  const error = err as Error;
  logger.error(
    { requestId: req.requestId, error: error?.message, stack: error?.stack, path: req.path },
    'Unhandled error'
  );
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    code: 'INTERNAL_ERROR',
    ...(env.NODE_ENV === 'development' ? { details: error?.message } : {})
  });
};

// ─── 404 handler ──────────────────────────────────────────
// Mounted just before the error handler to catch unmatched routes.
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND'));
};
