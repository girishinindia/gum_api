import { createReadStream, promises as fsp, statSync } from 'fs';
import { Readable } from 'stream';
import { config } from '../config';

const STREAM_BASE = 'https://video.bunnycdn.com';
const apiHeaders = () => ({
  'AccessKey': config.bunny.streamApiKey,
  'Accept': 'application/json',
});

/**
 * Phase 44.6 — instrumentation for the Bunny Stream upload path.
 *
 * Until now every Bunny call was silent: success was inferred from a thrown
 * error or its absence, but the actual HTTP details (status, response body,
 * timing) never landed in logs. When uploads silently failed — typically due
 * to misconfigured `BUNNY_STREAM_API_KEY` / `BUNNY_STREAM_LIBRARY_ID` or the
 * Phase-0.1 token-auth lock — admins saw "Not uploaded" in the UI with no way
 * to tell why.
 *
 * `bunnyLog` prints a compact, single-line breadcrumb for every Bunny Stream
 * request so we can pinpoint failures in seconds without attaching a debugger.
 */
function bunnyLog(step: string, info: Record<string, any>) {
  const safe = { ...info };
  if (safe.body && typeof safe.body === 'string' && safe.body.length > 400) {
    safe.body = safe.body.slice(0, 400) + '…';
  }
  // eslint-disable-next-line no-console
  console.log(`[bunny-stream] ${step}`, JSON.stringify(safe));
}

/**
 * Health check — verify Bunny Stream credentials are configured AND the
 * library is reachable. Intended for boot-time warnings and an admin
 * diagnostics endpoint. Returns a structured result; never throws.
 */
