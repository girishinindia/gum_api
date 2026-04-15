// ═══════════════════════════════════════════════════════════════
// bundles.service — UDF wrappers for /api/v1/bundles
//
// Provides CRUD operations for bundles (parent) and
// bundle_translations (child).
// GET function uses 1-based p_page_index / p_page_size.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';
import { AppError } from '../../core/errors/app-error';
import { resolveIsDeletedFilter } from '../../core/utils/visibility';
import {
  replaceImage,
  IMAGE_BOX_PX,
  IMAGE_MAX_BYTES
} from '../../integrations/bunny/bunny-image-pipeline';

import type {
  CreateBundleBody,
  CreateBundleTranslationBody,
  ListBundlesQuery,
  UpdateBundleBody,
  UpdateBundleTranslationBody
} from './bundles.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface BundleListDto {
  bundleTransId: number;
  bundleId: number;
  bundleCode: string | null;
  bundleSlug: string | null;
  bundleTransTitle: string | null;
  languageCode: string | null;
  bundleOwner: string;
  bundlePrice: number;
  bundleIsFeatured: boolean;
  bundleIsActive: boolean;
  instructorFullName: string | null;
}

// ─── Internal Row Interface ────────────────────────────────────

interface BundleListRow {
  bundle_trans_id: number | string;
  bundle_id: number | string;
  bundle_code: string | null;
  bundle_slug: string | null;
  bundle_trans_title: string | null;
  language_code: string | null;
  bundle_owner: string;
  bundle_price: number | string;
  bundle_is_featured: boolean;
  bundle_is_active: boolean;
  instructor_full_name: string | null;
  total_count?: number | string;
}

// ─── Mapper ────────────────────────────────────────────────────

const mapRow = (row: BundleListRow): BundleListDto => ({
  bundleTransId: Number(row.bundle_trans_id),
  bundleId: Number(row.bundle_id),
  bundleCode: row.bundle_code,
  bundleSlug: row.bundle_slug,
  bundleTransTitle: row.bundle_trans_title,
  languageCode: row.language_code,
  bundleOwner: row.bundle_owner,
  bundlePrice: Number(row.bundle_price),
  bundleIsFeatured: row.bundle_is_featured,
  bundleIsActive: row.bundle_is_active,
  instructorFullName: row.instructor_full_name
});

// ─── Bundle CRUD ───────────────────────────────────────────────

export interface ListResult {
  rows: BundleListDto[];
  meta: PaginationMeta;
}

export const listBundles = async (q: ListBundlesQuery): Promise<ListResult> => {
  // Tri-state isDeleted (super-admin's default 'all' is injected by middleware).
  const { filterIsDeleted, hideDeleted } = resolveIsDeletedFilter(q.isDeleted);
  const { rows, totalCount } = await db.callTableFunction<BundleListRow>(
    'udf_get_bundles',
    {
      p_id: null,
      p_bundle_id: null,
      p_language_id: q.languageId ?? null,
      p_is_active: null,
      p_filter_bundle_owner: q.bundleOwner ?? null,
      p_filter_is_featured: q.isFeatured ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: filterIsDeleted,
      p_hide_deleted: hideDeleted,
      p_search_term: q.searchTerm ?? null,
      p_sort_table: q.sortTable,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapRow),
    meta: buildPaginationMeta(q.pageIndex - 1, q.pageSize, totalCount)
  };
};

export const getBundleById = async (
  id: number,
  languageId?: number
): Promise<BundleListDto | null> => {
  const { rows } = await db.callTableFunction<BundleListRow>(
    'udf_get_bundles',
    {
      p_id: id,
      p_language_id: languageId ?? null
    }
  );
  const row = rows[0];
  return row ? mapRow(row) : null;
};

export const createBundle = async (
  body: CreateBundleBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_bundles', {
    p_bundle_owner: body.bundleOwner ?? null,
    p_instructor_id: body.instructorId ?? null,
    p_code: body.code ?? null,
    p_slug: body.slug ?? null,
    p_price: body.price ?? null,
    p_original_price: body.originalPrice ?? null,
    p_discount_percentage: body.discountPercentage ?? null,
    p_validity_days: body.validityDays ?? null,
    p_starts_at: body.startsAt ?? null,
    p_expires_at: body.expiresAt ?? null,
    p_is_featured: body.isFeatured ?? null,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateBundle = async (
  id: number,
  body: UpdateBundleBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_bundles', {
    p_id: id,
    p_bundle_owner: body.bundleOwner ?? null,
    p_instructor_id: body.instructorId !== undefined ? body.instructorId : null,
    p_code: body.code !== undefined ? body.code : null,
    p_slug: body.slug !== undefined ? body.slug : null,
    p_price: body.price ?? null,
    p_original_price: body.originalPrice ?? null,
    p_discount_percentage: body.discountPercentage ?? null,
    p_validity_days: body.validityDays ?? null,
    p_starts_at: body.startsAt ?? null,
    p_expires_at: body.expiresAt ?? null,
    p_is_featured: body.isFeatured ?? null,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteBundle = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_bundles', {
    p_id: id,
    p_actor_id: callerId
  });
};

