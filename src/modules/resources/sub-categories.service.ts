// ═══════════════════════════════════════════════════════════════
// sub-categories.service — UDF wrappers for /api/v1/sub-categories
//
// Includes the icon and image upload pipelines using the shared
// bunny-image-pipeline helpers.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';
import { resolveIsDeletedFilter } from '../../core/utils/visibility';
import { AppError } from '../../core/errors/app-error';
import { logger } from '../../core/logger/logger';
import {
  replaceImage,
  clearImage,
  ICON_BOX_PX,
  IMAGE_BOX_PX,
  IMAGE_MAX_BYTES
} from '../../integrations/bunny/bunny-image-pipeline';

import type {
  CreateSubCategoryBody,
  ListSubCategoriesQuery,
  UpdateSubCategoryBody,
  CreateSubCategoryTranslationBody,
  ListSubCategoryTranslationsQuery,
  UpdateSubCategoryTranslationBody
} from './sub-categories.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface SubCategoryDto {
  id: number;
  categoryId: number;
  code: string;
  slug: string;
  displayOrder: number;
  iconUrl: string | null;
  imageUrl: string | null;
  isNew: boolean;
  newUntil: string | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

export interface SubCategoryTranslationDto {
  id: number;
  subCategoryId: number;
  languageId: number;
  name: string;
  description: string | null;
  isNewTitle: string | null;
  tags: unknown | null;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  canonicalUrl: string | null;
  ogSiteName: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogType: string | null;
  ogImage: string | null;
  ogUrl: string | null;
  twitterSite: string | null;
  twitterTitle: string | null;
  twitterDescription: string | null;
  twitterImage: string | null;
  twitterCard: string | null;
  robotsDirective: string | null;
  focusKeyword: string | null;
  structuredData: unknown | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  // Parent context
  subCategoryCode: string;
  subCategorySlug: string;
  subCategoryIconUrl: string | null;
  subCategoryImageUrl: string | null;
  subCategoryIsActive: boolean;
}

interface SubCategoryRow {
  sub_category_id: number | string;
  sub_category_category_id: number | string;
  sub_category_code: string;
  sub_category_slug: string;
  sub_category_display_order: number;
  sub_category_icon_url: string | null;
  sub_category_image_url: string | null;
  sub_category_is_new: boolean;
  sub_category_new_until: string | null;
  sub_category_created_by: number | string | null;
  sub_category_updated_by: number | string | null;
  sub_category_is_active: boolean;
  sub_category_is_deleted: boolean;
  sub_category_created_at: Date | string | null;
  sub_category_updated_at: Date | string | null;
  sub_category_deleted_at: Date | string | null;
  total_count?: number | string;
}

interface SubCategoryTranslationRow {
  sub_cat_trans_id: number | string;
  sub_cat_trans_sub_category_id: number | string;
  sub_cat_trans_language_id: number | string;
  sub_cat_trans_name: string;
  sub_cat_trans_description: string | null;
  sub_cat_trans_is_new_title: string | null;
  sub_cat_trans_tags: unknown | null;
  sub_cat_trans_meta_title: string | null;
  sub_cat_trans_meta_description: string | null;
  sub_cat_trans_meta_keywords: string | null;
  sub_cat_trans_canonical_url: string | null;
  sub_cat_trans_og_site_name: string | null;
  sub_cat_trans_og_title: string | null;
  sub_cat_trans_og_description: string | null;
  sub_cat_trans_og_type: string | null;
  sub_cat_trans_og_image: string | null;
  sub_cat_trans_og_url: string | null;
  sub_cat_trans_twitter_site: string | null;
  sub_cat_trans_twitter_title: string | null;
  sub_cat_trans_twitter_description: string | null;
  sub_cat_trans_twitter_image: string | null;
  sub_cat_trans_twitter_card: string | null;
  sub_cat_trans_robots_directive: string | null;
  sub_cat_trans_focus_keyword: string | null;
  sub_cat_trans_structured_data: unknown | null;
  sub_cat_trans_created_by: number | string | null;
  sub_cat_trans_updated_by: number | string | null;
  sub_cat_trans_is_active: boolean;
  sub_cat_trans_is_deleted: boolean;
  sub_cat_trans_created_at: Date | string | null;
  sub_cat_trans_updated_at: Date | string | null;
  sub_cat_trans_deleted_at: Date | string | null;
  sub_category_code: string;
  sub_category_slug: string;
  sub_category_icon_url: string | null;
  sub_category_image_url: string | null;
  sub_category_is_active: boolean;
  total_count?: number | string;
}

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapSubCategory = (row: SubCategoryRow): SubCategoryDto => ({
  id: Number(row.sub_category_id),
  categoryId: Number(row.sub_category_category_id),
  code: row.sub_category_code,
  slug: row.sub_category_slug,
  displayOrder: row.sub_category_display_order,
  iconUrl: row.sub_category_icon_url,
  imageUrl: row.sub_category_image_url,
  isNew: row.sub_category_is_new,
  newUntil: row.sub_category_new_until,
  isActive: row.sub_category_is_active,
  isDeleted: row.sub_category_is_deleted,
  createdAt: toIsoString(row.sub_category_created_at),
  updatedAt: toIsoString(row.sub_category_updated_at),
  deletedAt: toIsoString(row.sub_category_deleted_at)
});

