import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './assessmentAttachment.controller';

const r = Router();
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('assessment_attachment', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('assessment_attachment', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('assessment_attachment', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('assessment_attachment', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('assessment_attachment', 'soft_delete'), ctrl.softDelete);
export default r;