export const restoreBundle = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_bundles', {
    p_id: id,
    p_actor_id: callerId
  });
};

// ─── Translation CRUD ──────────────────────────────────────────

export const createBundleTranslation = async (
  body: CreateBundleTranslationBody,
  _callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_bundle_translations', {
    p_bundle_id: body.bundleId,
    p_language_id: body.languageId,
    p_title: body.title,
    p_description: body.description ?? null,
    p_short_description: body.shortDescription ?? null,
    p_highlights: body.highlights ? JSON.stringify(body.highlights) : null,
    p_thumbnail_url: body.thumbnailUrl ?? null,
    p_banner_url: body.bannerUrl ?? null,
    p_tags: body.tags ? JSON.stringify(body.tags) : null,
    p_meta_title: body.metaTitle ?? null,
    p_meta_description: body.metaDescription ?? null,
    p_meta_keywords: body.metaKeywords ?? null,
    p_canonical_url: body.canonicalUrl ?? null,
    p_og_site_name: body.ogSiteName ?? null,
    p_og_title: body.ogTitle ?? null,
    p_og_description: body.ogDescription ?? null,
    p_og_type: body.ogType ?? null,
    p_og_image: body.ogImage ?? null,
    p_og_url: body.ogUrl ?? null,
    p_twitter_site: body.twitterSite ?? null,
    p_twitter_title: body.twitterTitle ?? null,
    p_twitter_description: body.twitterDescription ?? null,
    p_twitter_image: body.twitterImage ?? null,
    p_twitter_card: body.twitterCard ?? null,
    p_robots_directive: body.robotsDirective ?? null,
    p_focus_keyword: body.focusKeyword ?? null,
    p_structured_data: body.structuredData ? JSON.stringify(body.structuredData) : null,
    p_is_active: body.isActive ?? null
  });
  return { id: Number(result.id) };
};

export const updateBundleTranslation = async (
  id: number,
  body: UpdateBundleTranslationBody,
  _callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_bundle_translations', {
    p_id: id,
    p_title: body.title !== undefined ? body.title : null,
    p_description: body.description !== undefined ? body.description : null,
    p_short_description: body.shortDescription !== undefined ? body.shortDescription : null,
    p_highlights: body.highlights ? JSON.stringify(body.highlights) : null,
    p_thumbnail_url: body.thumbnailUrl !== undefined ? body.thumbnailUrl : null,
    p_banner_url: body.bannerUrl !== undefined ? body.bannerUrl : null,
    p_tags: body.tags ? JSON.stringify(body.tags) : null,
    p_meta_title: body.metaTitle !== undefined ? body.metaTitle : null,
    p_meta_description: body.metaDescription !== undefined ? body.metaDescription : null,
    p_meta_keywords: body.metaKeywords !== undefined ? body.metaKeywords : null,
    p_canonical_url: body.canonicalUrl !== undefined ? body.canonicalUrl : null,
    p_og_site_name: body.ogSiteName !== undefined ? body.ogSiteName : null,
    p_og_title: body.ogTitle !== undefined ? body.ogTitle : null,
    p_og_description: body.ogDescription !== undefined ? body.ogDescription : null,
    p_og_type: body.ogType !== undefined ? body.ogType : null,
    p_og_image: body.ogImage !== undefined ? body.ogImage : null,
    p_og_url: body.ogUrl !== undefined ? body.ogUrl : null,
    p_twitter_site: body.twitterSite !== undefined ? body.twitterSite : null,
    p_twitter_title: body.twitterTitle !== undefined ? body.twitterTitle : null,
    p_twitter_description: body.twitterDescription !== undefined ? body.twitterDescription : null,
    p_twitter_image: body.twitterImage !== undefined ? body.twitterImage : null,
    p_twitter_card: body.twitterCard ?? null,
    p_robots_directive: body.robotsDirective ?? null,
    p_focus_keyword: body.focusKeyword !== undefined ? body.focusKeyword : null,
    p_structured_data: body.structuredData ? JSON.stringify(body.structuredData) : null,
    p_is_active: body.isActive ?? null
  });
};

// ─── Translation read-by-id helper ─────────────────────────────
//
// Used by the image upload pipeline to fetch the current image URLs so
// the prior CDN object can be deleted before the new one is PUT.

interface BundleTranslationRow {
  bundle_trans_id: number | string;
  bundle_trans_thumbnail_url: string | null;
  bundle_trans_banner_url: string | null;
  og_image: string | null;
  twitter_image: string | null;
}

