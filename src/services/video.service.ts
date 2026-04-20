import { config } from '../config';

const STREAM_BASE = 'https://video.bunnycdn.com';
const headers = () => ({
  'AccessKey': config.bunny.streamApiKey,
  'Accept': 'application/json',
});

/**
 * Create a video entry in Bunny Stream, then upload the binary.
 * Returns { videoId, embedUrl, thumbnailUrl, status }
 */
export async function uploadVideoToStream(
  buffer: Buffer,
  title: string
): Promise<{ videoId: string; embedUrl: string; thumbnailUrl: string; status: number }> {
  const libId = config.bunny.streamLibraryId;

  // Step 1: Create video object
  const createRes = await fetch(`${STREAM_BASE}/library/${libId}/videos`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Bunny Stream create failed: ${createRes.status} ${text}`);
  }
  const videoData = await createRes.json() as { guid: string; status: number };
  const videoId = videoData.guid;

  // Step 2: Upload binary
  const uploadRes = await fetch(`${STREAM_BASE}/library/${libId}/videos/${videoId}`, {
    method: 'PUT',
    headers: { 'AccessKey': config.bunny.streamApiKey, 'Content-Type': 'application/octet-stream' },
    body: buffer,
  });
  if (!uploadRes.ok) {
    // Clean up created video on upload failure
    try { await deleteVideoFromStream(videoId); } catch {}
    const text = await uploadRes.text();
    throw new Error(`Bunny Stream upload failed: ${uploadRes.status} ${text}`);
  }

  const embedUrl = `https://iframe.mediadelivery.net/embed/${libId}/${videoId}`;
  const thumbnailUrl = config.bunny.streamCdn
    ? `${config.bunny.streamCdn}/${videoId}/thumbnail.jpg`
    : `https://vz-cdn.b-cdn.net/${videoId}/thumbnail.jpg`;

  return { videoId, embedUrl, thumbnailUrl, status: videoData.status };
}

/**
 * Get video status/details from Bunny Stream
 */
export async function getVideoStatus(videoId: string): Promise<any> {
  const libId = config.bunny.streamLibraryId;
  const res = await fetch(`${STREAM_BASE}/library/${libId}/videos/${videoId}`, {
    method: 'GET',
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Bunny Stream get failed: ${res.status}`);
  return res.json();
}

/**
 * Delete a video from Bunny Stream
 */
export async function deleteVideoFromStream(videoId: string): Promise<void> {
  const libId = config.bunny.streamLibraryId;
  const res = await fetch(`${STREAM_BASE}/library/${libId}/videos/${videoId}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bunny Stream delete failed: ${res.status} ${text}`);
  }
}
