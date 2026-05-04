import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './assessmentAttachmentTranslation.controller';

const r = Router();
r.get('/',     ctrl.list);
r.get('/:id',  ctrl.getById);
r.use(authMiddleware, attachPermissions());
r.post('/',                requirePermission('assessment_attachment_translation', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('assessment_attachment_translation', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('assessment_attachment_translation', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('assessment_attachment_translation', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('assessment_attachment_translation', 'soft_delete'), ctrl.softDelete);
export default r;
