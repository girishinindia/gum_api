import multer, { FileFilterCallback } from 'multer';

import { env } from '../../config/env';
import { AppError } from '../errors/app-error';

// ─── Memory Storage (buffer → Bunny Storage) ────────────────
// Files are kept in memory as Buffer, then uploaded to Bunny
// Storage in the controller/service layer. No local disk writes.

const storage = multer.memoryStorage();

const fileFilterFactory = (allowedMimeTypes: string[]) => {
  return (_req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      cb(new AppError('Unsupported file type', 400, 'INVALID_FILE_TYPE'));
      return;
    }
    cb(null, true);
  };
};

const baseOptions = {
  storage,
  limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024 }
};

export const imageUploadMiddleware = multer({
  ...baseOptions,
  fileFilter: fileFilterFactory(env.ALLOWED_IMAGE_TYPES)
});

export const documentUploadMiddleware = multer({
  ...baseOptions,
  fileFilter: fileFilterFactory(env.ALLOWED_DOC_TYPES)
});
