import { Router } from 'express';

import { authMiddleware } from '../../../core/middlewares/auth.middleware';
import { validate } from '../../../core/middlewares/validate.middleware';
import { getMe, updateMe } from './user.controller';
import { updateMeDto } from './user.dto';

const userRoutes = Router();

userRoutes.get('/me', authMiddleware, getMe);
userRoutes.patch('/me', authMiddleware, validate(updateMeDto), updateMe);

export { userRoutes };
