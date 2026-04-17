import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './socialMedia.controller';

const r = Router();

r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

r.use(authMiddleware, attachPermissions());
r.post('/',      requirePermission('social_media', 'create'), upload.single('icon'), ctrl.create);
r.patch('/:id',  requirePermission('social_media', 'update'), upload.single('icon'), ctrl.update);
r.delete('/:id', requirePermission('social_media', 'delete'), ctrl.remove);

export default r;
