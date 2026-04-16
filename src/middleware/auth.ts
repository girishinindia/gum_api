import { Request, Response, NextFunction } from 'express';
import { verifyAccess } from '../services/token.service';
import { err } from '../utils/response';

declare global { namespace Express { interface Request { user?: { id: number }; } } }

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return err(res, 'No token provided', 401);
  try {
    const payload = verifyAccess(header.split(' ')[1]);
    req.user = { id: payload.sub };
    next();
  } catch (e: any) {
    return res.status(401).json({ success: false, error: e.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token', code: e.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN' });
  }
};
