// ═══════════════════════════════════════════════════════════════
// categories.service — UDF wrappers for /api/v1/categories
//
// Includes the icon and image upload pipelines using the shared
// bunny-image-pipeline helpers.
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
  IMAGE_BOX_PX,
  IMAGE_MAX_BYTES
} from '../../integrations/bunny/bunny-image-pipeline';

import type {
  CreateCategoryBody,
  ListCategoriesQuery,
  UpdateCategoryBody,
  CreateCategoryTranslationBody,
  ListCategoryTranslationsQuery,
  UpdateCategoryTranslationBody
} from './categories.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface CategoryDto {
  id: number;
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

export interface CategoryTranslationDto {
  id: number;
  categoryId: number;
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
  categoryCode: string;
  categorySlug: string;
  categoryIconUrl: string | null;
  categoryImageUrl: string | null;
  categoryIsActive: boolean;
}

interface CategoryRow {
  category_id: number | string;
  category_code: string;
  category_slug: string;
  category_display_order: number;
  category_icon_url: string | null;
  category_image_url: string | null;
  category_is_new: boolean;
  category_new_until: string | null;
  category_created_by: number | string | null;
  category_updated_by: number | string | null;
  category_is_active: boolean;
  category_is_deleted: boolean;
  category_created_at: Date | string | null;
  category_updated_at: Date | string | null;
  category_deleted_at: Date | string | null;
  total_count?: number | string;
}

interface CategoryTranslationRow {
  cat_trans_id: number | string;
  cat_trans_category_id: number | string;
  cat_trans_language_id: number | string;
  cat_trans_name: string;
  cat_trans_description: string | null;
  cat_trans_is_new_title: string | null;
  cat_trans_tags: unknown | null;
  cat_trans_meta_title: string | null;
  cat_trans_meta_description: string | null;
  cat_trans_meta_keywords: string | null;
  cat_trans_canonical_url: string | null;
  cat_trans_og_site_name: string | null;
  cat_trans_og_title: string | null;
  cat_trans_og_description: string | null;
  cat_trans_og_type: string | null;
  cat_trans_og_image: string | null;
  cat_trans_og_url: string | null;
  cat_trans_twitter_site: string | null;
  cat_trans_twitter_title: string | null;
  cat_trans_twitter_description: string | null;
  cat_trans_twitter_image: string | null;
  cat_trans_twitter_card: string | null;
  cat_trans_robots_directive: string | null;
  cat_trans_focus_keyword: string | null;
  cat_trans_structured_data: unknown | null;
  cat_trans_created_by: number | string | null;
  cat_trans_updated_by: number | string | null;
  cat_trans_is_active: boolean;
  cat_trans_is_deleted: boolean;
  cat_trans_created_at: Date | string | null;
  cat_trans_updated_at: Date | string | null;
  cat_trans_deleted_at: Date | string | null;
  category_code: string;
  category_slug: string;
  category_icon_url: string | null;
  category_image_url: string | null;
  category_is_active: boolean;
  total_count?: number | string;
}

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapCategory = (row: CategoryRow): CategoryDto => ({
  id: Number(row.category_id),
  code: row.category_code,
  slug: row.category_slug,
  displayOrder: row.category_display_order,
  iconUrl: row.category_icon_url,
  imageUrl: row.category_image_url,
  isNew: row.category_is_new,
  newUntil: row.category_new_until,
  isActive: row.category_is_active,
  isDeleted: row.category_is_deleted,
  createdAt: toIsoString(row.category_created_at),
  updatedAt: toIsoString(row.category_updated_at),
  deletedAt: toIsoString(row.category_deleted_at)
});

