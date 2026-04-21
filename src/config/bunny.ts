import { config } from './index';

export async function uploadToBunny(filePath: string, buffer: Buffer): Promise<string> {
  const url = `${config.bunny.storageUrl}/${config.bunny.storageZone}/${filePath}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { AccessKey: config.bunny.storageKey, 'Content-Type': 'application/octet-stream' },
    body: buffer,
  });
  if (!res.ok) throw new Error(`Bunny upload failed: ${res.status}`);
  return `${config.bunny.cdnUrl}/${filePath}`;
}

export async function deleteFromBunny(filePath: string): Promise<void> {
  const url = `${config.bunny.storageUrl}/${config.bunny.storageZone}/${filePath}`;
  const res = await fetch(url, { method: 'DELETE', headers: { AccessKey: config.bunny.storageKey } });
  if (!res.ok && res.status !== 404) {
    console.error(`Bunny DELETE failed for ${filePath}: ${res.status} ${res.statusText}`);
  }
}

/**
 * Delete a folder from Bunny storage.
 * Bunny requires a trailing slash on the folder path for directory deletion.
 */
export async function deleteBunnyDirectory(folderPath: string): Promise<void> {
  const normalized = folderPath.replace(/\/+$/, '');
  const url = `${config.bunny.storageUrl}/${config.bunny.storageZone}/${normalized}/`;
  const res = await fetch(url, { method: 'DELETE', headers: { AccessKey: config.bunny.storageKey } });
  if (!res.ok && res.status !== 404) {
    console.error(`Bunny DELETE folder failed for ${normalized}/: ${res.status} ${res.statusText}`);
  }
}

/**
 * List files/folders inside a Bunny storage directory.
 * Returns the raw Bunny API response (array of objects with Guid, ObjectName, IsDirectory, Length, etc.)
 */
export async function listBunnyStorage(dirPath: string = ''): Promise<any[]> {
  const normalized = dirPath.replace(/^\/+|\/+$/g, '');
  const url = `${config.bunny.storageUrl}/${config.bunny.storageZone}/${normalized}/`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { AccessKey: config.bunny.storageKey, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Bunny list failed: ${res.status}`);
  return res.json() as Promise<any[]>;
}

/** Purge a CDN URL from Bunny edge cache so the next request fetches fresh from storage */
export async function purgeBunnyCdn(cdnUrl: string): Promise<void> {
  if (!config.bunny.accountApiKey) return;
  try {
    await fetch(`https://api.bunny.net/purge?url=${encodeURIComponent(cdnUrl)}&async=true`, {
      method: 'POST',
      headers: { AccessKey: config.bunny.accountApiKey },
    });
  } catch {
    // Purge is best-effort; unique paths are the primary cache-bust mechanism
  }
}
