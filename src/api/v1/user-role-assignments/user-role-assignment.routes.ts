import { Router } from 'express';

import { authMiddleware } from '../../../core/middlewares/auth.middleware';
import { authorize } from '../../../core/middlewares/authorize.middleware';
import { validate } from '../../../core/middlewares/validate.middleware';
import {
  listAssignments,
  getAssignment,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  restoreAssignment
} from './user-role-assignment.controller';
import {
  listAssignmentsDto,
  assignmentIdParamDto,
  createAssignmentDto,
  updateAssignmentDto
} from './user-role-assignment.dto';

const userRoleAssignmentRoutes = Router();

// ─── List assignments ──────────────────────────────────────
/**
 * @swagger
 * /api/v1/user-role-assignments:
 *   get:
 *     tags: [User Role Assignments]
 *     summary: List assignments
 *     description: Returns paginated user-role assignments with filtering. Requires role.assign permission.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: integer }
 *       - in: query
 *         name: roleId
 *         schema: { type: integer }
 *       - in: query
 *         name: roleCode
 *         schema: { type: string }
 *       - in: query
 *         name: contextType
 *         schema: { type: string, enum: [course, batch, department, branch, internship] }
 *       - in: query
 *         name: contextId
 *         schema: { type: integer }
 *       - in: query
 *         name: isActive
 *         schema: { type: string, enum: ["true", "false"] }
 *       - in: query
 *         name: isValid
 *         schema: { type: string, enum: ["true", "false"] }
 *         description: Filter by validity (active + not expired)
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 200 }
 *     responses:
 *       200:
 *         description: Paginated assignment list
 */
userRoleAssignmentRoutes.get('/', authMiddleware, authorize('role.assign'), validate(listAssignmentsDto), listAssignments);

// ─── Get single assignment ─────────────────────────────────
/**
 * @swagger
 * /api/v1/user-role-assignments/{id}:
 *   get:
 *     tags: [User Role Assignments]
 *     summary: Get assignment by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Assignment found
 *       404:
 *         description: Assignment not found
 */
userRoleAssignmentRoutes.get('/:id', authMiddleware, authorize('role.assign'), validate(assignmentIdParamDto), getAssignment);

// ─── Create assignment ─────────────────────────────────────
/**
 * @swagger
 * /api/v1/user-role-assignments:
 *   post:
 *     tags: [User Role Assignments]
 *     summary: Create assignment
 *     description: Assigns a role to a user with optional context (course, batch, etc.) and expiration. RBAC guards prevent Admin from assigning SA/admin/student/instructor roles.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, roleId]
 *             properties:
 *               userId: { type: integer }
 *               roleId: { type: integer }
 *               contextType: { type: string, enum: [course, batch, department, branch, internship] }
 *               contextId: { type: integer }
 *               expiresAt: { type: string, format: date-time }
 *               reason: { type: string }
 *     responses:
 *       201:
 *         description: Assignment created
 *       403:
 *         description: RBAC guard blocked
 *       409:
 *         description: Duplicate assignment
 */
userRoleAssignmentRoutes.post('/', authMiddleware, authorize('role.assign'), validate(createAssignmentDto), createAssignment);

// ─── Update assignment ─────────────────────────────────────
/**
 * @swagger
 * /api/v1/user-role-assignments/{id}:
 *   put:
 *     tags: [User Role Assignments]
 *     summary: Update assignment
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
 *               expiresAt: { type: string, format: date-time }
 *               reason: { type: string }
 *               isActive: { type: boolean }
 *     responses:
 *       200:
 *         description: Assignment updated
 *       403:
 *         description: RBAC guard blocked
 */
userRoleAssignmentRoutes.put('/:id', authMiddleware, authorize('role.assign'), validate(updateAssignmentDto), updateAssignment);

// ─── Delete assignment (soft) ──────────────────────────────
/**
 * @swagger
 * /api/v1/user-role-assignments/{id}:
 *   delete:
 *     tags: [User Role Assignments]
 *     summary: Soft-delete assignment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Assignment soft-deleted
 *       403:
 *         description: RBAC guard blocked
 */
userRoleAssignmentRoutes.delete('/:id', authMiddleware, authorize('role.assign'), validate(assignmentIdParamDto), deleteAssignment);

// ─── Restore assignment ────────────────────────────────────
/**
 * @swagger
 * /api/v1/user-role-assignments/{id}/restore:
 *   patch:
 *     tags: [User Role Assignments]
 *     summary: Restore assignment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Assignment restored
 */
userRoleAssignmentRoutes.patch('/:id/restore', authMiddleware, authorize('role.assign'), validate(assignmentIdParamDto), restoreAssignment);

export { userRoleAssignmentRoutes };
