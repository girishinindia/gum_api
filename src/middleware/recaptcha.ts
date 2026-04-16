import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { err } from '../utils/response';

export const recaptcha = () => async (req: Request, res: Response, next: NextFunction) => {
  if (!config.recaptcha.enabled) return next();

  const token = req.headers['x-recaptcha-token'] as string || req.body?.recaptcha_token;
  if (!token) return err(res, 'reCAPTCHA token required', 400);

  try {
    const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${config.recaptcha.secretKey}&response=${token}`;
    const resp = await fetch(verifyUrl, { method: 'POST' });
    const data = await resp.json() as any;
    if (!data.success || (data.score !== undefined && data.score < config.recaptcha.minScore)) {
      return err(res, 'reCAPTCHA verification failed', 403);
    }
    next();
  } catch { return err(res, 'reCAPTCHA verification error', 500); }
};
