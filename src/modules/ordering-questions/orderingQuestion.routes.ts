import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './orderingQuestion.controller';

const r = Router();

r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('ordering_question', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('ordering_question', 'delete'),      ctrl.restore);
r.patch('/:id',           requirePermission('ordering_question', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('ordering_question', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('ordering_question', 'delete'),      ctrl.softDelete);

export default r;