const mapCategoryTranslation = (row: CategoryTranslationRow): CategoryTranslationDto => ({
  id: Number(row.cat_trans_id),
  categoryId: Number(row.cat_trans_category_id),
  languageId: Number(row.cat_trans_language_id),
  name: row.cat_trans_name,
  description: row.cat_trans_description,
  isNewTitle: row.cat_trans_is_new_title,
  tags: row.cat_trans_tags,
  metaTitle: row.cat_trans_meta_title,
  metaDescription: row.cat_trans_meta_description,
  metaKeywords: row.cat_trans_meta_keywords,
  canonicalUrl: row.cat_trans_canonical_url,
  ogSiteName: row.cat_trans_og_site_name,
  ogTitle: row.cat_trans_og_title,
  ogDescription: row.cat_trans_og_description,
  ogType: row.cat_trans_og_type,
  ogImage: row.cat_trans_og_image,
  ogUrl: row.cat_trans_og_url,
  twitterSite: row.cat_trans_twitter_site,
  twitterTitle: row.cat_trans_twitter_title,
  twitterDescription: row.cat_trans_twitter_description,
  twitterImage: row.cat_trans_twitter_image,
  twitterCard: row.cat_trans_twitter_card,
  robotsDirective: row.cat_trans_robots_directive,
  focusKeyword: row.cat_trans_focus_keyword,
  structuredData: row.cat_trans_structured_data,
  isActive: row.cat_trans_is_active,
  isDeleted: row.cat_trans_is_deleted,
  createdAt: toIsoString(row.cat_trans_created_at),
  updatedAt: toIsoString(row.cat_trans_updated_at),
  deletedAt: toIsoString(row.cat_trans_deleted_at),
  categoryCode: row.category_code,
  categorySlug: row.category_slug,
  categoryIconUrl: row.category_icon_url,
  categoryImageUrl: row.category_image_url,
  categoryIsActive: row.category_is_active
});

// ─── Category CRUD ───────────────────────────────────────────────

export interface ListCategoriesResult {
  rows: CategoryDto[];
  meta: PaginationMeta;
}