export interface BundleTranslationImageUrls {
  thumbnailUrl: string | null;
  bannerUrl: string | null;
  ogImage: string | null;
  twitterImage: string | null;
}

const getBundleTranslationImageUrls = async (
  id: number
): Promise<BundleTranslationImageUrls | null> => {
  // Use db.query directly because uv_bundle_translations is a VIEW, not a function.
  const result = await db.query<BundleTranslationRow>(
    `SELECT bundle_trans_id, bundle_trans_thumbnail_url, bundle_trans_banner_url, og_image, twitter_image
     FROM uv_bundle_translations
     WHERE bundle_trans_id = $1
     LIMIT 1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    thumbnailUrl: row.bundle_trans_thumbnail_url,
    bannerUrl: row.bundle_trans_banner_url,
    ogImage: row.og_image,
    twitterImage: row.twitter_image
  };
};

// ─── Image upload pipeline (translations only) ─────────────────
//
// Same Bunny WebP contract as phase-08 — sharp re-encode, ≤100 KB cap,
// deterministic path `bundles/translations/<tid>/<segment>.webp`.
// All four slots use IMAGE_BOX_PX (512). Bundles have no icon.

export type BundleTranslationImageSlot =
  | 'thumbnail'
  | 'banner'
  | 'ogImage'
  | 'twitterImage';

export type BundleTranslationImageFiles = Partial<
  Record<BundleTranslationImageSlot, Express.Multer.File>
>;

const BUNDLE_TRANSLATION_SLOT_CONFIG: Record<
  BundleTranslationImageSlot,
  { pathSegment: string; boxPx: number }
> = {
  thumbnail: { pathSegment: 'thumbnail', boxPx: IMAGE_BOX_PX },
  banner: { pathSegment: 'banner', boxPx: IMAGE_BOX_PX },
  ogImage: { pathSegment: 'og-image', boxPx: IMAGE_BOX_PX },
  twitterImage: { pathSegment: 'twitter-image', boxPx: IMAGE_BOX_PX }
};

const setBundleTranslationImageUrl = async (
  id: number,
  slot: BundleTranslationImageSlot,
  url: string | null,
  _callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_bundle_translations', {
    p_id: id,
    p_title: null,
    p_description: null,
    p_short_description: null,
    p_highlights: null,
    p_thumbnail_url: slot === 'thumbnail' ? url : null,
    p_banner_url: slot === 'banner' ? url : null,
    p_tags: null,
    p_meta_title: null,
    p_meta_description: null,
    p_meta_keywords: null,
    p_canonical_url: null,
    p_og_site_name: null,
    p_og_title: null,
    p_og_description: null,
    p_og_type: null,
    p_og_image: slot === 'ogImage' ? url : null,
    p_og_url: null,
    p_twitter_site: null,
    p_twitter_title: null,
    p_twitter_description: null,
    p_twitter_image: slot === 'twitterImage' ? url : null,
    p_twitter_card: null,
    p_robots_directive: null,
    p_focus_keyword: null,
    p_structured_data: null,
    p_is_active: null
  });
};

export const processBundleTranslationImageUploads = async (
  translationId: number,
  files: BundleTranslationImageFiles,
  callerId: number | null
): Promise<void> => {
  const existing = await getBundleTranslationImageUrls(translationId);
  if (!existing) {
    throw AppError.notFound(`Bundle translation ${translationId} not found`);
  }

  const currentUrls: Record<BundleTranslationImageSlot, string | null> = {
    thumbnail: existing.thumbnailUrl,
    banner: existing.bannerUrl,
    ogImage: existing.ogImage,
    twitterImage: existing.twitterImage
  };

  const slots: BundleTranslationImageSlot[] = [
    'thumbnail',
    'banner',
    'ogImage',
    'twitterImage'
  ];
  for (const slot of slots) {
    const file = files[slot];
    if (!file) continue;
    const cfg = BUNDLE_TRANSLATION_SLOT_CONFIG[slot];
    const result = await replaceImage({
      inputBuffer: file.buffer,
      targetPath: `bundles/translations/${translationId}/${cfg.pathSegment}.webp`,
      currentUrl: currentUrls[slot],
      boxPx: cfg.boxPx,
      maxBytes: IMAGE_MAX_BYTES,
      logContext: { bundleTranslationId: translationId, slot }
    });
    if (!result) {
      throw AppError.badRequest(
        `Bundle translation ${slot} is too complex to compress under ${Math.round(IMAGE_MAX_BYTES / 1024)} KB. Try a simpler image.`,
        { slot, maxBytes: IMAGE_MAX_BYTES }
      );
    }
    await setBundleTranslationImageUrl(translationId, slot, result.cdnUrl, callerId);
  }
};