const mapSubCategoryTranslation = (row: SubCategoryTranslationRow): SubCategoryTranslationDto => ({
  id: Number(row.sub_cat_trans_id),
  subCategoryId: Number(row.sub_cat_trans_sub_category_id),
  languageId: Number(row.sub_cat_trans_language_id),
  name: row.sub_cat_trans_name,
  description: row.sub_cat_trans_description,
  isNewTitle: row.sub_cat_trans_is_new_title,
  tags: row.sub_cat_trans_tags,
  metaTitle: row.sub_cat_trans_meta_title,
  metaDescription: row.sub_cat_trans_meta_description,
  metaKeywords: row.sub_cat_trans_meta_keywords,
  canonicalUrl: row.sub_cat_trans_canonical_url,
  ogSiteName: row.sub_cat_trans_og_site_name,
  ogTitle: row.sub_cat_trans_og_title,
  ogDescription: row.sub_cat_trans_og_description,
  ogType: row.sub_cat_trans_og_type,
  ogImage: row.sub_cat_trans_og_image,
  ogUrl: row.sub_cat_trans_og_url,
  twitterSite: row.sub_cat_trans_twitter_site,
  twitterTitle: row.sub_cat_trans_twitter_title,
  twitterDescription: row.sub_cat_trans_twitter_description,
  twitterImage: row.sub_cat_trans_twitter_image,
  twitterCard: row.sub_cat_trans_twitter_card,
  robotsDirective: row.sub_cat_trans_robots_directive,
  focusKeyword: row.sub_cat_trans_focus_keyword,
  structuredData: row.sub_cat_trans_structured_data,
  isActive: row.sub_cat_trans_is_active,
  isDeleted: row.sub_cat_trans_is_deleted,
  createdAt: toIsoString(row.sub_cat_trans_created_at),
  updatedAt: toIsoString(row.sub_cat_trans_updated_at),
  deletedAt: toIsoString(row.sub_cat_trans_deleted_at),
  subCategoryCode: row.sub_category_code,
  subCategorySlug: row.sub_category_slug,
  subCategoryIconUrl: row.sub_category_icon_url,
  subCategoryImageUrl: row.sub_category_image_url,
  subCategoryIsActive: row.sub_category_is_active
});

// ─── Sub-Category CRUD ───────────────────────────────────────────

export interface ListSubCategoriesResult {
  rows: SubCategoryDto[];
  meta: PaginationMeta;
}

