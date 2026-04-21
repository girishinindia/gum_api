import sharp from 'sharp';
import { uploadToBunny, deleteFromBunny, deleteBunnyDirectory, listBunnyStorage, purgeBunnyCdn } from '../config/bunny';

/**
 * Create a "folder" on Bunny storage by uploading a zero-byte placeholder.
 * Bunny doesn't have explicit folder creation; folders are created implicitly
 * when a file is uploaded inside them. We upload a hidden .folder file.
 */
export async function createBunnyFolder(folderPath: string): Promise<void> {
  const placeholder = `${folderPath.replace(/\/+$/, '')}/.folder`;
  try {
    await uploadToBunny(placeholder, Buffer.alloc(0));
  } catch (e) {
    console.error(`Failed to create Bunny folder ${folderPath}:`, e);
  }
}

/**
 * Create multiple Bunny folders in parallel (best-effort).
 */
export async function createBunnyFolders(folderPaths: string[]): Promise<void> {
  await Promise.allSettled(folderPaths.map(p => createBunnyFolder(p)));
}

/**
 * Delete an entire Bunny storage folder and all its contents.
 * Uses Bunny's directory DELETE API (trailing slash) which recursively removes everything.
 * Falls back to manual recursive deletion if the directory DELETE fails.
 */
export async function deleteBunnyFolder(folderPath: string): Promise<void> {
  const normalized = folderPath.replace(/\/+$/, '');
  try {
    // Try direct directory deletion first (Bunny supports DELETE on path/ with trailing slash)
    await deleteBunnyDirectory(normalized);
    console.log(`Bunny folder deleted: ${normalized}/`);
  } catch (dirErr) {
    console.warn(`Direct folder delete failed for ${normalized}, trying recursive approach...`, dirErr);
    // Fallback: manually list and delete contents
    try {
      const items = await listBunnyStorage(normalized);
      for (const item of items) {
        const itemPath = `${normalized}/${item.ObjectName}`;
        if (item.IsDirectory) {
          await deleteBunnyFolder(itemPath);
        } else {
          try { await deleteFromBunny(itemPath); } catch {}
        }
      }
      // Try directory delete again after contents are removed
      try { await deleteBunnyDirectory(normalized); } catch {}
      // Also try deleting the .folder placeholder
      try { await deleteFromBunny(`${normalized}/.folder`); } catch {}
    } catch (e) {
      console.error(`Failed to delete Bunny folder ${folderPath}:`, e);
    }
  }
}

export async function processAndUploadImage(buffer: Buffer, path: string, options?: { width?: number; height?: number; quality?: number }): Promise<string> {
  let pipeline = sharp(buffer);
  if (options?.width || options?.height) pipeline = pipeline.resize(options.width, options.height, { fit: 'inside', withoutEnlargement: true });
  const webpBuffer = await pipeline.webp({ quality: options?.quality ?? 80 }).toBuffer();
  const webpPath = path.replace(/\.[^.]+$/, '.webp');
  const cdnUrl = await uploadToBunny(webpPath, webpBuffer);
  return cdnUrl;
}

export async function uploadRawFile(buffer: Buffer, path: string): Promise<string> {
  const cdnUrl = await uploadToBunny(path, buffer);
  return cdnUrl;
}

export async function deleteImage(path: string, fullCdnUrl?: string): Promise<void> {
  // Purge CDN edge cache first (best-effort), then delete from storage
  if (fullCdnUrl) await purgeBunnyCdn(fullCdnUrl);
  await deleteFromBunny(path);
}
