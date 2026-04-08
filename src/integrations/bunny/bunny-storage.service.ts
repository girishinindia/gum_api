import { env } from '../../config/env';
import { logger } from '../../core/logger/logger';
import { AppError } from '../../core/errors/app-error';

// ─── Types ───────────────────────────────────────────────────

interface UploadInput {
  /** File buffer (from multer memoryStorage) */
  buffer: Buffer;
  /** Target path inside the storage zone, e.g. "images/profile/uuid.jpg" */
  targetPath: string;
  /** MIME type for Content-Type header */
  contentType?: string;
}

interface UploadResult {
  /** Full CDN URL to access the file */
  cdnUrl: string;
  /** Path inside the storage zone */
  storagePath: string;
}

// ─── Service ─────────────────────────────────────────────────

export class BunnyStorageService {
  private readonly storageUrl = env.BUNNY_STORAGE_URL;
  private readonly storageZone = env.BUNNY_STORAGE_ZONE;
  private readonly storageKey = env.BUNNY_STORAGE_KEY;
  private readonly cdnUrl = env.BUNNY_CDN_URL;

  /**
   * Upload a file to Bunny Storage.
   * PUT https://{region}.storage.bunnycdn.com/{storageZone}/{path}
   */
  async upload(input: UploadInput): Promise<UploadResult> {
    const { buffer, targetPath, contentType } = input;

    // Ensure path doesn't start with /
    const cleanPath = targetPath.replace(/^\/+/, '');
    const url = `${this.storageUrl}/${this.storageZone}/${cleanPath}`;

    logger.info({ targetPath: cleanPath, size: buffer.length }, 'Uploading file to Bunny Storage');

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'AccessKey': this.storageKey,
        'Content-Type': contentType ?? 'application/octet-stream'
      },
      body: new Uint8Array(buffer)
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error({ status: response.status, body: text }, 'Bunny Storage upload failed');
      throw new AppError('File upload to storage failed', 502, 'BUNNY_UPLOAD_FAILED');
    }

    const cdnUrl = `${this.cdnUrl}/${cleanPath}`;

    logger.info({ cdnUrl }, 'File uploaded to Bunny Storage');

    return { cdnUrl, storagePath: cleanPath };
  }

  /**
   * Delete a file from Bunny Storage.
   * DELETE https://{region}.storage.bunnycdn.com/{storageZone}/{path}
   */
  async delete(targetPath: string): Promise<void> {
    const cleanPath = targetPath.replace(/^\/+/, '');
    const url = `${this.storageUrl}/${this.storageZone}/${cleanPath}`;

    logger.info({ targetPath: cleanPath }, 'Deleting file from Bunny Storage');

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'AccessKey': this.storageKey
      }
    });

    if (!response.ok) {
      logger.error({ status: response.status }, 'Bunny Storage delete failed');
      throw new AppError('File deletion from storage failed', 502, 'BUNNY_DELETE_FAILED');
    }

    logger.info({ targetPath: cleanPath }, 'File deleted from Bunny Storage');
  }

  /**
   * Check if a file exists in Bunny Storage.
   * Uses a HEAD request.
   */
  async exists(targetPath: string): Promise<boolean> {
    const cleanPath = targetPath.replace(/^\/+/, '');
    const url = `${this.storageUrl}/${this.storageZone}/${cleanPath}`;

    const response = await fetch(url, {
      method: 'HEAD', // changed from 'GET' — just check existence
      headers: { 'AccessKey': this.storageKey }
    });

    return response.ok;
  }
}

export const bunnyStorageService = new BunnyStorageService();
