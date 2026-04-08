import { Router } from 'express';

import { authMiddleware } from '../../../core/middlewares/auth.middleware';
import { recaptchaMiddleware } from '../../../core/middlewares/recaptcha.middleware';
import { validate } from '../../../core/middlewares/validate.middleware';
import { loginDto, refreshDto, registerDto } from './auth.dto';
import { login, logout, refresh, register } from './auth.controller';

const authRoutes = Router();

// reCAPTCHA runs first — auto-skips in development, enforced in production
authRoutes.post('/register', recaptchaMiddleware('REGISTER'), validate(registerDto), register);
authRoutes.post('/login', recaptchaMiddleware('LOGIN'), validate(loginDto), login);
authRoutes.post('/refresh', validate(refreshDto), refresh);
authRoutes.post('/logout', authMiddleware, logout);

export { authRoutes };
