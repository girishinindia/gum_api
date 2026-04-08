import { Router } from 'express';

import { authMiddleware } from '../../../core/middlewares/auth.middleware';
import { imageUploadMiddleware, documentUploadMiddleware } from '../../../core/middlewares/upload.middleware';
import { uploadImage, uploadDocument } from './upload.controller';

const uploadRoutes = Router();

/**
 * @swagger
 * /api/v1/uploads/image:
 *   post:
 *     tags: [Uploads]
 *     summary: Upload image
 *     description: Uploads an image file to Bunny CDN. Supported formats configured via ALLOWED_IMAGE_TYPES env var.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Image file (JPEG, PNG, WebP, etc.)
 *     responses:
 *       200:
 *         description: Image uploaded, CDN URL returned
 *       400:
 *         description: Invalid file type or size exceeded
 *       401:
 *         description: Not authenticated
 */
uploadRoutes.post('/image', authMiddleware, imageUploadMiddleware.single('file'), uploadImage);
/**
 * @swagger
 * /api/v1/uploads/document:
 *   post:
 *     tags: [Uploads]
 *     summary: Upload document
 *     description: Uploads a document file to Bunny CDN. Supported formats configured via ALLOWED_DOC_TYPES env var.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Document file (PDF, DOCX, etc.)
 *     responses:
 *       200:
 *         description: Document uploaded, CDN URL returned
 *       400:
 *         description: Invalid file type or size exceeded
 *       401:
 *         description: Not authenticated
 */
uploadRoutes.post('/document', authMiddleware, documentUploadMiddleware.single('file'), uploadDocument);

export { uploadRoutes };
