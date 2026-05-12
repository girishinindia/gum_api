import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './ticketAttachment.controller';

const r = Router();

// ALL protected
r.use(authMiddleware, attachPermissions());

r.get('/',       requirePermission('ticket_attachment', 'read'),   ctrl.list);
r.get('/:id',   requirePermission('ticket_attachment', 'read'),   ctrl.getById);
r.post('/',      requirePermission('ticket_attachment', 'create'), ctrl.create);
r.delete('/:id', requirePermission('ticket_attachment', 'delete'), ctrl.remove);

export default r;
