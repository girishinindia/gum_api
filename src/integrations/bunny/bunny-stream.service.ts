import crypto from 'crypto';

import { env } from '../../config/env';
import { logger } from '../../core/logger/logger';
import { AppError } from '../../core/errors/app-error';

// ─── Types ───────────────────────────────────────────────────

interface CreateVideoInput {
  title: string;
  collectionId?: string;
}

interface BunnyVideo {
  guid: string;
  title: string;
  status: number; // 0=created, 1=uploaded, 2=processing, 3=transcoding, 4=finished, 5=error
  thumbnailFileName: string;
  length: number;
  storageSize: number;
}

interface UploadVideoInput {
  videoId: string;
  buffer: Buffer;
}

// ─── Service ─────────────────────────────────────────────────

export class BunnyStreamService {
  private readonly apiUrl = 'https://video.bunnycdn.com';
  private readonly libraryId = env.BUNNY_STREAM_LIBRARY_ID;
  private readonly apiKey = env.BUNNY_STREAM_API_KEY;
  private readonly cdnUrl = env.BUNNY_STREAM_CDN;
  private readonly tokenKey = env.BUNNY_STREAM_TOKEN_KEY;

  // ─── Video CRUD ──────────────────────────────────────────

  /**
   * Create a video placeholder in the Bunny Stream library.
   * After creating, upload the actual video file using uploadVideo().
   */
  async createVideo(input: CreateVideoInput): Promise<BunnyVideo> {
    const url = `${this.apiUrl}/library/${this.libraryId}/videos`;

    logger.info({ title: input.title }, 'Creating video in Bunny Stream');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'AccessKey': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: input.title,
        collectionId: input.collectionId
      })
    });

    if (!response.ok) {
      logger.error({ status: response.status }, 'Bunny Stream create video failed');
      throw new AppError('Video creation failed', 502, 'BUNNY_STREAM_CREATE_FAILED');
    }

    const video = (await response.json()) as BunnyVideo;
    logger.info({ videoId: video.guid }, 'Video created in Bunny Stream');
    return video;
  }

  /**
   * Upload a video file to an existing video placeholder.
   */
  async uploadVideo(input: UploadVideoInput): Promise<void> {
    const url = `${this.apiUrl}/library/${this.libraryId}/videos/${input.videoId}`;

    logger.info({ videoId: input.videoId, size: input.buffer.length }, 'Uploading video to Bunny Stream');

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'AccessKey': this.apiKey,
        'Content-Type': 'application/octet-stream'
      },
      body: new Uint8Array(input.buffer)
    });

    if (!response.ok) {
      logger.error({ status: response.status }, 'Bunny Stream upload failed');
      throw new AppError('Video upload failed', 502, 'BUNNY_STREAM_UPLOAD_FAILED');
    }

    logger.info({ videoId: input.videoId }, 'Video uploaded to Bunny Stream');
  }

  /**
   * Get video details by ID.
   */
  async getVideo(videoId: string): Promise<BunnyVideo> {
    const url = `${this.apiUrl}/library/${this.libraryId}/videos/${videoId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'AccessKey': this.apiKey }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new AppError('Video not found', 404, 'VIDEO_NOT_FOUND');
      }
      throw new AppError('Failed to fetch video', 502, 'BUNNY_STREAM_FETCH_FAILED');
    }

    return (await response.json()) as BunnyVideo;
  }

  /**
   * Delete a video from the library.
   */
  async deleteVideo(videoId: string): Promise<void> {
    const url = `${this.apiUrl}/library/${this.libraryId}/videos/${videoId}`;

    logger.info({ videoId }, 'Deleting video from Bunny Stream');

    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'AccessKey': this.apiKey }
    });

    if (!response.ok) {
      logger.error({ status: response.status }, 'Bunny Stream delete failed');
      throw new AppError('Video deletion failed', 502, 'BUNNY_STREAM_DELETE_FAILED');
    }

    logger.info({ videoId }, 'Video deleted from Bunny Stream');
  }

  /**
   * List videos in the library (paginated).
   */
  async listVideos(page = 1, perPage = 100): Promise<{ items: BunnyVideo[]; totalItems: number }> {
    const url = `${this.apiUrl}/library/${this.libraryId}/videos?page=${page}&itemsPerPage=${perPage}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'AccessKey': this.apiKey }
    });

    if (!response.ok) {
      throw new AppError('Failed to list videos', 502, 'BUNNY_STREAM_LIST_FAILED');
    }

    return (await response.json()) as { items: BunnyVideo[]; totalItems: number };
  }

  // ─── Signed URL / Token Auth ─────────────────────────────

  /**
   * Generate a signed/tokenized URL for secure video playback.
   * Uses Bunny Stream's token authentication.
   *
   * @param videoId - The video GUID
   * @param expiresInSeconds - Token validity (default 2 hours)
   */
  generateSignedUrl(videoId: string, expiresInSeconds = 7200): string {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const path = `/${this.tokenKey}/${videoId}/${expires}`;

    const hashableBase = env.BUNNY_STREAM_TOKEN_KEY + path;
    const token = crypto
      .createHash('sha256')
      .update(hashableBase)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    return `${this.cdnUrl}/${videoId}/playlist.m3u8?token=${token}&expires=${expires}`;
  }

  /**
   * Get the direct (unsigned) embed/play URL.
   * Only use if token authentication is disabled on the library.
   */
  getPlayUrl(videoId: string): string {
    return `${this.cdnUrl}/${videoId}/playlist.m3u8`;
  }

  /**
   * Get the thumbnail URL for a video.
   */
  getThumbnailUrl(videoId: string): string {
    return `${this.cdnUrl}/${videoId}/thumbnail.jpg`;
  }
}

export const bunnyStreamService = new BunnyStreamService();
