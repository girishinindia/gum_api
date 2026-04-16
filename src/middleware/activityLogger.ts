import { Request, Response, NextFunction } from 'express';
import { logSystem } from '../services/activityLog.service';
import { getClientIp } from '../utils/helpers';

export const activityLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const origJson = res.json.bind(res);
  res.json = (body: any) => {
    const ms = Date.now() - start;
    if (res.statusCode >= 400) {
      logSystem({ level: res.statusCode >= 500 ? 'error' : 'warn', source: 'api', action: 'http_error', message: `${req.method} ${req.originalUrl} → ${res.statusCode}`, userId: req.user?.id, ip: getClientIp(req), endpoint: req.originalUrl, httpMethod: req.method, statusCode: res.statusCode, responseTime: ms, metadata: { error: body?.error } }).catch(() => {});
    }
    return origJson(body);
  };
  next();
};
