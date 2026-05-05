import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './miniProject.controller';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const fileFields = upload.fields([{ name: 'file', maxCount: 1 }, { name: 'file_solution', maxCount: 1 }]);

const r = Router();
r.get('/',         ctrl.list);
r.get('/:id',      ctrl.getById);
r.get('/:id/full', ctrl.getFullById);
r.use(authMiddleware, attachPermissions());
r.post('/create-full',    requirePermission('mini_project', 'create'),  fileFields, ctrl.createFull);
r.put('/:id/update-full', requirePermission('mini_project', 'update'),  fileFields, ctrl.updateFull);
r.post('/',               requirePermission('mini_project', 'create'),  fileFields, ctrl.create);
r.patch('/:id/restore',   requirePermission('mini_project', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('mini_project', 'update'),  fileFields, ctrl.update);
r.delete('/:id/permanent', requirePermission('mini_project', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('mini_project', 'soft_delete'), ctrl.softDelete);
export default r;
