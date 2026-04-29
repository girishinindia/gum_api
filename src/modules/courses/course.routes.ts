import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './course.controller';
import * as importCtrl from './courseImport.controller';

const r = Router();

r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected — specific routes MUST come before generic /:id
r.use(authMiddleware, attachPermissions());
r.post('/import/preview',  requirePermission('course', 'create'),      importCtrl.preview);
r.post('/import',          requirePermission('course', 'create'),      importCtrl.importCourse);
r.post('/',                requirePermission('course', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('course', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('course', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('course', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('course', 'soft_delete'), ctrl.softDelete);

export default r;
