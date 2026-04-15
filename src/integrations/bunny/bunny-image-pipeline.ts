// ═══════════════════════════════════════════════════════════════
// bunny-image-pipeline — shared WebP + Bunny CDN replace helper.
//
// Extracted from the specializations.service icon pipeline so the
// same contract is reused by:
//   • learning-goals:   icon
//   • social-medias:    icon
//   • categories:       icon + image
//   • sub-categories:   icon + image
// …and any future resource that needs a replaceable image hosted
// on Bunny storage.
//
// Contract (locked — do not weaken without revisiting verify-master-data):
//
//   1. Input MIME:       PNG / JPEG / WebP / SVG (enforced by multer
//                        BEFORE the buffer ever reaches this helper)
//   2. Output MIME:      ALWAYS image/webp, regardless of the input
//   3. Resize:           `fit: 'inside'` inside the caller-supplied box
//                        (256 px for icons, 512 px for images) so the
//                        source aspect ratio is preserved
//   4. Byte cap:         ≤ 100 KB on the final WebP. If the default
//                        quality (80) exceeds the cap, sharp is retried
//                        at progressively lower quality (80 → 40 in
//                        steps of 10). If the cap is still exceeded,
//                        the helper returns `null` and the route is
//                        expected to throw a 413.
//   5. Delete-before-upload:
//                        BEFORE the new PUT, the helper deletes BOTH
//                        the deterministic target key AND — if it
//                        differs — whatever path is currently stored
//                        in the caller's `currentUrl`. Each delete is
//                        best-effort (log WARN, continue) so a
//                        transient Bunny failure never blocks a
//                        re-upload.
//   6. Deterministic key:
//                        The caller supplies the target path (e.g.
//                        `categories/icons/<id>.webp`). Re-uploads hit
//                        the same key so the public CDN URL is stable.
//
// The helper NEVER writes to the DB — it only returns the new cdnUrl
// (or null on cap-overflow). Persisting the URL is the resource
// service's job (typically a raw SQL UPDATE against the parent row,
// because the UDF update signature does not carry icon/image columns).
// ═══════════════════════════════════════════════════════════════

import sharp from 'sharp';

import { env } from '../../config/env';
import { logger } from '../../core/logger/logger';
import { bunnyCacheService } from './bunny-cache.service';
import { bunnyStorageService } from './bunny-storage.service';

// ─── Locked constants ───────────────────────────────────────────
//
// These are part of the public contract and are re-validated by
// `verify-master-data.ts`. Do not widen without updating the verify
// script and the user-facing documentation.

/** Hard cap on the re-encoded WebP, in bytes. */
export const IMAGE_MAX_BYTES = 100 * 1024; // 100 KB

/** Default bounding box for small icons (learning-goal, social-media, category icon, sub-category icon). */
export const ICON_BOX_PX = 256;

/** Default bounding box for larger hero images (category image, sub-category image). */
export const IMAGE_BOX_PX = 512;

/** sharp WebP quality start/floor/step — lower until the byte cap is met. */
const INITIAL_QUALITY = 80;
const MIN_QUALITY = 40;
const QUALITY_STEP = 10;

// ─── Public types ────────────────────────────────────────────────

export interface EncodeImageOptions {
  /** Edge length of the bounding box (icons = 256, images = 512). */
  boxPx: number;
  /** Byte cap on the final WebP. Defaults to IMAGE_MAX_BYTES. */
  maxBytes?: number;
}

export interface ReplaceImageOptions {
  /** Raw input buffer from multer (PNG/JPEG/WebP/SVG). */
  inputBuffer: Buffer;
  /** The deterministic storage key we want to end up with, e.g. `categories/icons/42.webp`. */
  targetPath: string;
  /** Currently-stored CDN URL on the parent row (null if this is the first upload). */
  currentUrl: string | null;
  /** Bounding box for resize. */
  boxPx: number;
  /** Byte cap; defaults to IMAGE_MAX_BYTES. */
  maxBytes?: number;
  /** Extra context (resource + id) for log lines. */
  logContext: Record<string, unknown>;
}

