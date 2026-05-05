import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './miniProjectTranslation.controller';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const fileFields = upload.fields([{ name: 'file', maxCount: 1 }]);

const r = Router();
r.get('/',         ctrl.list);
r.get('/coverage', ctrl.coverage);
r.get('/:id',      ctrl.getById);
r.use(authMiddleware, attachPermissions());
r.post('/',               requirePermission('mini_project_translation', 'create'),  fileFields, ctrl.create);
r.patch('/:id/restore',   requirePermission('mini_project_translation', 'restore'),             ctrl.restore);
r.patch('/:id',           requirePermission('mini_project_translation', 'update'),  fileFields, ctrl.update);
r.delete('/:id/permanent', requirePermission('mini_project_translation', 'delete'),             ctrl.remove);
r.delete('/:id',          requirePermission('mini_project_translation', 'soft_delete'),         ctrl.softDelete);
export default r;
