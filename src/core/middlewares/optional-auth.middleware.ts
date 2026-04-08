import { NextFunction, Request, Response } from 'express';

import { verifyAccessToken } from '../utils/jwt';

export const optionalAuthMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  const authorization = req.headers.authorization;

  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice(7);
    try {
      req.user = verifyAccessToken(token);
    } catch {
      req.user = undefined;
    }
  }

  next();
};
