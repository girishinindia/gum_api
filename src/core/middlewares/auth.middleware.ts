import { NextFunction, Request, Response } from 'express';

import { AppError } from '../errors/app-error';
import { verifyAccessToken } from '../utils/jwt';

export const authMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return next(new AppError('Authorization token is required', 401, 'UNAUTHORIZED'));
  }

  const token = authorization.slice(7);

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(new AppError('Invalid or expired access token', 401, 'UNAUTHORIZED'));
  }
};
