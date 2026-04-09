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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "User role assignments retrieved successfully" }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       userId: { type: integer }
 *                       roleId: { type: integer }
 *                       roleCode: { type: string }
 *                       roleName: { type: string }
 *                       contextType: { type: string, nullable: true }
 *                       contextId: { type: integer, nullable: true }
 *                       isActive: { type: boolean }
 *                       expiresAt: { type: string, format: date-time, nullable: true }
 *                       reason: { type: string, nullable: true }
 *                       createdAt: { type: string, format: date-time }
 *                       updatedAt: { type: string, format: date-time }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page: { type: integer, example: 1 }
 *                     limit: { type: integer, example: 20 }
 *                     totalCount: { type: integer }
 *                     totalPages: { type: integer }
 *       400:
 *         description: Invalid query parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Validation failed" }
 *                 errors:
 *                   type: object
 *                   properties:
 *                     fieldErrors: { type: object }
 *                     formErrors: { type: array, items: { type: string } }
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Unauthorized" }
 *                 code: { type: string, example: "UNAUTHORIZED" }
 *                 details: { type: 'null' }
 *       403:
 *         description: Forbidden (role.assign required)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Forbidden" }
 *                 code: { type: string, example: "FORBIDDEN" }
 *                 details: { type: 'null' }
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "User role assignment retrieved successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     userId: { type: integer }
 *                     roleId: { type: integer }
 *                     roleCode: { type: string }
 *                     roleName: { type: string }
 *                     contextType: { type: string, nullable: true }
 *                     contextId: { type: integer, nullable: true }
 *                     isActive: { type: boolean }
 *                     expiresAt: { type: string, format: date-time, nullable: true }
 *                     reason: { type: string, nullable: true }
 *                     createdAt: { type: string, format: date-time }
 *                     updatedAt: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Unauthorized" }
 *                 code: { type: string, example: "UNAUTHORIZED" }
 *                 details: { type: 'null' }
 *       403:
 *         description: Forbidden (role.assign required)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Forbidden" }
 *                 code: { type: string, example: "FORBIDDEN" }
 *                 details: { type: 'null' }
 *       404:
 *         description: Assignment not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Assignment not found" }
 *                 code: { type: string, example: "NOT_FOUND" }
 *                 details: { type: 'null' }
 */
userRoleAssignmentRoutes.get('/:id', authMiddleware, authorize('role.assign'), validate(assignmentIdParamDto), getAssignment);

// ─── Create assignment ─────────────────────────────────────
/**
 * @swagger
 * /api/v1/user-role-assignments:
 *   post:
 *     tags: [User Role Assignments]
 *     summary: Create assignment
 *     description: Assigns a role to a user with optional context (course, batch, etc.) and expiration. RBAC guards prevent Admin from assigning SA/admin/student/instructor roles. Only SA can assign student or instructor roles.
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "User role assignment created successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     userId: { type: integer }
 *                     roleId: { type: integer }
 *                     roleCode: { type: string }
 *                     roleName: { type: string }
 *                     contextType: { type: string, nullable: true }
 *                     contextId: { type: integer, nullable: true }
 *                     isActive: { type: boolean }
 *                     expiresAt: { type: string, format: date-time, nullable: true }
 *                     reason: { type: string, nullable: true }
 *                     createdAt: { type: string, format: date-time }
 *       400:
 *         description: Invalid request body
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Validation failed" }
 *                 errors:
 *                   type: object
 *                   properties:
 *                     fieldErrors: { type: object }
 *                     formErrors: { type: array, items: { type: string } }
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Unauthorized" }
 *                 code: { type: string, example: "UNAUTHORIZED" }
 *                 details: { type: 'null' }
 *       403:
 *         description: Forbidden - one of RBAC guard errors
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string }
 *                 code: { type: string, enum: ["ADMIN_CANNOT_ASSIGN_ADMIN", "CANNOT_ASSIGN_PROTECTED_ROLE", "FORBIDDEN"], example: "ADMIN_CANNOT_ASSIGN_ADMIN" }
 *                 details: { type: 'null' }
 *       409:
 *         description: Duplicate assignment (user already has this role in same context)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "This role is already assigned to the user." }
 *                 code: { type: string, example: "DUPLICATE_ENTRY" }
 *                 details: { type: 'null' }
 */
