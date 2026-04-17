import sharp from 'sharp';
import { uploadToBunny, deleteFromBunny, purgeBunnyCdn } from '../config/bunny';

export async function processAndUploadImage(buffer: Buffer, path: string, options?: { width?: number; height?: number; quality?: number }): Promise<string> {
  let pipeline = sharp(buffer);
  if (options?.width || options?.height) pipeline = pipeline.resize(options.width, options.height, { fit: 'inside', withoutEnlargement: true });
  const webpBuffer = await pipeline.webp({ quality: options?.quality ?? 80 }).toBuffer();
  const webpPath = path.replace(/\.[^.]+$/, '.webp');
  const cdnUrl = await uploadToBunny(webpPath, webpBuffer);
  return cdnUrl;
}

export async function deleteImage(path: string, fullCdnUrl?: string): Promise<void> {
  // Purge CDN edge cache first (best-effort), then delete from storage
  if (fullCdnUrl) await purgeBunnyCdn(fullCdnUrl);
  await deleteFromBunny(path);
}
