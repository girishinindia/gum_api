import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './ticketMessage.controller';

const r = Router();

// ALL protected
r.use(authMiddleware, attachPermissions());

r.get('/',                   requirePermission('ticket_message', 'read'),        ctrl.list);
r.get('/:id',               requirePermission('ticket_message', 'read'),        ctrl.getById);
r.post('/',                  requirePermission('ticket_message', 'create'),      ctrl.create);
r.patch('/:id/restore',     requirePermission('ticket_message', 'restore'),     ctrl.restore);
r.patch('/:id',             requirePermission('ticket_message', 'update'),      ctrl.update);
r.delete('/:id/permanent',  requirePermission('ticket_message', 'delete'),      ctrl.remove);
r.delete('/:id',            requirePermission('ticket_message', 'soft_delete'), ctrl.softDelete);

export default r;
