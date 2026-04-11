import type { NextFunction, Request, RequestHandler, Response } from 'express';

// ═══════════════════════════════════════════════════════════════
// asyncHandler — wraps async Express handlers so thrown errors
// (including from rejected promises) propagate to the terminal
// error-handler middleware instead of crashing the process.
// ═══════════════════════════════════════════════════════════════

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

export const asyncHandler =
  (fn: AsyncRequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
