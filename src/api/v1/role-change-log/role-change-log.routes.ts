import { Router } from 'express';

import { authMiddleware } from '../../../core/middlewares/auth.middleware';
import { authorize } from '../../../core/middlewares/authorize.middleware';
import { validate } from '../../../core/middlewares/validate.middleware';
import { listLogs, getLog, createLog } from './role-change-log.controller';
import { listLogsDto, logIdParamDto, createLogDto } from './role-change-log.dto';

const roleChangeLogRoutes = Router();

// ─── List log entries ──────────────────────────────────────
roleChangeLogRoutes.get('/', authMiddleware, authorize('admin_log.read'), validate(listLogsDto), listLogs);

// ─── Get single log entry ──────────────────────────────────
roleChangeLogRoutes.get('/:id', authMiddleware, authorize('admin_log.read'), validate(logIdParamDto), getLog);

// ─── Create manual log entry ───────────────────────────────
roleChangeLogRoutes.post('/', authMiddleware, authorize('admin_log.create'), validate(createLogDto), createLog);

export { roleChangeLogRoutes };
