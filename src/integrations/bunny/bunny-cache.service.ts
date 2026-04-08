import { env } from '../../config/env';
import { logger } from '../../core/logger/logger';
import { AppError } from '../../core/errors/app-error';

// ─── Service ─────────────────────────────────────────────────

export class BunnyCacheService {
  private readonly accountApiKey = env.BUNNY_ACCOUNT_API_KEY;

  /**
   * Purge a specific URL from the Bunny CDN cache.
   * Uses the Bunny.net account-level API.
   */
  async purgeUrl(url: string): Promise<void> {
    const apiUrl = `https://api.bunny.net/purge?url=${encodeURIComponent(url)}`;

    logger.info({ url }, 'Purging Bunny CDN cache');

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'AccessKey': this.accountApiKey
      }
    });

    if (!response.ok) {
      logger.error({ status: response.status, url }, 'Bunny CDN cache purge failed');
      throw new AppError('CDN cache purge failed', 502, 'BUNNY_PURGE_FAILED');
    }

    logger.info({ url }, 'Bunny CDN cache purged');
  }

  /**
   * Purge a file from Bunny CDN cache using its storage path.
   * Automatically builds the full CDN URL.
   */
  async purgeFile(storagePath: string): Promise<void> {
    const cleanPath = storagePath.replace(/^\/+/, '');
    const cdnUrl = `${env.BUNNY_CDN_URL}/${cleanPath}`;
    return this.purgeUrl(cdnUrl);
  }
}

export const bunnyCacheService = new BunnyCacheService();
