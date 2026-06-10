import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth';
import * as ctrl from './userTicket.controller';

const r = Router();

// Self-serve attachment upload — same limits/types as the admin attachment route.
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB per file
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'text/csv',
      'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('File type not allowed. Supported: images, PDF, Word/Excel, text, zip.'));
  },
});

// All routes require authentication but NO RBAC — any logged-in user can access
r.use(authMiddleware);

// Categories (public list for ticket creation form)
r.get('/categories', ctrl.getCategories);

// Ticket CRUD (ownership-scoped)
r.get('/',          ctrl.listMyTickets);
r.get('/:id',       ctrl.getMyTicket);
r.post('/',         ctrl.submitTicket);
r.post('/:id/reply', ctrl.replyToTicket);
r.patch('/:id/close', ctrl.closeMyTicket);

// Attachments (ownership-scoped, self-serve — no admin RBAC needed)
r.get('/:id/attachments', ctrl.listMyAttachments);
r.post('/:id/attachments', attachmentUpload.single('file'), ctrl.uploadMyAttachment);

export default r;
