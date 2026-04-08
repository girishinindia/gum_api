import { Router } from 'express';

import { authMiddleware } from '../../../core/middlewares/auth.middleware';
import { imageUploadMiddleware, documentUploadMiddleware } from '../../../core/middlewares/upload.middleware';
import { uploadImage, uploadDocument } from './upload.controller';

const uploadRoutes = Router();

uploadRoutes.post('/image', authMiddleware, imageUploadMiddleware.single('file'), uploadImage);
uploadRoutes.post('/document', authMiddleware, documentUploadMiddleware.single('file'), uploadDocument);

export { uploadRoutes };
