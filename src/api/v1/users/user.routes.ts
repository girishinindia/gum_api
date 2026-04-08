import { Router } from 'express';

import { authMiddleware } from '../../../core/middlewares/auth.middleware';
import { authorize } from '../../../core/middlewares/authorize.middleware';
import { validate } from '../../../core/middlewares/validate.middleware';
import {
  getMe,
  updateMe,
  listUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  restoreUser
} from './user.controller';
import {
  updateMeDto,
  listUsersDto,
  createUserDto,
  updateUserDto,
  userIdParamDto
} from './user.dto';

const userRoutes = Router();

// ─── Self (authenticated user) ──────────────────────────────

userRoutes.get('/me', authMiddleware, getMe);
userRoutes.patch('/me', authMiddleware, validate(updateMeDto), updateMe);

// ─── Admin CRUD (RBAC-protected) ────────────────────────────

userRoutes.get('/', authMiddleware, authorize('user.read'), validate(listUsersDto), listUsers);
userRoutes.get('/:id', authMiddleware, authorize('user.read'), validate(userIdParamDto), getUserById);
userRoutes.post('/', authMiddleware, authorize('user.create'), validate(createUserDto), createUser);
userRoutes.put('/:id', authMiddleware, authorize('user.update'), validate(updateUserDto), updateUser);
userRoutes.delete('/:id', authMiddleware, authorize('user.delete'), validate(userIdParamDto), deleteUser);
userRoutes.patch('/:id/restore', authMiddleware, authorize('user.restore'), validate(userIdParamDto), restoreUser);

export { userRoutes };
