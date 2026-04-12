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
