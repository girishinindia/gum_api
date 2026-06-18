import { Router } from 'express';
import * as ctrl from './liveSession.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { liveSessionSchema } from './liveSession.schema';

const r = Router();

// Public routes (read-only)
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

// Protected routes
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('live_session', 'create'), validate(liveSessionSchema), ctrl.create);
r.patch('/:id/start', requirePermission('live_session', 'update'), ctrl.startSession);
r.patch('/:id/end', requirePermission('live_session', 'update'), ctrl.endSession);
r.patch('/:id/cancel', requirePermission('live_session', 'update'), ctrl.cancelSession);
r.patch('/:id/reschedule', requirePermission('live_session', 'update'), ctrl.rescheduleSession);
r.patch('/:id/restore', requirePermission('live_session', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('live_session', 'update'), validate(liveSessionSchema), ctrl.update);
r.delete('/:id/permanent', requirePermission('live_session', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('live_session', 'soft_delete'), ctrl.softDelete);

export default r;
