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

/**
 * @swagger
 * /api/v1/users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get my profile
 *     description: Returns the authenticated user's own profile with country details.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 *       401:
 *         description: Not authenticated
 */
userRoutes.get('/me', authMiddleware, getMe);
/**
 * @swagger
 * /api/v1/users/me:
 *   patch:
 *     tags: [Users]
 *     summary: Update my profile
 *     description: Updates the authenticated user's own first name and/or last name.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName: { type: string, minLength: 2, maxLength: 80 }
 *               lastName: { type: string, minLength: 1, maxLength: 80 }
 *     responses:
 *       200:
 *         description: Profile updated
 *       401:
 *         description: Not authenticated
 */
userRoutes.patch('/me', authMiddleware, validate(updateMeDto), updateMe);

// ─── Admin CRUD (RBAC-protected) ────────────────────────────

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     tags: [Users]
 *     summary: List users
 *     description: Returns paginated list of users with filtering and search. Requires user.read permission.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema: { type: string, enum: ["true", "false"] }
 *       - in: query
 *         name: isDeleted
 *         schema: { type: string, enum: ["true", "false"] }
 *       - in: query
 *         name: isEmailVerified
 *         schema: { type: string, enum: ["true", "false"] }
 *       - in: query
 *         name: isMobileVerified
 *         schema: { type: string, enum: ["true", "false"] }
 *       - in: query
 *         name: countryId
 *         schema: { type: integer }
 *       - in: query
 *         name: countryIso2
 *         schema: { type: string }
 *       - in: query
 *         name: nationality
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by name, email, or mobile
 *       - in: query
 *         name: sortBy
 *         schema: { type: string }
 *       - in: query
 *         name: sortDir
 *         schema: { type: string, enum: [ASC, DESC] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200:
 *         description: Paginated user list
 *       403:
 *         description: Insufficient permissions
 */
userRoutes.get('/', authMiddleware, authorize('user.read'), validate(listUsersDto), listUsers);
/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get user by ID
 *     description: Returns a single user with country details. Requires user.read permission.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: User found
 *       404:
 *         description: User not found
 */
userRoutes.get('/:id', authMiddleware, authorize('user.read'), validate(userIdParamDto), getUserById);
/**
 * @swagger
 * /api/v1/users:
 *   post:
 *     tags: [Users]
 *     summary: Create user (admin)
 *     description: Creates a new user. Requires user.create permission. Optional roleId assigns a role with RBAC guards.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, password]
 *             properties:
 *               firstName: { type: string, minLength: 2, maxLength: 80, example: "Rajesh" }
 *               lastName: { type: string, minLength: 1, maxLength: 80, example: "Kumar" }
 *               email: { type: string, format: email }
 *               mobile: { type: string, minLength: 7, maxLength: 20 }
 *               password: { type: string, minLength: 8, maxLength: 128 }
 *               countryId: { type: integer }
 *               roleId: { type: integer, description: "Optional — assigns role on creation. SA can assign any role. Admin cannot assign SA/admin/student/instructor." }
 *               isActive: { type: boolean, default: true }
 *               isEmailVerified: { type: boolean, default: false }
 *               isMobileVerified: { type: boolean, default: false }
 *     responses:
 *       201:
 *         description: User created
 *       403:
 *         description: RBAC guard blocked role assignment
 *       409:
 *         description: Email or mobile already exists
 */
userRoutes.post('/', authMiddleware, authorize('user.create'), validate(createUserDto), createUser);
/**
 * @swagger
 * /api/v1/users/{id}:
 *   put:
 *     tags: [Users]
 *     summary: Update user (admin)
 *     description: Updates user details. Requires user.update permission.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               email: { type: string, format: email }
 *               mobile: { type: string }
 *               password: { type: string }
 *               countryId: { type: integer }
 *               isActive: { type: boolean }
 *               isEmailVerified: { type: boolean }
 *               isMobileVerified: { type: boolean }
 *     responses:
 *       200:
 *         description: User updated
 *       404:
 *         description: User not found
 */
userRoutes.put('/:id', authMiddleware, authorize('user.update'), validate(updateUserDto), updateUser);
/**
 * @swagger
 * /api/v1/users/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Soft-delete user
 *     description: Soft-deletes a user. Requires user.delete permission (Super Admin only). Cannot delete self or other Super Admins.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: User soft-deleted
 *       403:
 *         description: Cannot delete self or Super Admin
 *       404:
 *         description: User not found
 */
userRoutes.delete('/:id', authMiddleware, authorize('user.delete'), validate(userIdParamDto), deleteUser);
/**
 * @swagger
 * /api/v1/users/{id}/restore:
 *   patch:
 *     tags: [Users]
 *     summary: Restore user
 *     description: Restores a soft-deleted user. Requires user.restore permission (Super Admin only).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: User restored
 *       404:
 *         description: User not found or not deleted
 */
userRoutes.patch('/:id/restore', authMiddleware, authorize('user.restore'), validate(userIdParamDto), restoreUser);

export { userRoutes };
