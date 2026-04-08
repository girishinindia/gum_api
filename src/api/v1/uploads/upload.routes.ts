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
 *         description: Image uploaded successfully to CDN
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Image uploaded successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     url: { type: string, example: "https://cdn.bunny.net/images/abc123.jpg" }
 *                     fileName: { type: string, example: "profile_pic.jpg" }
 *                     fileSize: { type: integer, example: 102400 }
 *                     mimeType: { type: string, example: "image/jpeg" }
 *       400:
 *         description: Invalid file type or file size exceeded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Invalid file type or size exceeded" }
 *                 code: { type: string, example: "INVALID_FILE" }
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Not authenticated" }
 *                 code: { type: string, example: "NOT_AUTHENTICATED" }
 *       500:
 *         description: Upload to CDN failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Upload failed" }
 *                 code: { type: string, example: "UPLOAD_FAILED" }
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
 *         description: Document uploaded successfully to CDN
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Document uploaded successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     url: { type: string, example: "https://cdn.bunny.net/documents/xyz789.pdf" }
 *                     fileName: { type: string, example: "assignment.pdf" }
 *                     fileSize: { type: integer, example: 512000 }
 *                     mimeType: { type: string, example: "application/pdf" }
 *       400:
 *         description: Invalid file type or file size exceeded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Invalid file type or size exceeded" }
 *                 code: { type: string, example: "INVALID_FILE" }
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Not authenticated" }
 *                 code: { type: string, example: "NOT_AUTHENTICATED" }
 *       500:
 *         description: Upload to CDN failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Upload failed" }
 *                 code: { type: string, example: "UPLOAD_FAILED" }
 */
uploadRoutes.post('/document', authMiddleware, documentUploadMiddleware.single('file'), uploadDocument);

export { uploadRoutes };
