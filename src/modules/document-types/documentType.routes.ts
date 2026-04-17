import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './documentType.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected
r.use(authMiddleware, attachPermissions());
r.post('/',      requirePermission('document_type', 'create'), ctrl.create);
r.patch('/:id',  requirePermission('document_type', 'update'), ctrl.update);
r.delete('/:id', requirePermission('document_type', 'delete'), ctrl.remove);

export default r;
