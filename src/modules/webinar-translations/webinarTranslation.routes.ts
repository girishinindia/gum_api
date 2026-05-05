import { Router } from 'express';
import multer from 'multer';
import * as ctrl from './webinarTranslation.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const r = Router();

// Public routes
r.get('/', ctrl.list);
r.get('/coverage', ctrl.coverage);
r.get('/:id', ctrl.getById);

// Protected routes
r.use(authMiddleware, attachPermissions());
r.post('/', requirePermission('webinar_translation', 'create'), upload.single('thumbnail_file'), ctrl.create);
r.patch('/:id/restore', requirePermission('webinar_translation', 'restore'), ctrl.restore);
r.patch('/:id', requirePermission('webinar_translation', 'update'), upload.single('thumbnail_file'), ctrl.update);
r.delete('/:id/permanent', requirePermission('webinar_translation', 'delete'), ctrl.remove);
r.delete('/:id', requirePermission('webinar_translation', 'soft_delete'), ctrl.softDelete);

export default r;
