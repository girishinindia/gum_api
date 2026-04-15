// ═══════════════════════════════════════════════════════════════
// specializations.service — UDF wrappers for /api/v1/specializations
//
// Includes the icon upload pipeline:
//   multer buffer → sharp re-encode (WebP, max 256x256 inside box) →
//   100 KB byte-cap check → delete prior Bunny object(s) →
//   bunnyStorageService.upload → persist URL via a raw SQL UPDATE
//   (UDF update signature does NOT carry icon_url, so the service
//   writes the column directly against the specializations row).
// ═══════════════════════════════════════════════════════════════

import sharp from 'sharp';

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';
import { resolveIsDeletedFilter } from '../../core/utils/visibility';
import { AppError } from '../../core/errors/app-error';
import { logger } from '../../core/logger/logger';
import { env } from '../../config/env';
import { bunnyStorageService } from '../../integrations/bunny/bunny-storage.service';

import type {
  CreateSpecializationBody,
  ListSpecializationsQuery,
  UpdateSpecializationBody
} from './specializations.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface SpecializationDto {
  id: number;
  name: string;
  category: string;
  description: string | null;
  iconUrl: string | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

interface SpecializationRow {
  specialization_id: number | string;
  specialization_name: string;
  specialization_category: string;
  specialization_description: string | null;
  specialization_icon_url: string | null;
  specialization_created_by: number | string | null;
  specialization_updated_by: number | string | null;
  specialization_is_active: boolean;
  specialization_is_deleted: boolean;
  specialization_created_at: Date | string | null;
  specialization_updated_at: Date | string | null;
  specialization_deleted_at: Date | string | null;
}

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapSpecialization = (row: SpecializationRow): SpecializationDto => ({
  id: Number(row.specialization_id),
  name: row.specialization_name,
  category: row.specialization_category,
  description: row.specialization_description,
  iconUrl: row.specialization_icon_url,
  isActive: row.specialization_is_active,
  isDeleted: row.specialization_is_deleted,
  createdAt: toIsoString(row.specialization_created_at),
  updatedAt: toIsoString(row.specialization_updated_at),
  deletedAt: toIsoString(row.specialization_deleted_at)
});

// ─── List ────────────────────────────────────────────────────────

export interface ListSpecializationsResult {
  rows: SpecializationDto[];
  meta: PaginationMeta;
}