export const listSubCategories = async (
  q: ListSubCategoriesQuery
): Promise<ListSubCategoriesResult> => {
  const { filterIsDeleted, hideDeleted } = resolveIsDeletedFilter(q.isDeleted);
  const { rows, totalCount } = await db.callTableFunction<SubCategoryRow>(
    'udf_get_sub_categories',
    {
      p_id: null,
      p_is_active: q.isActive ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_category_id: q.categoryId ?? null,
      p_filter_is_new: q.isNew ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: filterIsDeleted,
      p_hide_deleted: hideDeleted,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapSubCategory),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getSubCategoryById = async (id: number): Promise<SubCategoryDto | null> => {
  const { rows } = await db.callTableFunction<SubCategoryRow>(
    'udf_get_sub_categories',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapSubCategory(row) : null;
};

export interface CreateSubCategoryResult {
  id: number;
  translationId?: number;
}

export const createSubCategory = async (
  body: CreateSubCategoryBody,
  callerId: number | null
): Promise<CreateSubCategoryResult> => {
  const result = await db.callFunction('udf_sub_categories_insert', {
    p_category_id: body.categoryId,
    p_code: body.code,
    p_slug: body.slug ?? null,
    p_display_order: body.displayOrder ?? null,
    p_is_new: body.isNew ?? null,
    p_new_until: body.newUntil ?? null,
    p_is_active: body.isActive ?? null,
    p_created_by: callerId,
    p_translation_language_id: body.translation?.languageId ?? null,
    p_translation_name: body.translation?.name ?? null,
    p_translation_description: body.translation?.description ?? null,
    p_translation_is_new_title: body.translation?.isNewTitle ?? null,
    p_translation_tags: body.translation?.tags ?? null,
    p_translation_meta_title: body.translation?.metaTitle ?? null,
    p_translation_meta_description: body.translation?.metaDescription ?? null,
    p_translation_meta_keywords: body.translation?.metaKeywords ?? null,
    p_translation_canonical_url: body.translation?.canonicalUrl ?? null,
    p_translation_og_site_name: body.translation?.ogSiteName ?? null,
    p_translation_og_title: body.translation?.ogTitle ?? null,
    p_translation_og_description: body.translation?.ogDescription ?? null,
    p_translation_og_type: body.translation?.ogType ?? null,
    p_translation_og_image: body.translation?.ogImage ?? null,
    p_translation_og_url: body.translation?.ogUrl ?? null,
    p_translation_twitter_site: body.translation?.twitterSite ?? null,
    p_translation_twitter_title: body.translation?.twitterTitle ?? null,
    p_translation_twitter_description: body.translation?.twitterDescription ?? null,
    p_translation_twitter_image: body.translation?.twitterImage ?? null,
    p_translation_twitter_card: body.translation?.twitterCard ?? null,
    p_translation_robots_directive: body.translation?.robotsDirective ?? null,
    p_translation_focus_keyword: body.translation?.focusKeyword ?? null,
    p_translation_structured_data: body.translation?.structuredData ?? null
  });
  return {
    id: Number(result.id),
    translationId: result.translationId ? Number(result.translationId) : undefined
  };
};

export const updateSubCategory = async (
  id: number,
  body: UpdateSubCategoryBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_sub_categories_update', {
    p_id: id,
    p_category_id: body.categoryId ?? null,
    p_code: body.code ?? null,
    p_slug: body.slug ?? null,
    p_display_order: body.displayOrder ?? null,
    p_is_new: body.isNew ?? null,
    p_new_until: body.newUntil ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

export const deleteSubCategory = async (id: number): Promise<void> => {
  await db.callFunction('udf_sub_categories_delete', { p_id: id });
};

export const restoreSubCategory = async (id: number): Promise<void> => {
  await db.callFunction('udf_sub_categories_restore', { p_id: id, p_restore_translations: true });
};

// ─── Sub-Category Translation CRUD ──────────────────────────────

export interface ListSubCategoryTranslationsResult {
  rows: SubCategoryTranslationDto[];
  meta: PaginationMeta;
}

export const listSubCategoryTranslations = async (
  subCategoryId: number,
  q: ListSubCategoryTranslationsQuery
): Promise<ListSubCategoryTranslationsResult> => {
  const { filterIsDeleted, hideDeleted } = resolveIsDeletedFilter(q.isDeleted);
  const { rows, totalCount } = await db.callTableFunction<SubCategoryTranslationRow>(
    'udf_get_sub_category_translations',
    {
      p_id: null,
      p_sub_category_id: subCategoryId,
      p_language_id: q.languageId ?? null,
      p_is_active: q.isActive ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_sub_category_is_active: null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: filterIsDeleted,
      p_hide_deleted: hideDeleted,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapSubCategoryTranslation),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getSubCategoryTranslationById = async (
  id: number
): Promise<SubCategoryTranslationDto | null> => {
  const { rows } = await db.callTableFunction<SubCategoryTranslationRow>(
    'udf_get_sub_category_translations',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapSubCategoryTranslation(row) : null;
};

export const createSubCategoryTranslation = async (
  subCategoryId: number,
  body: CreateSubCategoryTranslationBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_sub_category_translations_insert', {
    p_sub_category_id: subCategoryId,
    p_language_id: body.languageId,
    p_name: body.name,
    p_description: body.description ?? null,
    p_is_new_title: body.isNewTitle ?? null,
    p_tags: body.tags ?? null,
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
    p_structured_data: body.structuredData ?? null,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

export const updateSubCategoryTranslation = async (
  id: number,
  body: UpdateSubCategoryTranslationBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_sub_category_translations_update', {
    p_id: id,
    p_name: body.name ?? null,
    p_description: body.description ?? null,
    p_is_new_title: body.isNewTitle ?? null,
    p_tags: body.tags ?? null,
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
    p_structured_data: body.structuredData ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

export const deleteSubCategoryTranslation = async (id: number): Promise<void> => {
  await db.callFunction('udf_sub_category_translations_delete', { p_id: id });
};

export const restoreSubCategoryTranslation = async (id: number): Promise<void> => {
  await db.callFunction('udf_sub_category_translations_restore', { p_id: id });
};

// ─── Icon upload / delete (shared Bunny helper) ──────────────────

const setSubCategoryIconUrl = async (
  id: number,
  iconUrl: string | null,
  callerId: number | null
): Promise<void> => {
  await db.query(
    `UPDATE sub_categories
        SET icon_url   = $2,
            updated_by = COALESCE($3, updated_by),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND is_deleted = FALSE`,
    [id, iconUrl, callerId]
  );
};

export const processSubCategoryIconUpload = async (
  id: number,
  file: Express.Multer.File,
  callerId: number | null
): Promise<SubCategoryDto> => {
  const existing = await getSubCategoryById(id);
  if (!existing) {
    throw AppError.notFound(`Sub-category ${id} not found`);
  }
  if (existing.isDeleted) {
    throw AppError.badRequest(
      `Sub-category ${id} is soft-deleted; restore it before uploading an icon`
    );
  }

  const result = await replaceImage({
    inputBuffer: file.buffer,
    targetPath: `sub-categories/icons/${id}.webp`,
    currentUrl: existing.iconUrl,
    boxPx: ICON_BOX_PX,
    maxBytes: IMAGE_MAX_BYTES,
    logContext: { subCategoryId: id, imageType: 'icon' }
  });

  if (!result) {
    throw AppError.badRequest(
      `Sub-category icon is too complex to compress under ${Math.round(IMAGE_MAX_BYTES / 1024)} KB. Try a simpler image.`,
      { maxBytes: IMAGE_MAX_BYTES }
    );
  }

  await setSubCategoryIconUrl(id, result.cdnUrl, callerId);

  const refreshed = await getSubCategoryById(id);
  if (!refreshed) {
    throw AppError.internal('Sub-category disappeared after icon upload');
  }
  return refreshed;
};

export const deleteSubCategoryIcon = async (
  id: number,
  callerId: number | null
): Promise<SubCategoryDto> => {
  const existing = await getSubCategoryById(id);
  if (!existing) {
    throw AppError.notFound(`Sub-category ${id} not found`);
  }
  if (existing.isDeleted) {
    throw AppError.badRequest(
      `Sub-category ${id} is soft-deleted; restore it before deleting its icon`
    );
  }

  await clearImage({
    targetPath: `sub-categories/icons/${id}.webp`,
    currentUrl: existing.iconUrl,
    logContext: { subCategoryId: id, imageType: 'icon' }
  });

  await setSubCategoryIconUrl(id, null, callerId);

  const refreshed = await getSubCategoryById(id);
  if (!refreshed) {
    throw AppError.internal('Sub-category disappeared after icon deletion');
  }
  return refreshed;
};

// ─── Image upload / delete (shared Bunny helper) ─────────────────

const setSubCategoryImageUrl = async (
  id: number,
  imageUrl: string | null,
  callerId: number | null
): Promise<void> => {
  await db.query(
    `UPDATE sub_categories
        SET image_url  = $2,
            updated_by = COALESCE($3, updated_by),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND is_deleted = FALSE`,
    [id, imageUrl, callerId]
  );
};

export const processSubCategoryImageUpload = async (
  id: number,
  file: Express.Multer.File,
  callerId: number | null
): Promise<SubCategoryDto> => {
  const existing = await getSubCategoryById(id);
  if (!existing) {
    throw AppError.notFound(`Sub-category ${id} not found`);
  }
  if (existing.isDeleted) {
    throw AppError.badRequest(
      `Sub-category ${id} is soft-deleted; restore it before uploading an image`
    );
  }

  const result = await replaceImage({
    inputBuffer: file.buffer,
    targetPath: `sub-categories/images/${id}.webp`,
    currentUrl: existing.imageUrl,
    boxPx: IMAGE_BOX_PX,
    maxBytes: IMAGE_MAX_BYTES,
    logContext: { subCategoryId: id, imageType: 'image' }
  });

  if (!result) {
    throw AppError.badRequest(
      `Sub-category image is too complex to compress under ${Math.round(IMAGE_MAX_BYTES / 1024)} KB. Try a simpler image.`,
      { maxBytes: IMAGE_MAX_BYTES }
    );
  }

  await setSubCategoryImageUrl(id, result.cdnUrl, callerId);

  const refreshed = await getSubCategoryById(id);
  if (!refreshed) {
    throw AppError.internal('Sub-category disappeared after image upload');
  }
  return refreshed;
};

export const deleteSubCategoryImage = async (
  id: number,
  callerId: number | null
): Promise<SubCategoryDto> => {
  const existing = await getSubCategoryById(id);
  if (!existing) {
    throw AppError.notFound(`Sub-category ${id} not found`);
  }
  if (existing.isDeleted) {
    throw AppError.badRequest(
      `Sub-category ${id} is soft-deleted; restore it before deleting its image`
    );
  }

  await clearImage({
    targetPath: `sub-categories/images/${id}.webp`,
    currentUrl: existing.imageUrl,
    logContext: { subCategoryId: id, imageType: 'image' }
  });

  await setSubCategoryImageUrl(id, null, callerId);

  const refreshed = await getSubCategoryById(id);
  if (!refreshed) {
    throw AppError.internal('Sub-category disappeared after image deletion');
  }
  return refreshed;
};
