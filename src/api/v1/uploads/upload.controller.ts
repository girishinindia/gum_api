import { Request, Response } from 'express';

import { sendSuccess } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { uploadService } from '../../../modules/uploads/upload.service';

export const uploadImage = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  const uploadedBy = req.user?.userId != null ? String(req.user.userId) : undefined;
  const data = await uploadService.uploadImage(file, uploadedBy);
  return sendSuccess(res, data, 'Image uploaded successfully', 201);
});

export const uploadDocument = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  const uploadedBy = req.user?.userId != null ? String(req.user.userId) : undefined;
  const data = await uploadService.uploadDocument(file, uploadedBy);
  return sendSuccess(res, data, 'Document uploaded successfully', 201);
});
