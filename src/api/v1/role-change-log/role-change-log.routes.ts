import { Router } from 'express';

import { authMiddleware } from '../../../core/middlewares/auth.middleware';
import { authorize } from '../../../core/middlewares/authorize.middleware';
import { validate } from '../../../core/middlewares/validate.middleware';
import { listLogs, getLog, createLog } from './role-change-log.controller';
import { listLogsDto, logIdParamDto, createLogDto } from './role-change-log.dto';

const roleChangeLogRoutes = Router();

// ─── List log entries ──────────────────────────────────────
/**
 * @swagger
 * /api/v1/role-change-log:
 *   get:
 *     tags: [Role Change Log]
 *     summary: List audit log entries
 *     description: Returns paginated role change audit logs. Requires admin_log.read permission.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: integer }
 *       - in: query
 *         name: action
 *         schema: { type: string, enum: [assigned, revoked, expired, modified, restored] }
 *       - in: query
 *         name: roleId
 *         schema: { type: integer }
 *       - in: query
 *         name: contextType
 *         schema: { type: string }
 *       - in: query
 *         name: changedBy
 *         schema: { type: integer }
 *       - in: query
 *         name: fromDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: toDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 200 }
 *     responses:
 *       200:
 *         description: Paginated log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Audit logs retrieved successfully" }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       userId: { type: integer }
 *                       action: { type: string }
 *                       roleId: { type: integer }
 *                       roleName: { type: string }
 *                       contextType: { type: string, nullable: true }
 *                       contextId: { type: integer, nullable: true }
 *                       oldValues: { type: object, nullable: true }
 *                       newValues: { type: object, nullable: true }
 *                       reason: { type: string, nullable: true }
 *                       changedBy: { type: integer }
 *                       ipAddress: { type: string, nullable: true }
 *                       createdAt: { type: string, format: date-time }
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
 *         description: Forbidden (admin_log.read required)
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
roleChangeLogRoutes.get('/', authMiddleware, authorize('admin_log.read'), validate(listLogsDto), listLogs);

// ─── Get single log entry ──────────────────────────────────
/**
 * @swagger
 * /api/v1/role-change-log/{id}:
 *   get:
 *     tags: [Role Change Log]
 *     summary: Get log entry by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Log entry found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Audit log retrieved successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     userId: { type: integer }
 *                     action: { type: string }
 *                     roleId: { type: integer }
 *                     roleName: { type: string }
 *                     contextType: { type: string, nullable: true }
 *                     contextId: { type: integer, nullable: true }
 *                     oldValues: { type: object, nullable: true }
 *                     newValues: { type: object, nullable: true }
 *                     reason: { type: string, nullable: true }
 *                     changedBy: { type: integer }
 *                     ipAddress: { type: string, nullable: true }
 *                     createdAt: { type: string, format: date-time }
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
 *         description: Forbidden (admin_log.read required)
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
 *         description: Log entry not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Log entry not found" }
 *                 code: { type: string, example: "NOT_FOUND" }
 *                 details: { type: 'null' }
 */
roleChangeLogRoutes.get('/:id', authMiddleware, authorize('admin_log.read'), validate(logIdParamDto), getLog);

// ─── Create manual log entry ───────────────────────────────
/**
 * @swagger
 * /api/v1/role-change-log:
 *   post:
 *     tags: [Role Change Log]
 *     summary: Create manual log entry
 *     description: Creates a manual audit log entry. Requires admin_log.create permission.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, action, roleId]
 *             properties:
 *               userId: { type: integer }
 *               action: { type: string, enum: [assigned, revoked, expired, modified, restored] }
 *               roleId: { type: integer }
 *               contextType: { type: string, enum: [course, batch, department, branch, internship] }
 *               contextId: { type: integer }
 *               oldValues: { type: object }
 *               newValues: { type: object }
 *               reason: { type: string }
 *               ipAddress: { type: string }
 *     responses:
 *       201:
 *         description: Log entry created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Audit log created successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     userId: { type: integer }
 *                     action: { type: string }
 *                     roleId: { type: integer }
 *                     roleName: { type: string }
 *                     contextType: { type: string, nullable: true }
 *                     contextId: { type: integer, nullable: true }
 *                     oldValues: { type: object, nullable: true }
 *                     newValues: { type: object, nullable: true }
 *                     reason: { type: string, nullable: true }
 *                     changedBy: { type: integer }
 *                     ipAddress: { type: string, nullable: true }
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
 *         description: Forbidden (admin_log.create required)
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
roleChangeLogRoutes.post('/', authMiddleware, authorize('admin_log.create'), validate(createLogDto), createLog);

export { roleChangeLogRoutes };
