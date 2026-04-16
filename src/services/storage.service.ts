import sharp from 'sharp';
import { uploadToBunny, deleteFromBunny } from '../config/bunny';

export async function processAndUploadImage(buffer: Buffer, path: string, options?: { width?: number; height?: number; quality?: number }): Promise<string> {
  let pipeline = sharp(buffer);
  if (options?.width || options?.height) pipeline = pipeline.resize(options.width, options.height, { fit: 'inside', withoutEnlargement: true });
  const webpBuffer = await pipeline.webp({ quality: options?.quality ?? 80 }).toBuffer();
  const webpPath = path.replace(/\.[^.]+$/, '.webp');
  return uploadToBunny(webpPath, webpBuffer);
}

export async function deleteImage(path: string): Promise<void> {
  await deleteFromBunny(path);
}
