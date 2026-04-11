// ═══════════════════════════════════════════════════════════════
// social-medias.service — UDF wrappers for /api/v1/social-medias
//
// Includes the icon upload pipeline (using shared bunny-image-pipeline helper):
//   multer buffer → shared replaceImage() → persist URL via
//   a raw SQL UPDATE (UDF update signature does NOT carry icon_url).
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';
import { AppError } from '../../core/errors/app-error';
import { logger } from '../../core/logger/logger';
import {
  replaceImage,
  clearImage,
  ICON_BOX_PX,
  type ReplaceImageResult
} from '../../integrations/bunny/bunny-image-pipeline';

import type {
  CreateSocialMediaBody,
  ListSocialMediasQuery,
  UpdateSocialMediaBody
} from './social-medias.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface SocialMediaDto {
  id: number;
  name: string;
  code: string;
  baseUrl: string | null;
  iconUrl: string | null;
  placeholder: string | null;
  platformType: string;
  displayOrder: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

interface SocialMediaRow {
  social_media_id: number | string;
  social_media_name: string;
  social_media_code: string;
  social_media_base_url: string | null;
  social_media_icon_url: string | null;
  social_media_placeholder: string | null;
  social_media_platform_type: string;
  social_media_display_order: number;
  social_media_created_by: number | string | null;
  social_media_updated_by: number | string | null;
  social_media_is_active: boolean;
  social_media_is_deleted: boolean;
  social_media_created_at: Date | string | null;
  social_media_updated_at: Date | string | null;
  social_media_deleted_at: Date | string | null;
}

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapSocialMedia = (row: SocialMediaRow): SocialMediaDto => ({
  id: Number(row.social_media_id),
  name: row.social_media_name,
  code: row.social_media_code,
  baseUrl: row.social_media_base_url,
  iconUrl: row.social_media_icon_url,
  placeholder: row.social_media_placeholder,
  platformType: row.social_media_platform_type,
  displayOrder: row.social_media_display_order,
  isActive: row.social_media_is_active,
  isDeleted: row.social_media_is_deleted,
  createdAt: toIsoString(row.social_media_created_at),
  updatedAt: toIsoString(row.social_media_updated_at),
  deletedAt: toIsoString(row.social_media_deleted_at)
});

// ─── List ────────────────────────────────────────────────────────

export interface ListSocialMediasResult {
  rows: SocialMediaDto[];
  meta: PaginationMeta;
}

export const listSocialMedias = async (
  q: ListSocialMediasQuery
): Promise<ListSocialMediasResult> => {
  const { rows, totalCount } = await db.callTableFunction<SocialMediaRow>(
    'udf_get_social_medias',
    {
      p_id: null,
      p_is_active: q.isActive ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_platform_type: q.platformType ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? null,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapSocialMedia),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by id ───────────────────────────────────────────────────

export const getSocialMediaById = async (
  id: number
): Promise<SocialMediaDto | null> => {
  const { rows } = await db.callTableFunction<SocialMediaRow>(
    'udf_get_social_medias',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapSocialMedia(row) : null;
};

// ─── Create ──────────────────────────────────────────────────────

export interface CreateSocialMediaResult {
  id: number;
}

export const createSocialMedia = async (
  body: CreateSocialMediaBody,
  callerId: number | null
): Promise<CreateSocialMediaResult> => {
  const result = await db.callFunction('udf_social_medias_insert', {
    p_name: body.name,
    p_code: body.code,
    p_base_url: body.baseUrl ?? null,
    p_placeholder: body.placeholder ?? null,
    p_platform_type: body.platformType,
    p_display_order: body.displayOrder ?? 0,
    p_is_active: body.isActive ?? true,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

// ─── Update ──────────────────────────────────────────────────────

export const updateSocialMedia = async (
  id: number,
  body: UpdateSocialMediaBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_social_medias_update', {
    p_id: id,
    p_name: body.name ?? null,
    p_code: body.code ?? null,
    p_base_url: body.baseUrl ?? null,
    p_placeholder: body.placeholder ?? null,
    p_platform_type: body.platformType ?? null,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

// ─── Delete (soft) ───────────────────────────────────────────────

export const deleteSocialMedia = async (id: number): Promise<void> => {
  await db.callFunction('udf_social_medias_delete', { p_id: id });
};

// ─── Restore ─────────────────────────────────────────────────────

export const restoreSocialMedia = async (id: number): Promise<void> => {
  await db.callFunction('udf_social_medias_restore', { p_id: id });
};

// ─── Icon upload / delete (Bunny CDN) ────────────────────────────

/**
 * Internal-only: write the icon_url column directly. The
 * `udf_social_medias_update` signature does not carry icon_url, so
 * this function is the only path that changes it — called exclusively
 * from `processSocialMediaIconUpload` and `deleteSocialMediaIcon`.
 */
const setSocialMediaIconUrl = async (
  id: number,
  iconUrl: string | null,
  callerId: number | null
): Promise<void> => {
  await db.query(
    `UPDATE social_medias
        SET icon_url   = $2,
            updated_by = COALESCE($3, updated_by),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND is_deleted = FALSE`,
    [id, iconUrl, callerId]
  );
};

export const processSocialMediaIconUpload = async (
  id: number,
  file: Express.Multer.File,
  callerId: number | null
): Promise<SocialMediaDto> => {
  // 1. Social media must exist and not be soft-deleted.
  const existing = await getSocialMediaById(id);
  if (!existing) {
    throw AppError.notFound(`Social media ${id} not found`);
  }
  if (existing.isDeleted) {
    throw AppError.badRequest(
      `Social media ${id} is soft-deleted; restore it before uploading an icon`
    );
  }

  // 2. Replace the image on Bunny (includes validation & encoding).
  const targetPath = `social-medias/icons/${id}.webp`;
  const result = await replaceImage({
    inputBuffer: file.buffer,
    targetPath,
    currentUrl: existing.iconUrl,
    boxPx: ICON_BOX_PX,
    logContext: { socialMediaId: id }
  });

  if (!result) {
    throw AppError.badRequest(
      'Social media icon is too complex to compress under 100 KB. Try a simpler image.',
      { maxBytes: 100 * 1024 }
    );
  }

  // 3. Persist the URL via the internal-only setter.
  await setSocialMediaIconUrl(id, result.cdnUrl, callerId);

  // 4. Return the refreshed row so the client can render it immediately.
  const refreshed = await getSocialMediaById(id);
  if (!refreshed) {
    throw AppError.internal('Social media disappeared after icon upload');
  }
  return refreshed;
};

export const deleteSocialMediaIcon = async (
  id: number,
  callerId: number | null
): Promise<SocialMediaDto> => {
  const existing = await getSocialMediaById(id);
  if (!existing) {
    throw AppError.notFound(`Social media ${id} not found`);
  }
  if (existing.isDeleted) {
    throw AppError.badRequest(
      `Social media ${id} is soft-deleted; restore it before deleting its icon`
    );
  }

  // Best-effort delete of any stored Bunny object, then clear the column.
  const targetPath = `social-medias/icons/${id}.webp`;
  await clearImage({
    targetPath,
    currentUrl: existing.iconUrl,
    logContext: { socialMediaId: id }
  });

  await setSocialMediaIconUrl(id, null, callerId);

  const refreshed = await getSocialMediaById(id);
  if (!refreshed) {
    throw AppError.internal('Social media disappeared after icon deletion');
  }
  return refreshed;
};
