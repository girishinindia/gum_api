import { Router } from 'express';

import { authRoutes } from './auth/auth.routes';
import { healthRoutes } from './health/health.routes';
import { uploadRoutes } from './uploads/upload.routes';
import { userRoutes } from './users/user.routes';

const v1Router = Router();

v1Router.use('/health', healthRoutes);
v1Router.use('/auth', authRoutes);
v1Router.use('/users', userRoutes);
v1Router.use('/uploads', uploadRoutes);

export { v1Router };
