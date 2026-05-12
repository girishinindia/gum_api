import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './certificateTemplate.controller';

const r = Router();

// All routes are protected
r.use(authMiddleware, attachPermissions());

r.get('/',    requirePermission('certificate_template', 'read'),   ctrl.list);
r.get('/:id', requirePermission('certificate_template', 'read'),   ctrl.getById);

r.post('/', requirePermission('certificate_template', 'create'),
  upload.fields([
    { name: 'background_image', maxCount: 1 },
    { name: 'logo', maxCount: 1 },
    { name: 'signature', maxCount: 1 },
    { name: 'template_html_file', maxCount: 1 },
  ]),
  ctrl.create,
);

r.patch('/:id/restore', requirePermission('certificate_template', 'restore'), ctrl.restore);

r.patch('/:id', requirePermission('certificate_template', 'update'),
  upload.fields([
    { name: 'background_image', maxCount: 1 },
    { name: 'logo', maxCount: 1 },
    { name: 'signature', maxCount: 1 },
    { name: 'template_html_file', maxCount: 1 },
  ]),
  ctrl.update,
);

r.delete('/:id/permanent', requirePermission('certificate_template', 'delete'), ctrl.remove);
r.delete('/:id',           requirePermission('certificate_template', 'soft_delete'), ctrl.softDelete);

export default r;
