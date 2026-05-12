import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { createDocumentTypeSchema, updateDocumentTypeSchema } from './documentType.schema';
import * as ctrl from './documentType.controller';

const r = Router();

// Public
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);

// Protected — specific routes MUST come before generic /:id
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('document_type', 'create'),      validate(createDocumentTypeSchema), ctrl.create);
r.patch('/:id/restore',   requirePermission('document_type', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('document_type', 'update'),      validate(updateDocumentTypeSchema), ctrl.update);
r.delete('/:id/permanent', requirePermission('document_type', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('document_type', 'soft_delete'), ctrl.softDelete);

export default r;
