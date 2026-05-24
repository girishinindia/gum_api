import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { coerceNullStrings } from '../../middleware/upload';
import * as ctrl from './ticketAttachment.controller';

const r = Router();

// Ticket attachment multer — wider MIME filter than the shared upload middleware
// Supports images, docs, spreadsheets, archives, text, audio, video
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB per file
  fileFilter: (_req, file, cb) => {
    const allowed = [
      // Images
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      // Documents
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      // Text
      'text/plain', 'text/csv', 'text/html',
      // Archives
      'application/zip', 'application/x-rar-compressed', 'application/gzip',
      'application/x-7z-compressed',
      // Audio/Video
      'audio/mpeg', 'audio/wav', 'video/mp4', 'video/webm',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`File type ${file.mimetype} not allowed. Supported: images, PDF, Office docs, text, archives, audio, video.`));
  },
});

// ALL protected
r.use(authMiddleware, attachPermissions());

r.get('/',       requirePermission('ticket_attachment', 'read'),   ctrl.list);
r.get('/:id',   requirePermission('ticket_attachment', 'read'),   ctrl.getById);
r.post('/',      requirePermission('ticket_attachment', 'create'), ctrl.create);
r.post('/upload', requirePermission('ticket_attachment', 'create'), attachmentUpload.single('file'), coerceNullStrings, ctrl.upload);
r.delete('/:id', requirePermission('ticket_attachment', 'delete'), ctrl.remove);

export default r;
