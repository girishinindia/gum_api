import { Router } from 'express';
import multer from 'multer';
import * as ctrl from './batchTranslation.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const r = Router();

// Public routes (read-only)
r.get('/coverage', ctrl.coverage);
r.get('/', ctrl.list);
r.get('/:id', ctrl.getById);

// Protected routes
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('batch_translation', 'create'), upload.fields([{ name: 'thumbnail', maxCount: 1 }]), ctrl.create);
r.patch('/:id/restore', requirePermission('batch_translation', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('batch_translation', 'update'), upload.fields([{ name: 'thumbnail', maxCount: 1 }]), ctrl.update);
r.delete('/:id/permanent', requirePermission('batch_translation', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('batch_translation', 'soft_delete'), ctrl.softDelete);

export default r;
