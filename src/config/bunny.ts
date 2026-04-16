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