export const listCategories = async (
  q: ListCategoriesQuery
): Promise<ListCategoriesResult> => {
  const { rows, totalCount } = await db.callTableFunction<CategoryRow>(
    'udf_get_categories',
    {
      p_id: null,
      p_is_active: q.isActive ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_is_new: q.isNew ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? null,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapCategory),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getCategoryById = async (id: number): Promise<CategoryDto | null> => {
  const { rows } = await db.callTableFunction<CategoryRow>(
    'udf_get_categories',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapCategory(row) : null;
};

export interface CreateCategoryResult {
  id: number;
  translationId?: number;
}

export const createCategory = async (
  body: CreateCategoryBody,
  callerId: number | null
): Promise<CreateCategoryResult> => {
  const result = await db.callFunction('udf_categories_insert', {
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

export const updateCategory = async (
  id: number,
  body: UpdateCategoryBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_categories_update', {
    p_id: id,
    p_code: body.code ?? null,
    p_slug: body.slug ?? null,
    p_display_order: body.displayOrder ?? null,
    p_is_new: body.isNew ?? null,
    p_new_until: body.newUntil ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

export const deleteCategory = async (id: number): Promise<void> => {
  await db.callFunction('udf_categories_delete', { p_id: id });
};

export const restoreCategory = async (id: number): Promise<void> => {
  await db.callFunction('udf_categories_restore', { p_id: id, p_restore_translations: true });
};

// ─── Category Translation CRUD ───────────────────────────────────

export interface ListCategoryTranslationsResult {
  rows: CategoryTranslationDto[];
  meta: PaginationMeta;
}

export const listCategoryTranslations = async (
  categoryId: number,
  q: ListCategoryTranslationsQuery
): Promise<ListCategoryTranslationsResult> => {
  const { rows, totalCount } = await db.callTableFunction<CategoryTranslationRow>(
    'udf_get_category_translations',
    {
      p_id: null,
      p_category_id: categoryId,
      p_language_id: q.languageId ?? null,
      p_is_active: q.isActive ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_category_is_active: null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? null,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapCategoryTranslation),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getCategoryTranslationById = async (
  id: number
): Promise<CategoryTranslationDto | null> => {
  const { rows } = await db.callTableFunction<CategoryTranslationRow>(
    'udf_get_category_translations',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapCategoryTranslation(row) : null;
};

export const createCategoryTranslation = async (
  categoryId: number,
  body: CreateCategoryTranslationBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_category_translations_insert', {
    p_category_id: categoryId,
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

export const updateCategoryTranslation = async (
  id: number,
  body: UpdateCategoryTranslationBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_category_translations_update', {
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

export const deleteCategoryTranslation = async (id: number): Promise<void> => {
  await db.callFunction('udf_category_translations_delete', { p_id: id });
};

export const restoreCategoryTranslation = async (id: number): Promise<void> => {
  await db.callFunction('udf_category_translations_restore', { p_id: id });
};

// ─── Icon upload / delete (shared Bunny helper) ──────────────────

const setCategoryIconUrl = async (
  id: number,
  iconUrl: string | null,
  callerId: number | null
): Promise<void> => {
  await db.query(
    `UPDATE categories
        SET icon_url   = $2,
            updated_by = COALESCE($3, updated_by),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND is_deleted = FALSE`,
    [id, iconUrl, callerId]
  );
};

export const processCategoryIconUpload = async (
  id: number,
  file: Express.Multer.File,
  callerId: number | null
): Promise<CategoryDto> => {
  const existing = await getCategoryById(id);
  if (!existing) {
    throw AppError.notFound(`Category ${id} not found`);
  }
  if (existing.isDeleted) {
    throw AppError.badRequest(
      `Category ${id} is soft-deleted; restore it before uploading an icon`
    );
  }

  const result = await replaceImage({
    inputBuffer: file.buffer,
    targetPath: `categories/icons/${id}.webp`,
    currentUrl: existing.iconUrl,
    boxPx: ICON_BOX_PX,
    maxBytes: IMAGE_MAX_BYTES,
    logContext: { categoryId: id, imageType: 'icon' }
  });

  if (!result) {
    throw AppError.badRequest(
      `Category icon is too complex to compress under ${Math.round(IMAGE_MAX_BYTES / 1024)} KB. Try a simpler image.`,
      { maxBytes: IMAGE_MAX_BYTES }
    );
  }

  await setCategoryIconUrl(id, result.cdnUrl, callerId);

  const refreshed = await getCategoryById(id);
  if (!refreshed) {
    throw AppError.internal('Category disappeared after icon upload');
  }
  return refreshed;
};

export const deleteCategoryIcon = async (
  id: number,
  callerId: number | null
): Promise<CategoryDto> => {
  const existing = await getCategoryById(id);
  if (!existing) {
    throw AppError.notFound(`Category ${id} not found`);
  }
  if (existing.isDeleted) {
    throw AppError.badRequest(
      `Category ${id} is soft-deleted; restore it before deleting its icon`
    );
  }

  await clearImage({
    targetPath: `categories/icons/${id}.webp`,
    currentUrl: existing.iconUrl,
    logContext: { categoryId: id, imageType: 'icon' }
  });

  await setCategoryIconUrl(id, null, callerId);

  const refreshed = await getCategoryById(id);
  if (!refreshed) {
    throw AppError.internal('Category disappeared after icon deletion');
  }
  return refreshed;
};

// ─── Image upload / delete (shared Bunny helper) ─────────────────

const setCategoryImageUrl = async (
  id: number,
  imageUrl: string | null,
  callerId: number | null
): Promise<void> => {
  await db.query(
    `UPDATE categories
        SET image_url  = $2,
            updated_by = COALESCE($3, updated_by),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND is_deleted = FALSE`,
    [id, imageUrl, callerId]
  );
};

export const processCategoryImageUpload = async (
  id: number,
  file: Express.Multer.File,
  callerId: number | null
): Promise<CategoryDto> => {
  const existing = await getCategoryById(id);
  if (!existing) {
    throw AppError.notFound(`Category ${id} not found`);
  }
  if (existing.isDeleted) {
    throw AppError.badRequest(
      `Category ${id} is soft-deleted; restore it before uploading an image`
    );
  }

  const result = await replaceImage({
    inputBuffer: file.buffer,
    targetPath: `categories/images/${id}.webp`,
    currentUrl: existing.imageUrl,
    boxPx: IMAGE_BOX_PX,
    maxBytes: IMAGE_MAX_BYTES,
    logContext: { categoryId: id, imageType: 'image' }
  });

  if (!result) {
    throw AppError.badRequest(
      `Category image is too complex to compress under ${Math.round(IMAGE_MAX_BYTES / 1024)} KB. Try a simpler image.`,
      { maxBytes: IMAGE_MAX_BYTES }
    );
  }

  await setCategoryImageUrl(id, result.cdnUrl, callerId);

  const refreshed = await getCategoryById(id);
  if (!refreshed) {
    throw AppError.internal('Category disappeared after image upload');
  }
  return refreshed;
};

export const deleteCategoryImage = async (
  id: number,
  callerId: number | null
): Promise<CategoryDto> => {
  const existing = await getCategoryById(id);
  if (!existing) {
    throw AppError.notFound(`Category ${id} not found`);
  }
  if (existing.isDeleted) {
    throw AppError.badRequest(
      `Category ${id} is soft-deleted; restore it before deleting its image`
    );
  }

  await clearImage({
    targetPath: `categories/images/${id}.webp`,
    currentUrl: existing.imageUrl,
    logContext: { categoryId: id, imageType: 'image' }
  });

  await setCategoryImageUrl(id, null, callerId);

  const refreshed = await getCategoryById(id);
  if (!refreshed) {
    throw AppError.internal('Category disappeared after image deletion');
  }
  return refreshed;
};
