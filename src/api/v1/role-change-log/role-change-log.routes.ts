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
 *       404:
 *         description: Log entry not found
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
 */
roleChangeLogRoutes.post('/', authMiddleware, authorize('admin_log.create'), validate(createLogDto), createLog);

export { roleChangeLogRoutes };
