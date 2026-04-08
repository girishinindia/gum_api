import path from 'path';
import { v4 as uuid } from 'uuid';

import { AppError } from '../../core/errors/app-error';
import { bunnyStorageService } from '../../integrations/bunny/bunny-storage.service';

// ─── Types ───────────────────────────────────────────────────

interface UploadResult {
  uploadedBy: string | null;
  originalName: string;
  fileName: string;
  mimeType: string;
  size: number;
  cdnUrl: string;
  storagePath: string;
}

// ─── Service ─────────────────────────────────────────────────

class UploadService {
  /**
   * Upload an image to Bunny Storage under "images/" folder.
   */
  async uploadImage(file: Express.Multer.File | undefined, uploadedBy?: string): Promise<UploadResult> {
    return this.uploadToBunny(file, 'images', uploadedBy);
  }

  /**
   * Upload a document to Bunny Storage under "documents/" folder.
   */
  async uploadDocument(file: Express.Multer.File | undefined, uploadedBy?: string): Promise<UploadResult> {
    return this.uploadToBunny(file, 'documents', uploadedBy);
  }

  /**
   * Delete a file from Bunny Storage by its storage path.
   */
  async deleteFile(storagePath: string): Promise<void> {
    await bunnyStorageService.delete(storagePath);
  }

  // ─── Private ─────────────────────────────────────────────

  private async uploadToBunny(
    file: Express.Multer.File | undefined,
    folder: string,
    uploadedBy?: string
  ): Promise<UploadResult> {
    if (!file || !file.buffer) {
      throw new AppError('File is required', 400, 'FILE_REQUIRED');
    }

    const ext = path.extname(file.originalname);
    const fileName = `${uuid()}${ext}`;
    const targetPath = `${folder}/${fileName}`;

    const { cdnUrl, storagePath } = await bunnyStorageService.upload({
      buffer: file.buffer,
      targetPath,
      contentType: file.mimetype
    });

    return {
      uploadedBy: uploadedBy ?? null,
      originalName: file.originalname,
      fileName,
      mimeType: file.mimetype,
      size: file.size,
      cdnUrl,
      storagePath
    };
  }
}

export const uploadService = new UploadService();
