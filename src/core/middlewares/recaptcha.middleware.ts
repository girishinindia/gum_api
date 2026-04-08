import { NextFunction, Request, Response } from 'express';

import { recaptchaService } from '../../integrations/recaptcha/recaptcha.service';

/**
 * Middleware that verifies reCAPTCHA token from request body.
 * Auto-skips in development/test (handled inside recaptchaService).
 *
 * Usage:  router.post('/register', recaptchaMiddleware('REGISTER'), validate(...), register)
 *
 * Client must send { recaptchaToken: "..." } in the request body.
 */
export const recaptchaMiddleware = (expectedAction?: string) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = req.body?.recaptchaToken ?? '';
      await recaptchaService.verify(token, expectedAction);
      next();
    } catch (error) {
      next(error);
    }
  };
};
