import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { err } from '../utils/response';

export const validate = (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const messages = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    return err(res, 'Validation failed', 400, messages);
  }
  (req as any).validated = result.data;
  next();
};

export const validateQuery = (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
  const result = schema.safeParse(req.query);
  if (!result.success) return err(res, 'Invalid query params', 400, result.error.issues.map(i => i.message));
  (req as any).validatedQuery = result.data;
  next();
};
