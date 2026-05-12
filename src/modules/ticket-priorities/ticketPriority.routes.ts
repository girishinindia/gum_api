import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './ticketPriority.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected — specific routes MUST come before generic /:id
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('ticket_priority', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('ticket_priority', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('ticket_priority', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('ticket_priority', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('ticket_priority', 'soft_delete'), ctrl.softDelete);

export default r;
