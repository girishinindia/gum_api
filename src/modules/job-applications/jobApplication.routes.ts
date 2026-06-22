import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { err } from '../../utils/response';
import * as ctrl from './jobApplication.controller';

// Dedicated résumé uploader — PDF / DOC / DOCX, max 5 MB. Kept local so the
// shared image `upload` middleware (images + pdf only) is left untouched.
const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Please upload a PDF, DOC, or DOCX.'));
  },
});

// Wrap multer so its errors (bad type / too large) return a clean 400 JSON.
function uploadResume(req: Request, res: Response, next: NextFunction) {
  resumeUpload.single('resume')(req, res, (e: any) => {
    if (e) return err(res, e.message || 'Résumé upload failed', 400);
    next();
  });
}

const r = Router();

// Public — submit an application (no auth)
r.post('/', uploadResume, ctrl.apply);

// Admin — auth + RBAC for everything below
r.use(authMiddleware, attachPermissions());
r.get('/',             requirePermission('job_application', 'read'),        ctrl.list);
r.get('/:id',          requirePermission('job_application', 'read'),        ctrl.getById);
r.patch('/:id/restore', requirePermission('job_application', 'restore'),    ctrl.restore);
r.patch('/:id',        requirePermission('job_application', 'update'),      ctrl.update);
r.delete('/:id',       requirePermission('job_application', 'soft_delete'), ctrl.softDelete);

export default r;
