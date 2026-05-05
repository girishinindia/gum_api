import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import * as ctrl from './assessment.controller';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const fileFields = upload.fields([{ name: 'file', maxCount: 1 }, { name: 'file_solution', maxCount: 1 }]);

const r = Router();
r.get('/',         ctrl.list);
r.get('/:id',      ctrl.getById);
r.get('/:id/full', ctrl.getFullById);
r.use(authMiddleware, attachPermissions());
r.post('/create-full',    requirePermission('assessment_exercise', 'create'),  fileFields, ctrl.createFull);
r.put('/:id/update-full', requirePermission('assessment_exercise', 'update'),  fileFields, ctrl.updateFull);
r.post('/',               requirePermission('assessment_exercise', 'create'),      ctrl.create);
r.patch('/:id/restore',   requirePermission('assessment_exercise', 'restore'),     ctrl.restore);
r.patch('/:id',           requirePermission('assessment_exercise', 'update'),      ctrl.update);
r.delete('/:id/permanent', requirePermission('assessment_exercise', 'delete'),     ctrl.remove);
r.delete('/:id',          requirePermission('assessment_exercise', 'soft_delete'), ctrl.softDelete);
export default r;
