import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './mcqQuestion.controller';

const r = Router();

r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);
r.get('/:id/full', ctrl.getFullById);

r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('mcq_question', 'create'),      ctrl.create);
r.post('/create-full',     requirePermission('mcq_question', 'create'),      ctrl.createFull);
r.put('/:id/update-full',  requirePermission('mcq_question', 'update'),      ctrl.updateFull);
r.patch('/:id/restore',   requirePermission('mcq_question', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('mcq_question', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('mcq_question', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('mcq_question', 'soft_delete'), ctrl.softDelete);

export default r;
