import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth';
import * as ctrl from './studio.controller';

// Memory storage; image-only, 10 MB cap. Buffer → Bunny via storage.service.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => { if (file.mimetype.startsWith('image/')) cb(null, true); else cb(new Error('Only image files are allowed')); },
});

/**
 * Instructor Studio routes (June 2026). Auth-only — NO admin permissions
 * needed because every handler is hard-scoped to the caller's own content.
 * Types: webinars | sessions | batches | blog | podcasts | faqs | promotions.
 * (Instructor COURSES use the separate /authoring module.)
 */
const r = Router();

r.use(authMiddleware);

r.get('/my-courses', ctrl.myCourses);
r.post('/upload-image', imageUpload.single('file'), ctrl.uploadImage);

r.get('/promotions/:id/courses', ctrl.promotionCourses);
r.post('/promotions/:id/courses', ctrl.promotionCourses);

r.get('/:type', ctrl.list);
r.post('/:type', ctrl.create);
r.patch('/:type/:id', ctrl.update);
r.delete('/:type/:id', ctrl.softDelete);

export default r;
