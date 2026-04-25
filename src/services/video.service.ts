import { config } from '../config';

const STREAM_BASE = 'https://video.bunnycdn.com';
const apiHeaders = () => ({
  'AccessKey': config.bunny.streamApiKey,
  'Accept': 'application/json',
});

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
 * Build a hierarchical collection name following the convention:
 *   "CourseName > ChapterName > TopicName"
 * Since Bunny Stream collections are flat (no parent-child), we use
 * this naming convention to simulate hierarchy.
 */
export function buildCollectionName(courseName: string, chapterName?: string, topicName?: string): string {
  const parts = [courseName];
  if (chapterName) parts.push(chapterName);
  if (topicName) parts.push(topicName);
  return parts.join(' > ');
}

/**
 * Create the full collection hierarchy for a course.
 * Creates: course-level, chapter-level, and topic-level collections.
 * Returns a map of "course > chapter > topic" → collectionId.
 */
export async function createCourseCollections(
  courseName: string,
  chapters: { name: string; topics: { name: string }[] }[]
): Promise<Map<string, string>> {
  const collectionsMap = new Map<string, string>();

  // Course-level collection
  const courseCollName = buildCollectionName(courseName);
  const courseCollId = await findOrCreateCollection(courseCollName);
  collectionsMap.set(courseCollName, courseCollId);

  // Chapter and topic level collections
  for (const chapter of chapters) {
    const chapterCollName = buildCollectionName(courseName, chapter.name);
    const chapterCollId = await findOrCreateCollection(chapterCollName);
    collectionsMap.set(chapterCollName, chapterCollId);

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
