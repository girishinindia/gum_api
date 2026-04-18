import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './skill.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected — specific routes MUST come before generic /:id
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('skill', 'create'),      upload.single('icon'), ctrl.create);
r.patch('/:id/restore',   requirePermission('skill', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('skill', 'update'),      upload.single('icon'), ctrl.update);
r.delete('/:id/permanent', requirePermission('skill', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('skill', 'soft_delete'), ctrl.softDelete);

export default r;
