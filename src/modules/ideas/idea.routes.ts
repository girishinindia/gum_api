import { Router } from 'express';
import multer from 'multer';
import * as ctrl from './idea.controller';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';

/**
 * "Submit Your Idea & Get Reward" (June 2026).
 * Route order matters: public → auth self-serve ("me", likes) → admin RBAC.
 */
const r = Router();

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'application/zip',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('File type not allowed. Supported: images, PDF, Word, PowerPoint, text, zip.'));
  },
});

// ── Public showcase (no auth) ──
r.get('/public', ctrl.publicList);
r.get('/public/:slug', ctrl.publicBySlug);

// ── Authenticated self-serve (students + instructors) ──
r.use(authMiddleware);
r.post('/', ctrl.submit);
r.get('/me', ctrl.listMine);
r.get('/me/:id', ctrl.getMine);
r.patch('/me/:id', ctrl.updateMine);
r.delete('/me/:id', ctrl.deleteMine);
r.post('/me/:id/attachment', attachmentUpload.single('file'), ctrl.uploadAttachment);
r.post('/:id/like', ctrl.like);
r.delete('/:id/like', ctrl.unlike);

// ── Admin (RBAC) ──
r.use(attachPermissions());
r.get('/', requirePermission('idea', 'read'), ctrl.adminList);
r.patch('/:id/status', requirePermission('idea', 'approve'), ctrl.adminSetStatus);
r.patch('/:id/visibility', requirePermission('idea', 'approve'), ctrl.adminSetVisibility);
r.post('/:id/feedback', requirePermission('idea', 'update'), ctrl.adminAddFeedback);
r.post('/:id/reward', requirePermission('idea', 'approve'), ctrl.adminUpsertReward);
r.patch('/:id/reward', requirePermission('idea', 'approve'), ctrl.adminUpsertReward);
r.post('/:id/partnership', requirePermission('idea', 'approve'), ctrl.adminUpsertPartnership);
r.patch('/:id/partnership', requirePermission('idea', 'approve'), ctrl.adminUpsertPartnership);
r.get('/:id', requirePermission('idea', 'read'), ctrl.adminGetById);

export default r;
