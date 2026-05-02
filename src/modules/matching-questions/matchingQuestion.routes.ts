import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './matchingQuestion.controller';

const r = Router();

r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('matching_question', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('matching_question', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('matching_question', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('matching_question', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('matching_question', 'soft_delete'), ctrl.softDelete);

export default r;
