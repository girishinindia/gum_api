import sharp from 'sharp';
import { uploadToBunny, deleteFromBunny, deleteBunnyDirectory, listBunnyStorage as _listBunnyStorage, purgeBunnyCdn } from '../config/bunny';

// Re-export flat listing for use by other modules
export const listBunnyStorage = _listBunnyStorage;

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

export interface CdnTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  children?: CdnTreeNode[];
}

/**
 * Recursively list all files and folders from Bunny CDN under a given path.
 * Returns a tree structure.
 */
export async function listBunnyStorageRecursive(dirPath: string): Promise<CdnTreeNode[]> {
  const items = await listBunnyStorage(dirPath);
  const nodes: CdnTreeNode[] = [];

  for (const item of items) {
    const name = (item.ObjectName || '').replace(/\/$/, '');
    if (!name || name === '.folder') continue;

    const fullPath = dirPath ? `${dirPath}/${name}` : name;

    if (item.IsDirectory) {
      const children = await listBunnyStorageRecursive(fullPath);
      nodes.push({ name, path: fullPath, isDirectory: true, size: 0, children });
    } else {
      nodes.push({ name, path: fullPath, isDirectory: false, size: item.Length || 0 });
    }
  }

  return nodes;
}

/**
 * Download a file from Bunny CDN and return its content as a string.
 */
export async function downloadBunnyFile(filePath: string): Promise<string> {
  const { config } = require('../config');
  const url = `${config.bunny.storageUrl}/${config.bunny.storageZone}/${filePath}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { AccessKey: config.bunny.storageKey },
  });
  if (!res.ok) throw new Error(`Bunny download failed: ${res.status}`);
  return res.text();
}

/**
 * Download a file from Bunny CDN and return its content as a Buffer (binary).
 * Used for downloading video files to re-upload to Bunny Stream.
 */
export async function downloadBunnyFileBuffer(filePath: string): Promise<Buffer> {
  const { config } = require('../config');
  const url = `${config.bunny.storageUrl}/${config.bunny.storageZone}/${filePath}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { AccessKey: config.bunny.storageKey },
  });
  if (!res.ok) throw new Error(`Bunny binary download failed: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function deleteImage(path: string, fullCdnUrl?: string): Promise<void> {
  // Purge CDN edge cache first (best-effort), then delete from storage
  if (fullCdnUrl) await purgeBunnyCdn(fullCdnUrl);
  await deleteFromBunny(path);
}
