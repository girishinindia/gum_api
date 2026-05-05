import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './capstoneProject.controller';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const fileFields = upload.fields([{ name: 'file', maxCount: 1 }, { name: 'file_solution', maxCount: 1 }]);

const r = Router();
r.get('/',         ctrl.list);
r.get('/:id',      ctrl.getById);
r.get('/:id/full', ctrl.getFullById);
r.use(authMiddleware, attachPermissions());
r.post('/create-full',    requirePermission('capstone_project', 'create'),  fileFields, ctrl.createFull);
r.put('/:id/update-full', requirePermission('capstone_project', 'update'),  fileFields, ctrl.updateFull);
r.post('/',               requirePermission('capstone_project', 'create'),  fileFields, ctrl.create);
r.patch('/:id/restore',   requirePermission('capstone_project', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('capstone_project', 'update'),  fileFields, ctrl.update);
r.delete('/:id/permanent', requirePermission('capstone_project', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('capstone_project', 'soft_delete'), ctrl.softDelete);
export default r;
