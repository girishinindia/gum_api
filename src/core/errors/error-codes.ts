// ═══════════════════════════════════════════════════════════════
// Canonical error codes used across the API.
// These are returned in ErrorResponse.code and consumed by clients
// to branch UI messaging without parsing human-readable text.
// ═══════════════════════════════════════════════════════════════

export const ErrorCodes = {
  // ─── 4xx — Client ────────────────────────────────────────
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  CONFLICT: 'CONFLICT',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  AUTH_RATE_LIMIT_EXCEEDED: 'AUTH_RATE_LIMIT_EXCEEDED',

  // ─── 5xx — Server ────────────────────────────────────────
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UDF_ERROR: 'UDF_ERROR',
  UDF_NO_RESULT: 'UDF_NO_RESULT',
  DB_CONNECTION_ERROR: 'DB_CONNECTION_ERROR',
  REDIS_ERROR: 'REDIS_ERROR',
  EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
  SMS_SEND_FAILED: 'SMS_SEND_FAILED',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR'
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