export const listSpecializations = async (
  q: ListSpecializationsQuery
): Promise<ListSpecializationsResult> => {
  const { filterIsDeleted, hideDeleted } = resolveIsDeletedFilter(q.isDeleted);
  const { rows, totalCount } = await db.callTableFunction<SpecializationRow>(
    'udf_get_specializations',
    {
      p_is_active: q.isActive ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_category: q.category ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: filterIsDeleted,
      p_hide_deleted: hideDeleted,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapSpecialization),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ───────────────────────────────────────────────────

export const getSpecializationById = async (
  id: number
): Promise<SpecializationDto | null> => {
  const { rows } = await db.callTableFunction<SpecializationRow>(
    'udf_get_specializations',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapSpecialization(row) : null;
};

// ─── Create ──────────────────────────────────────────────────────

export interface CreateSpecializationResult {
  id: number;
}

export const createSpecialization = async (
  body: CreateSpecializationBody,
  callerId: number | null
): Promise<CreateSpecializationResult> => {
  const result = await db.callFunction('udf_specializations_insert', {
    p_name: body.name,
    p_category: body.category,
    p_description: body.description ?? null,
    p_is_active: body.isActive ?? true,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

// ─── Update ──────────────────────────────────────────────────────

export const updateSpecialization = async (
  id: number,
  body: UpdateSpecializationBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_specializations_update', {
    p_id: id,
    p_name: body.name ?? null,
    p_category: body.category ?? null,
    p_description: body.description ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

// ─── Delete (soft) ───────────────────────────────────────────────

export const deleteSpecialization = async (id: number): Promise<void> => {
  await db.callFunction('udf_specializations_delete', { p_id: id });
};

// ─── Restore ─────────────────────────────────────────────────────

export const restoreSpecialization = async (id: number): Promise<void> => {
  await db.callFunction('udf_specializations_restore', { p_id: id });
};

// ─── Icon upload / delete (Bunny CDN) ────────────────────────────
//
// Pipeline: multer buffer → sharp validate → sharp re-encode (WebP, max
// 256×256 inside box, quality 80) → byte-cap check (≤ 100 KB) → delete
// prior Bunny object(s) → bunnyStorageService.upload →
// `setSpecializationIconUrl` writes the column via raw SQL.
//
// Key rules baked in here (NOT in the route) so the contract survives
// any future caller:
//   • output is always WebP, regardless of input MIME
//   • final byte size must be ≤ 100 KB (100 * 1024 bytes) — if the
//     first pass exceeds the cap, sharp is retried at progressively
//     lower quality; if the cap is still exceeded, we reject 413
//   • storage key is deterministic (`specializations/icons/<id>.webp`)
//     so re-uploads hit the same object and the CDN URL stays stable
//   • BEFORE the new upload, we explicitly delete both the deterministic
//     key and whatever path is currently stored in `icon_url` (if it
//     differs). Each delete is best-effort: failures are logged at WARN
//     and do not block the new upload.
//
// Multer's hard upper bound is 100 KB on the *raw* upload (see
// `core/middlewares/upload.ts`). This keeps pathological inputs (e.g. a
// 2 MB PNG) from ever reaching sharp.

const ICON_MAX_BYTES = 100 * 1024; // 100 KB final WebP byte cap
const ICON_BOX_PX = 256;           // max edge length for the rendered icon
const ICON_INITIAL_QUALITY = 80;
const ICON_MIN_QUALITY = 40;
const ICON_QUALITY_STEP = 10;

/**
 * Internal-only: write the icon_url column directly. The
 * `udf_specializations_update` signature does not carry icon_url, so
 * this function is the only path that changes it — called exclusively
 * from `processSpecializationIconUpload` and `deleteSpecializationIcon`.
 */
const setSpecializationIconUrl = async (
  id: number,
  iconUrl: string | null,
  callerId: number | null
): Promise<void> => {
  await db.query(
    `UPDATE specializations
        SET icon_url   = $2,
            updated_by = COALESCE($3, updated_by),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND is_deleted = FALSE`,
    [id, iconUrl, callerId]
  );
};

/**
 * Extract the Bunny storage path from a CDN URL we wrote ourselves.
 * Returns null for externally-hosted URLs so we never issue deletes
 * against someone else's origin.
 */
const extractBunnyPath = (cdnUrl: string | null): string | null => {
  if (!cdnUrl) return null;
  const base = env.BUNNY_CDN_URL.replace(/\/+$/, '');
  if (!cdnUrl.startsWith(base + '/')) return null;
  return cdnUrl.slice(base.length + 1);
};

/**
 * Best-effort delete: never throws, never blocks the caller. A non-OK
 * response (including 404 for already-gone objects) is logged at WARN
 * and swallowed so the caller can proceed.
 */
const safeDeleteFromBunny = async (path: string, specializationId: number): Promise<void> => {
  try {
    await bunnyStorageService.delete(path);
  } catch (err) {
    logger.warn(
      { err, path, specializationId },
      'Specialization icon: best-effort Bunny delete failed; continuing'
    );
  }
};

/**
 * Encode a WebP that fits within `ICON_MAX_BYTES`. Starts at
 * `ICON_INITIAL_QUALITY` and steps down in `ICON_QUALITY_STEP` chunks
 * until the output fits — or we hit `ICON_MIN_QUALITY`, at which point
 * we give up and let the caller throw a 413.
 */
const encodeIconToCappedWebp = async (input: Buffer): Promise<Buffer | null> => {
  for (let quality = ICON_INITIAL_QUALITY; quality >= ICON_MIN_QUALITY; quality -= ICON_QUALITY_STEP) {
    const out = await sharp(input)
      .resize({
        width: ICON_BOX_PX,
        height: ICON_BOX_PX,
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ quality })
      .toBuffer();
    if (out.byteLength <= ICON_MAX_BYTES) {
      return out;
    }
  }
  return null;
};

export const processSpecializationIconUpload = async (
  id: number,
  file: Express.Multer.File,
  callerId: number | null
): Promise<SpecializationDto> => {
  // 1. Specialization must exist and not be soft-deleted before we
  //    burn a Bunny round-trip on it.
  const existing = await getSpecializationById(id);
  if (!existing) {
    throw AppError.notFound(`Specialization ${id} not found`);
  }
  if (existing.isDeleted) {
    throw AppError.badRequest(
      `Specialization ${id} is soft-deleted; restore it before uploading an icon`
    );
  }

  // 2. Decode metadata. sharp throws on garbage bytes, which we
  //    re-wrap as a 400 so the client sees a clean envelope.
  try {
    await sharp(file.buffer).metadata();
  } catch (err) {
    logger.warn({ err, specializationId: id }, 'Specialization icon: sharp failed to read metadata');
    throw AppError.badRequest('Uploaded file is not a readable image');
  }

  // 3. Re-encode with the quality-reduction loop. If we still can't
  //    meet the 100 KB cap, reject with 413 rather than persist a
  //    bloated object.
  let webpBuffer: Buffer | null;
  try {
    webpBuffer = await encodeIconToCappedWebp(file.buffer);
  } catch (err) {
    logger.error({ err, specializationId: id }, 'Specialization icon: sharp WebP encode failed');
    throw AppError.internal('Failed to convert specialization icon to WebP');
  }

  if (!webpBuffer) {
    throw AppError.badRequest(
      `Specialization icon is too complex to compress under ${Math.round(ICON_MAX_BYTES / 1024)} KB. Try a simpler image.`,
      { maxBytes: ICON_MAX_BYTES }
    );
  }

  // 4. Compute the target key and the set of prior keys to evict.
  const targetPath = `specializations/icons/${id}.webp`;
  const priorPathFromUrl = extractBunnyPath(existing.iconUrl);

  const pathsToDelete = new Set<string>();
  pathsToDelete.add(targetPath);
  if (priorPathFromUrl) {
    pathsToDelete.add(priorPathFromUrl);
  }

  // 5. Delete prior icon(s). Best-effort, sequential.
  for (const p of pathsToDelete) {
    await safeDeleteFromBunny(p, id);
  }

  // 6. Upload the new WebP to Bunny under the deterministic ID key.
  const { cdnUrl } = await bunnyStorageService.upload({
    buffer: webpBuffer,
    targetPath,
    contentType: 'image/webp'
  });

  // 7. Persist the URL via the internal-only setter.
  await setSpecializationIconUrl(id, cdnUrl, callerId);

  // 8. Return the refreshed row so the client can render it
  //    immediately without a follow-up GET.
  const refreshed = await getSpecializationById(id);
  if (!refreshed) {
    throw AppError.internal('Specialization disappeared after icon upload');
  }
  return refreshed;
};

export const deleteSpecializationIcon = async (
  id: number,
  callerId: number | null
): Promise<SpecializationDto> => {
  const existing = await getSpecializationById(id);
  if (!existing) {
    throw AppError.notFound(`Specialization ${id} not found`);
  }
  if (existing.isDeleted) {
    throw AppError.badRequest(
      `Specialization ${id} is soft-deleted; restore it before deleting its icon`
    );
  }

  // Best-effort delete of any stored Bunny object, then clear the column.
  const priorPath =
    extractBunnyPath(existing.iconUrl) ?? `specializations/icons/${id}.webp`;
  await safeDeleteFromBunny(priorPath, id);

  await setSpecializationIconUrl(id, null, callerId);

  const refreshed = await getSpecializationById(id);
  if (!refreshed) {
    throw AppError.internal('Specialization disappeared after icon deletion');
  }
  return refreshed;
};
