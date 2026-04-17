import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './document.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected
r.use(authMiddleware, attachPermissions());
r.post('/',      requirePermission('document', 'create'), upload.single('file'), ctrl.create);
r.patch('/:id',  requirePermission('document', 'update'), upload.single('file'), ctrl.update);
r.delete('/:id', requirePermission('document', 'delete'), ctrl.remove);

export default r;
