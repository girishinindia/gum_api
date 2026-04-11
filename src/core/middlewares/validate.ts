// ═══════════════════════════════════════════════════════════════
// validate(schema) — generic request validation middleware.
//
// Accepts either:
//   • a single ZodSchema → validates req.body
//   • an object { body?, params?, query? } → validates each present
//     target and replaces `req.{body|params|query}` with the *parsed*
//     result so downstream handlers read the coerced, defaulted,
//     type-safe shape.
//
// On failure throws the ZodError, which the terminal errorHandler
// converts into a 400 VALIDATION_ERROR envelope with per-issue details.
// ═══════════════════════════════════════════════════════════════

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodSchema } from 'zod';

type ValidateTargets = {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
};

type ValidateInput = ZodSchema | ValidateTargets;

/** Duck-typing — a ZodSchema has a `.parse` method. */
const isZodSchema = (v: unknown): v is ZodSchema =>
  typeof v === 'object' && v !== null && typeof (v as ZodSchema).parse === 'function';

export const validate = (input: ValidateInput): RequestHandler => {
  // Normalize: bare schema is shorthand for { body: schema }
  const targets: ValidateTargets = isZodSchema(input) ? { body: input } : input;

  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (targets.body) {
        // parse → mutate. Zod .parse throws on failure, which
        // propagates up to the error handler unchanged.
        req.body = targets.body.parse(req.body);
      }
      if (targets.params) {
        // req.params is typed as ParamsDictionary but assignment works
        // in Express 4. Cast keeps TS happy without `any`.
        req.params = targets.params.parse(req.params) as Request['params'];
      }
      if (targets.query) {
        req.query = targets.query.parse(req.query) as Request['query'];
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Type helper for typed handlers:
 *
 *   router.get(
 *     '/:id',
 *     validate({ params: idParamSchema, query: paginationSchema }),
 *     async (req: ValidatedRequest<unknown, IdParam, Pagination>, res) => { ... }
 *   );
 *
 * Express's own Request<Params, ResBody, ReqBody, ReqQuery> generics
 * already exist, so this is just a friendlier re-alias with the
 * argument order that matches our `validate()` shape.
 */
export type ValidatedRequest<
  BodyT = unknown,
  ParamsT = Record<string, string>,
  QueryT = Record<string, string>
> = Request<ParamsT, unknown, BodyT, QueryT>;
