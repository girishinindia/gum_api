import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './teamMember.controller';

const r = Router();

// Public — the gum_web "Our Team" page reads these
r.get('/',    ctrl.list);
r.get('/:id', ctrl.getById);

// Protected — specific routes MUST come before generic /:id
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('team_member', 'create'),      upload.single('image'), ctrl.create);
r.patch('/:id/restore',    requirePermission('team_member', 'restore'),     ctrl.restore);
r.patch('/:id',            requirePermission('team_member', 'update'),      upload.single('image'), ctrl.update);
r.delete('/:id/permanent', requirePermission('team_member', 'delete'),      ctrl.remove);
r.delete('/:id',           requirePermission('team_member', 'soft_delete'), ctrl.softDelete);

export default r;