export async function pingBunnyStream(): Promise<{ ok: boolean; reason?: string; libraryId?: string; videoCount?: number }> {
  if (!config.bunny.streamApiKey) {
    return { ok: false, reason: 'BUNNY_STREAM_API_KEY env var is empty' };
  }
  if (!config.bunny.streamLibraryId) {
    return { ok: false, reason: 'BUNNY_STREAM_LIBRARY_ID env var is empty' };
  }
  try {
    const res = await fetch(`${STREAM_BASE}/library/${config.bunny.streamLibraryId}/videos?page=1&itemsPerPage=1`, {
      method: 'GET',
      headers: apiHeaders(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, reason: `Bunny responded ${res.status}: ${text.slice(0, 200)}` };
    }
    const body = await res.json() as any;
    return { ok: true, libraryId: config.bunny.streamLibraryId, videoCount: body?.totalItems ?? 0 };
  } catch (e: any) {
    return { ok: false, reason: `fetch failed: ${e.message || e}` };
  }
}

// ─── Collection Management ────────────────────────────────

interface StreamCollection {
  guid: string;
  name: string;
  videoCount: number;
  totalSize: number;
}

// In-memory cache for collection lookups within a single import run
const collectionCache = new Map<string, string>(); // name → guid

/**
 * Create a collection in Bunny Stream.
 * Returns the collection GUID.
 */
export async function createStreamCollection(name: string): Promise<string> {
  const libId = config.bunny.streamLibraryId;
  const res = await fetch(`${STREAM_BASE}/library/${libId}/collections`, {
    method: 'POST',
    headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bunny Stream create collection failed: ${res.status} ${text}`);
  }
  const data = await res.json() as { guid: string; name: string };
  collectionCache.set(name, data.guid);
  return data.guid;
}

/**
 * List collections from Bunny Stream (paginated, with optional search).
 */
export async function listStreamCollections(search?: string, page = 1, itemsPerPage = 100): Promise<{
  totalItems: number;
  items: StreamCollection[];
}> {
  const libId = config.bunny.streamLibraryId;
  const params = new URLSearchParams({
    page: String(page),
    itemsPerPage: String(itemsPerPage),
  });
  if (search) params.set('search', search);

  const res = await fetch(`${STREAM_BASE}/library/${libId}/collections?${params}`, {
    method: 'GET',
    headers: apiHeaders(),
  });
  if (!res.ok) throw new Error(`Bunny Stream list collections failed: ${res.status}`);
  return res.json() as Promise<{ totalItems: number; items: StreamCollection[] }>;
}

/**
 * Find a collection by exact name, or create it if it doesn't exist.
 * Uses in-memory cache for performance within a single import run.
 *
 * Collection naming convention for course hierarchy (flat, not nested):
 *   "CourseName > ChapterName > TopicName"
 */
export async function findOrCreateCollection(name: string): Promise<string> {
  // Check cache first
  const cached = collectionCache.get(name);
  if (cached) return cached;

  // Search Bunny Stream for existing collection
  const result = await listStreamCollections(name, 1, 50);
  const existing = result.items.find(c => c.name === name);
  if (existing) {
    collectionCache.set(name, existing.guid);
    return existing.guid;
  }

  // Create new collection
  return createStreamCollection(name);
}

/**
 * Build a collection name matching the CDN folder path convention:
 *   "CourseName/ChapterName/TopicName"
 * Since Bunny Stream collections are flat (no parent-child nesting),
 * we use "/" path-style naming so searching by subject or chapter
 * filters results naturally.
 *
 * Only topic-level collections are created (where videos actually live).
 * Course and chapter levels are encoded in the name for searchability.
 */
export function buildCollectionName(courseName: string, chapterName?: string, topicName?: string): string {
  const parts = [courseName];
  if (chapterName) parts.push(chapterName);
  if (topicName) parts.push(topicName);
  return parts.join('/');
}

/**
 * Create topic-level collections for a course.
 * Only creates collections at the topic level (where videos live).
 * Course and chapter names are part of the path-style collection name
 * for easy searching/filtering in the Bunny Stream dashboard.
 *
 * Returns a map of "course/chapter/topic" → collectionId.
 */
export async function createCourseCollections(
  courseName: string,
  chapters: { name: string; topics: { name: string }[] }[]
): Promise<Map<string, string>> {
  const collectionsMap = new Map<string, string>();

  // Only create topic-level collections (no empty course/chapter containers)
  for (const chapter of chapters) {
    for (const topic of chapter.topics) {
      const topicCollName = buildCollectionName(courseName, chapter.name, topic.name);
      const topicCollId = await findOrCreateCollection(topicCollName);
      collectionsMap.set(topicCollName, topicCollId);
    }
  }

  return collectionsMap;
}

/**
 * Clear the in-memory collection cache (call after import finishes).
 */
export function clearCollectionCache(): void {
  collectionCache.clear();
}

/**
 * Delete a collection from Bunny Stream.
 */
export async function deleteStreamCollection(collectionId: string): Promise<void> {
  const libId = config.bunny.streamLibraryId;
  const res = await fetch(`${STREAM_BASE}/library/${libId}/collections/${collectionId}`, {
    method: 'DELETE',
    headers: apiHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bunny Stream delete collection failed: ${res.status} ${text}`);
  }
}

/**
 * List ALL videos in the Bunny Stream library (auto-paginates).
 * Returns flat array of { guid, title, collectionId, status, storageSize }.
 */
export async function listAllStreamVideos(): Promise<{ guid: string; title: string; collectionId: string; status: number; storageSize: number }[]> {
  const all: any[] = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    const result = await listStreamVideos({ page, itemsPerPage: perPage });
    all.push(...result.items);
    if (all.length >= result.totalItems || result.items.length < perPage) break;
    page++;
  }
  return all.map(v => ({ guid: v.guid, title: v.title, collectionId: v.collectionId || '', status: v.status, storageSize: v.storageSize || 0 }));
}

/**
 * List ALL collections in the Bunny Stream library (auto-paginates).
 */
export async function listAllStreamCollections(): Promise<StreamCollection[]> {
  const all: StreamCollection[] = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    const result = await listStreamCollections(undefined, page, perPage);
    all.push(...result.items);
    if (all.length >= result.totalItems || result.items.length < perPage) break;
    page++;
  }
  return all;
}

// ─── Video Upload (existing buffer method) ─────────────────

/**
 * Create a video entry in Bunny Stream, then upload the binary.
 * Returns { videoId, embedUrl, thumbnailUrl, status }
 */