export interface ReplaceImageResult {
  /** Public CDN URL of the newly uploaded WebP. */
  cdnUrl: string;
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Extract the Bunny storage path from a CDN URL we wrote ourselves.
 * Returns null for externally-hosted URLs so we never issue deletes
 * against someone else's origin.
 */
export const extractBunnyPath = (cdnUrl: string | null): string | null => {
  if (!cdnUrl) return null;
  const base = env.BUNNY_CDN_URL.replace(/\/+$/, '');
  if (!cdnUrl.startsWith(base + '/')) return null;
  return cdnUrl.slice(base.length + 1);
};

/**
 * Best-effort delete from Bunny. Never throws; logs at WARN so the
 * caller can proceed with the new upload even if the stale object
 * couldn't be removed (a transient Bunny failure shouldn't block
 * a user re-uploading their image).
 */
export const safeDeleteFromBunny = async (
  path: string,
  logContext: Record<string, unknown>
): Promise<void> => {
  try {
    await bunnyStorageService.delete(path);
  } catch (err) {
    logger.warn(
      { err, path, ...logContext },
      'Bunny image pipeline: best-effort delete failed; continuing'
    );
  }
};

/**
 * Best-effort CDN edge-cache purge for a storage path. Never throws.
 *
 * Why this exists: the deterministic-key strategy means the public CDN
 * URL is stable across re-uploads. Without an edge-purge after PUT,
 * Bunny continues to serve the previously-cached WebP from its edge
 * nodes even though the storage object has been replaced, so the user
 * sees the OLD image at the same URL until the cache TTL expires.
 *
 * The purge is best-effort: storage was already updated successfully,
 * so a transient purge failure should not fail the API call (worst case
 * the user sees the stale image until natural cache expiry).
 */
export const safePurgeBunnyCache = async (
  path: string,
  logContext: Record<string, unknown>
): Promise<void> => {
  try {
    await bunnyCacheService.purgeFile(path);
  } catch (err) {
    logger.warn(
      { err, path, ...logContext },
      'Bunny image pipeline: best-effort CDN cache purge failed; continuing'
    );
  }
};

/**
 * Validate that the input buffer is a readable image. Throws if
 * sharp chokes on the bytes. Callers should re-wrap as AppError.badRequest.
 */
export const assertReadableImage = async (input: Buffer): Promise<void> => {
  await sharp(input).metadata();
};

/**
 * Re-encode `input` to a WebP that fits within `maxBytes`. Starts at
 * quality 80 and steps down in chunks of 10 until the output fits —
 * or we hit quality 40, at which point we return `null` so the caller
 * can reject with 413.
 */
export const encodeToCappedWebp = async (
  input: Buffer,
  opts: EncodeImageOptions
): Promise<Buffer | null> => {
  const maxBytes = opts.maxBytes ?? IMAGE_MAX_BYTES;
  for (let quality = INITIAL_QUALITY; quality >= MIN_QUALITY; quality -= QUALITY_STEP) {
    const out = await sharp(input)
      .resize({
        width: opts.boxPx,
        height: opts.boxPx,
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ quality })
      .toBuffer();
    if (out.byteLength <= maxBytes) {
      return out;
    }
  }
  return null;
};

/**
 * Full replace flow:
 *   1. validate bytes are a readable image
 *   2. re-encode to capped WebP (null → caller throws 413)
 *   3. delete prior keys (deterministic + `currentUrl`-derived)
 *   4. upload the new WebP under `targetPath`
 *   5. return the new cdnUrl
 *
 * This helper NEVER writes to the DB. Persistence is the caller's job.
 */
export const replaceImage = async (
  opts: ReplaceImageOptions
): Promise<ReplaceImageResult | null> => {
  const { inputBuffer, targetPath, currentUrl, boxPx, maxBytes, logContext } = opts;

  // 1. Validate input is a readable image (sharp will throw on garbage).
  await assertReadableImage(inputBuffer);

  // 2. Re-encode with the quality-reduction loop.
  const webpBuffer = await encodeToCappedWebp(inputBuffer, { boxPx, maxBytes });
  if (!webpBuffer) {
    return null;
  }

  // 3. Collect prior keys to evict (deterministic target + any url-derived path).
  const priorPathFromUrl = extractBunnyPath(currentUrl);
  const pathsToDelete = new Set<string>();
  pathsToDelete.add(targetPath);
  if (priorPathFromUrl && priorPathFromUrl !== targetPath) {
    pathsToDelete.add(priorPathFromUrl);
  }

  // 4. Delete prior object(s) — log-and-continue on failure.
  for (const p of pathsToDelete) {
    await safeDeleteFromBunny(p, logContext);
  }

  // 5. Upload the new WebP to Bunny under the deterministic key.
  const { cdnUrl } = await bunnyStorageService.upload({
    buffer: webpBuffer,
    targetPath,
    contentType: 'image/webp'
  });

  // 6. Purge the CDN edge cache for this URL so the next read serves
  //    the freshly-uploaded WebP and not the stale cached copy.
  //    Deterministic keys mean the URL never changes between re-uploads,
  //    so without this step Bunny keeps returning the old image until
  //    the natural TTL expires. Best-effort: storage already succeeded.
  await safePurgeBunnyCache(targetPath, logContext);

  return { cdnUrl };
};

/**
 * Clear flow (DELETE /:id/icon or /:id/image):
 *   • extract the path from `currentUrl` if it's one of ours; otherwise
 *     fall back to the deterministic target key
 *   • best-effort delete that path
 *
 * Like `replaceImage`, this helper NEVER clears the DB column; the
 * caller is responsible for writing `null` back to the parent row.
 */
export const clearImage = async (opts: {
  targetPath: string;
  currentUrl: string | null;
  logContext: Record<string, unknown>;
}): Promise<void> => {
  const { targetPath, currentUrl, logContext } = opts;
  const priorPath = extractBunnyPath(currentUrl) ?? targetPath;
  await safeDeleteFromBunny(priorPath, logContext);
  // Purge the CDN edge so the now-deleted URL stops returning a cached body.
  await safePurgeBunnyCache(priorPath, logContext);
};
