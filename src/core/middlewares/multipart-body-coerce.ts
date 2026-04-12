// ═══════════════════════════════════════════════════════════════
// multipart-body-coerce — convert stringy multipart values into the
// primitive types zod update-schemas expect.
//
// Why this exists
// ───────────────
// Routes like `PATCH /api/v1/categories/:id` accept both JSON bodies
// and multipart/form-data bodies (the latter when a client is also
// uploading an icon or image in the same request). multer parses
// form-data into `req.body` with EVERY value as a string — including
// what should be booleans ("true", "false") and integers ("5") — so
// a zod schema that expects `isActive: z.boolean()` or
// `displayOrder: z.number().int()` will reject the multipart request
// with a confusing "Expected boolean, received string" error.
//
// This middleware runs AFTER multer and BEFORE validate(). It only
// acts on multipart requests (detected via `req.is('multipart/form-data')`)
// so pure-JSON requests flow through completely unchanged — no
// opportunity for a JSON boolean/number to be accidentally stringified
// back and forth.
//
// Rules
// ─────
//   "true"  / "false"  → true / false   (case-insensitive)
//   "null"             → null
//   "123"              → 123   (integer)
//   "-1.5"             → -1.5  (float)
//   anything else      → unchanged string
//
// Values that are not plain strings (already a bool/number, or a
// nested object/array multer produced for repeated fields) are left
// alone. The walk is one level deep by default — form-data bodies
// are flat, so that is sufficient.
// ═══════════════════════════════════════════════════════════════

import type { NextFunction, Request, RequestHandler, Response } from 'express';

const BOOL_TRUE = /^true$/i;
const BOOL_FALSE = /^false$/i;
const INT = /^-?\d+$/;
const FLOAT = /^-?\d+\.\d+$/;

/**
 * Coerce a single multipart string into its most natural primitive.
 * Exported for unit tests and for callers who need to normalize a
 * nested object by hand.
 */
export const coerceMultipartValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  if (value === '') return value; // preserve empty string — schemas may treat it specially
  if (BOOL_TRUE.test(value)) return true;
  if (BOOL_FALSE.test(value)) return false;
  if (value === 'null') return null;
  if (INT.test(value)) {
    const n = Number(value);
    if (Number.isSafeInteger(n)) return n;
    return value;
  }
  if (FLOAT.test(value)) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
    return value;
  }
  return value;
};

/**
 * Express middleware: on multipart requests, walk `req.body` one
 * level deep and coerce each string value via `coerceMultipartValue`.
 * No-op on JSON / urlencoded / missing content-type.
 */
export const coerceMultipartBody: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  if (!req.is('multipart/form-data')) {
    next();
    return;
  }
  const body = req.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== 'object') {
    next();
    return;
  }
  for (const key of Object.keys(body)) {
    body[key] = coerceMultipartValue(body[key]);
  }
  next();
};
