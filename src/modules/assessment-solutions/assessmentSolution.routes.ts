import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './assessmentSolution.controller';

const r = Router();
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('assessment_solution', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('assessment_solution', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('assessment_solution', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('assessment_solution', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('assessment_solution', 'soft_delete'), ctrl.softDelete);
export default r;