export async function uploadVideoToStream(
  buffer: Buffer,
  title: string,
  collectionId?: string
): Promise<{ videoId: string; embedUrl: string; thumbnailUrl: string; status: number }> {
  const libId = config.bunny.streamLibraryId;

  // Step 1: Create video object
  const body: any = { title };
  if (collectionId) body.collectionId = collectionId;

  const createRes = await fetch(`${STREAM_BASE}/library/${libId}/videos`, {
    method: 'POST',
    headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

// ─── Streaming upload (no buffer — for large videos) ──────

/**
 * Stream a video file from disk directly into Bunny Stream.
 * Used when multer writes large uploads to disk; avoids loading the
 * whole file into Node heap (which would OOM on multi-GB videos).
 *
 * Returns the same shape as uploadVideoToStream.
 */
export async function uploadVideoStreamFromPath(
  filePath: string,
  title: string,
  collectionId?: string,
): Promise<{ videoId: string; embedUrl: string; thumbnailUrl: string; status: number }> {
  const libId = config.bunny.streamLibraryId;
  const overallT0 = Date.now();

  // Phase 44.6 — surface boot-level misconfig immediately so the admin sees
  // a clear "credentials missing" message instead of a fetch error 30 s later.
  if (!config.bunny.streamApiKey || !libId) {
    const missing = !config.bunny.streamApiKey ? 'BUNNY_STREAM_API_KEY' : 'BUNNY_STREAM_LIBRARY_ID';
    bunnyLog('config.missing', { missing, filePath, title });
    throw new Error(`Bunny Stream is not configured — ${missing} is empty. Add it to .env and restart.`);
  }

  let fileSize = 0;
  try { fileSize = statSync(filePath).size; } catch { /* size logged as 0 */ }
  bunnyLog('upload.start', { title, libId, fileSize, filePath });

  // Step 1: Create video object
  const body: any = { title };
  if (collectionId) body.collectionId = collectionId;

  const createT0 = Date.now();
  const createRes = await fetch(`${STREAM_BASE}/library/${libId}/videos`, {
    method: 'POST',
    headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const createMs = Date.now() - createT0;
  if (!createRes.ok) {
    const text = await createRes.text();
    bunnyLog('create.fail', { status: createRes.status, body: text, ms: createMs, title });
    throw new Error(`Bunny Stream create failed: ${createRes.status} ${text}`);
  }
  const videoData = await createRes.json() as { guid: string; status: number };
  const videoId = videoData.guid;
  bunnyLog('create.ok', { videoId, ms: createMs });

  // Step 2: Stream binary upload
  try {
    const nodeStream = createReadStream(filePath);
    // Node's fetch accepts a Web ReadableStream as body — convert with Readable.toWeb.
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

    const uploadT0 = Date.now();
    const uploadRes = await fetch(`${STREAM_BASE}/library/${libId}/videos/${videoId}`, {
      method: 'PUT',
      headers: {
        'AccessKey': config.bunny.streamApiKey,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(fileSize),
      },
      body: webStream,
      // Node's fetch requires `duplex: 'half'` when sending a stream body.
      ...({ duplex: 'half' } as any),
    });
    const uploadMs = Date.now() - uploadT0;
    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      bunnyLog('upload.fail', { status: uploadRes.status, body: text, ms: uploadMs, videoId, fileSize });
      try { await deleteVideoFromStream(videoId); } catch {}
      throw new Error(`Bunny Stream upload failed: ${uploadRes.status} ${text}`);
    }
    bunnyLog('upload.ok', { videoId, ms: uploadMs, fileSize, totalMs: Date.now() - overallT0 });
  } catch (err: any) {
    bunnyLog('upload.threw', { videoId, message: err?.message, totalMs: Date.now() - overallT0 });
    try { await deleteVideoFromStream(videoId); } catch {}
    throw err;
  } finally {
    // Best-effort cleanup of multer's temp file (caller may also clean up)
    fsp.unlink(filePath).catch(() => {});
  }

  const embedUrl = `https://iframe.mediadelivery.net/embed/${libId}/${videoId}`;
  const thumbnailUrl = config.bunny.streamCdn
    ? `${config.bunny.streamCdn}/${videoId}/thumbnail.jpg`
    : `https://vz-cdn.b-cdn.net/${videoId}/thumbnail.jpg`;

  return { videoId, embedUrl, thumbnailUrl, status: videoData.status };
}

/**
 * Extract a Bunny Stream video GUID from a stored URL string.
 * Recognises both embed URLs (https://iframe.mediadelivery.net/embed/{lib}/{guid})
 * and direct CDN URLs (https://vz-*.b-cdn.net/{guid}/...).
 * Returns null for external URLs (YouTube, Vimeo, etc.) so callers can skip cleanup.
 */
export function extractBunnyVideoGuid(url: string | null | undefined): string | null {
  if (!url) return null;
  // Embed URL: .../embed/<libId>/<guid>
  const embedMatch = url.match(/mediadelivery\.net\/embed\/\d+\/([0-9a-fA-F-]{36})/);
  if (embedMatch) return embedMatch[1];
  // Direct play / thumbnail URL: ...b-cdn.net/<guid>/...
  const cdnMatch = url.match(/b-cdn\.net\/([0-9a-fA-F-]{36})\//);
  if (cdnMatch) return cdnMatch[1];
  return null;
}

// ─── Video Fetch from URL (zero server memory) ────────────

/**
 * Fetch a video into Bunny Stream directly from a URL.
 * Bunny Stream pulls the video itself — no server memory or bandwidth used.
 *
 * @param sourceUrl   The direct URL to the video file (e.g., Bunny CDN storage URL)
 * @param title       Display title for the video in Stream
 * @param collectionId Optional collection GUID to organize the video
 * @returns           { success, videoId } — videoId extracted from response headers if available
 */
export async function fetchVideoFromUrl(
  sourceUrl: string,
  title: string,
  collectionId?: string
): Promise<{ success: boolean; message?: string }> {
  const libId = config.bunny.streamLibraryId;

  const params = new URLSearchParams();
  if (collectionId) params.set('collectionId', collectionId);

  const url = `${STREAM_BASE}/library/${libId}/videos/fetch${params.toString() ? '?' + params.toString() : ''}`;

  const body: any = { url: sourceUrl, title };

  // If source is Bunny CDN storage, add the storage access key as a header
  if (sourceUrl.includes(config.bunny.storageUrl?.replace('https://', '') || 'storage.bunnycdn.com')) {
    body.headers = { AccessKey: config.bunny.storageKey };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bunny Stream fetch failed: ${res.status} ${text}`);
  }

  const data = await res.json() as { success: boolean; message?: string; statusCode?: number; id?: string };
  return { success: data.success !== false, message: data.message };
}

/**
 * Build a direct Bunny CDN Storage URL for a file path.
 * This URL can be passed to fetchVideoFromUrl for Stream to pull directly.
 */
export function buildStorageUrl(filePath: string): string {
  return `${config.bunny.storageUrl}/${config.bunny.storageZone}/${filePath}`;
}

// ─── Video Status & Deletion ──────────────────────────────

/**
 * Get video status/details from Bunny Stream
 */
export async function getVideoStatus(videoId: string): Promise<any> {
  const libId = config.bunny.streamLibraryId;
  const res = await fetch(`${STREAM_BASE}/library/${libId}/videos/${videoId}`, {
    method: 'GET',
    headers: apiHeaders(),
  });
  if (!res.ok) throw new Error(`Bunny Stream get failed: ${res.status}`);
  return res.json();
}

/**
 * List videos in the Bunny Stream library.
 * Optionally filter by collection or search by title.
 */
export async function listStreamVideos(options: {
  collectionId?: string;
  search?: string;
  page?: number;
  itemsPerPage?: number;
  orderBy?: string;
} = {}): Promise<{ totalItems: number; items: any[] }> {
  const libId = config.bunny.streamLibraryId;
  const params = new URLSearchParams({
    page: String(options.page || 1),
    itemsPerPage: String(options.itemsPerPage || 100),
  });
  if (options.collectionId) params.set('collection', options.collectionId);
  if (options.search) params.set('search', options.search);
  if (options.orderBy) params.set('orderBy', options.orderBy);

  const res = await fetch(`${STREAM_BASE}/library/${libId}/videos?${params}`, {
    method: 'GET',
    headers: apiHeaders(),
  });
  if (!res.ok) throw new Error(`Bunny Stream list videos failed: ${res.status}`);
  return res.json() as Promise<{ totalItems: number; items: any[] }>;
}

/**
 * Delete a video from Bunny Stream
 */
export async function deleteVideoFromStream(videoId: string): Promise<void> {
  const libId = config.bunny.streamLibraryId;
  const res = await fetch(`${STREAM_BASE}/library/${libId}/videos/${videoId}`, {
    method: 'DELETE',
    headers: apiHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bunny Stream delete failed: ${res.status} ${text}`);
  }
}
