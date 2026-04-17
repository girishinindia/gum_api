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
  await fetch(url, { method: 'DELETE', headers: { AccessKey: config.bunny.storageKey } });
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