userRoleAssignmentRoutes.post('/', authMiddleware, authorize('role.assign'), validate(createAssignmentDto), createAssignment);

// ─── Update assignment ─────────────────────────────────────
/**
 * @swagger
 * /api/v1/user-role-assignments/{id}:
 *   patch:
 *     tags: [User Role Assignments]
 *     summary: Update assignment
 *     description: Updates expiration, reason, or active status. RBAC guards prevent unauthorized role changes.
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "User role assignment updated successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     userId: { type: integer }
 *                     roleId: { type: integer }
 *                     roleCode: { type: string }
 *                     roleName: { type: string }
 *                     contextType: { type: string, nullable: true }
 *                     contextId: { type: integer, nullable: true }
 *                     isActive: { type: boolean }
 *                     expiresAt: { type: string, format: date-time, nullable: true }
 *                     reason: { type: string, nullable: true }
 *                     updatedAt: { type: string, format: date-time }
 *       400:
 *         description: Invalid request body
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Validation failed" }
 *                 errors:
 *                   type: object
 *                   properties:
 *                     fieldErrors: { type: object }
 *                     formErrors: { type: array, items: { type: string } }
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Unauthorized" }
 *                 code: { type: string, example: "UNAUTHORIZED" }
 *                 details: { type: 'null' }
 *       403:
 *         description: Forbidden (RBAC guard blocked - protected role)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string }
 *                 code: { type: string, example: "FORBIDDEN" }
 *                 details: { type: 'null' }
 *       404:
 *         description: Assignment not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Assignment not found" }
 *                 code: { type: string, example: "NOT_FOUND" }
 *                 details: { type: 'null' }
 */
userRoleAssignmentRoutes.patch('/:id', authMiddleware, authorize('role.assign'), validate(updateAssignmentDto), updateAssignment);

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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "User role assignment deleted successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     userId: { type: integer }
 *                     roleId: { type: integer }
 *                     deletedAt: { type: string, format: date-time, nullable: true }
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Unauthorized" }
 *                 code: { type: string, example: "UNAUTHORIZED" }
 *                 details: { type: 'null' }
 *       403:
 *         description: Forbidden (RBAC guard blocked - protected role)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Forbidden" }
 *                 code: { type: string, example: "FORBIDDEN" }
 *                 details: { type: 'null' }
 *       404:
 *         description: Assignment not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Assignment not found" }
 *                 code: { type: string, example: "NOT_FOUND" }
 *                 details: { type: 'null' }
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "User role assignment restored successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     userId: { type: integer }
 *                     roleId: { type: integer }
 *                     roleCode: { type: string }
 *                     roleName: { type: string }
 *                     contextType: { type: string, nullable: true }
 *                     contextId: { type: integer, nullable: true }
 *                     isActive: { type: boolean }
 *                     expiresAt: { type: string, format: date-time, nullable: true }
 *                     reason: { type: string, nullable: true }
 *                     createdAt: { type: string, format: date-time }
 *                     updatedAt: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Unauthorized" }
 *                 code: { type: string, example: "UNAUTHORIZED" }
 *                 details: { type: 'null' }
 *       403:
 *         description: Forbidden (role.assign required)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Forbidden" }
 *                 code: { type: string, example: "FORBIDDEN" }
 *                 details: { type: 'null' }
 *       404:
 *         description: Assignment not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Assignment not found" }
 *                 code: { type: string, example: "NOT_FOUND" }
 *                 details: { type: 'null' }
 */
userRoleAssignmentRoutes.patch('/:id/restore', authMiddleware, authorize('role.assign'), validate(assignmentIdParamDto), restoreAssignment);

export { userRoleAssignmentRoutes };
