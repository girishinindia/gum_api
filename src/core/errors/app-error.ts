// ═══════════════════════════════════════════════════════════════
// AppError — the single error type thrown throughout the API.
//
// Every expected business/validation/UDF failure becomes an AppError
// somewhere in the stack. The terminal error-handler middleware is
// the only place that maps AppError → HTTP response. No other file
// should touch Express's res.status() for errors.
// ═══════════════════════════════════════════════════════════════

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    // Maintain proper stack trace for V8
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, AppError);
    }

    // Restore prototype chain (needed when extending built-ins in TS/CJS)
    Object.setPrototypeOf(this, AppError.prototype);
  }

  // ─── Factory helpers for common cases ────────────────────

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(message, 400, 'BAD_REQUEST', details);
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError(message, 400, 'VALIDATION_ERROR', details);
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(message, 404, 'NOT_FOUND');
  }

  static conflict(message: string): AppError {
    return new AppError(message, 409, 'CONFLICT');
  }

  static internal(message = 'Internal server error', details?: unknown): AppError {
    return new AppError(message, 500, 'INTERNAL_ERROR', details);
  }
}
