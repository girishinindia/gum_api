// ═══════════════════════════════════════════════════════════════
// course-modules.service — UDF wrappers for /api/v1/course-modules
//
// Provides CRUD for course_modules and course_module_translations
// using udf_get_course_modules and CRUD UDFs.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateCourseModuleBody,
  ListCourseModulesQuery,
  UpdateCourseModuleBody,
  CreateCourseModuleTranslationBody,
  ListCourseModuleTranslationsQuery,
  UpdateCourseModuleTranslationBody
} from './course-modules.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface CourseModuleDto {
  id: number;
  courseModuleId: number;
  courseId: number;
  courseCode: string | null;
  courseSlug: string | null;
  moduleSlug: string | null;
  moduleName: string | null;
  shortIntro: string | null;
  description: string | null;
  languageId: number | null;
  languageCode: string | null;
  displayOrder: number;
  estimatedMinutes: number | null;
  viewCount: number;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CourseModuleTranslationDto {
  id: number;
  courseModuleId: number;
  languageId: number;
  name: string;
  shortIntro: string | null;
  description: string | null;
  icon: string | null;
  image: string | null;
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
  moduleSlug: string | null;
  moduleDisplayOrder: number;
  moduleCourseId: number;
  moduleCourseCode: string | null;
  moduleCourseSlug: string | null;
  languageName: string | null;
}

// ─── Internal Row Interfaces ────────────────────────────────────

interface ModuleRow {
  id: number | string;
  course_module_id: number | string;
  course_id: number | string;
  course_code: string | null;
  course_slug: string | null;
  module_slug: string | null;
  module_name: string | null;
  short_intro: string | null;
  description: string | null;
  language_id: number | string | null;
  language_code: string | null;
  display_order: number | string;
  estimated_minutes: number | null;
  view_count: number | string;
  is_active: boolean;
  created_at: Date | string | null;
  updated_at: Date | string | null;
  total_count?: number | string;
}

interface ModuleTranslationRow {
  cm_trans_id: number | string;
  cm_trans_course_module_id: number | string;
  cm_trans_language_id: number | string;
  cm_trans_name: string;
  cm_trans_short_intro: string | null;
  cm_trans_description: string | null;
  cm_trans_icon: string | null;
  cm_trans_image: string | null;
  cm_trans_tags: unknown | null;
  cm_trans_meta_title: string | null;
  cm_trans_meta_description: string | null;
  cm_trans_meta_keywords: string | null;
  cm_trans_canonical_url: string | null;
  cm_trans_og_site_name: string | null;
  cm_trans_og_title: string | null;
  cm_trans_og_description: string | null;
  cm_trans_og_type: string | null;
  cm_trans_og_image: string | null;
  cm_trans_og_url: string | null;
  cm_trans_twitter_site: string | null;
  cm_trans_twitter_title: string | null;
  cm_trans_twitter_description: string | null;
  cm_trans_twitter_image: string | null;
  cm_trans_twitter_card: string | null;
  cm_trans_robots_directive: string | null;
  cm_trans_focus_keyword: string | null;
  cm_trans_structured_data: unknown | null;
  cm_trans_is_active: boolean;
  cm_trans_is_deleted: boolean;
  cm_trans_created_at: Date | string | null;
  cm_trans_updated_at: Date | string | null;
  cm_trans_deleted_at: Date | string | null;
  cm_slug: string | null;
  cm_display_order: number | string;
  cm_course_id: number | string;
  cm_course_code: string | null;
  cm_course_slug: string | null;
  cm_trans_language_code: string | null;
  cm_trans_language_name: string | null;
  total_count?: number | string;
}

// ─── Mappers ────────────────────────────────────────────────────

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapModule = (row: ModuleRow): CourseModuleDto => ({
  id: Number(row.course_module_id),
  courseModuleId: Number(row.course_module_id),
  courseId: Number(row.course_id),
  courseCode: row.course_code,
  courseSlug: row.course_slug,
  moduleSlug: row.module_slug,
  moduleName: row.module_name,
  shortIntro: row.short_intro,
  description: row.description,
  languageId: row.language_id ? Number(row.language_id) : null,
  languageCode: row.language_code,
  displayOrder: Number(row.display_order),
  estimatedMinutes: row.estimated_minutes,
  viewCount: Number(row.view_count),
  isActive: row.is_active,
  createdAt: toIsoString(row.created_at),
  updatedAt: toIsoString(row.updated_at)
});

const mapModuleTranslation = (row: ModuleTranslationRow): CourseModuleTranslationDto => ({
  id: Number(row.cm_trans_id),
  courseModuleId: Number(row.cm_trans_course_module_id),
  languageId: Number(row.cm_trans_language_id),
  name: row.cm_trans_name,
  shortIntro: row.cm_trans_short_intro,
  description: row.cm_trans_description,
  icon: row.cm_trans_icon,
  image: row.cm_trans_image,
  tags: row.cm_trans_tags,
  metaTitle: row.cm_trans_meta_title,
  metaDescription: row.cm_trans_meta_description,
  metaKeywords: row.cm_trans_meta_keywords,
  canonicalUrl: row.cm_trans_canonical_url,
  ogSiteName: row.cm_trans_og_site_name,
  ogTitle: row.cm_trans_og_title,
  ogDescription: row.cm_trans_og_description,
  ogType: row.cm_trans_og_type,
  ogImage: row.cm_trans_og_image,
  ogUrl: row.cm_trans_og_url,
  twitterSite: row.cm_trans_twitter_site,
  twitterTitle: row.cm_trans_twitter_title,
  twitterDescription: row.cm_trans_twitter_description,
  twitterImage: row.cm_trans_twitter_image,
  twitterCard: row.cm_trans_twitter_card,
  robotsDirective: row.cm_trans_robots_directive,
  focusKeyword: row.cm_trans_focus_keyword,
  structuredData: row.cm_trans_structured_data,
  isActive: row.cm_trans_is_active,
  isDeleted: row.cm_trans_is_deleted,
  createdAt: toIsoString(row.cm_trans_created_at),
  updatedAt: toIsoString(row.cm_trans_updated_at),
  deletedAt: toIsoString(row.cm_trans_deleted_at),
  moduleSlug: row.cm_slug,
  moduleDisplayOrder: Number(row.cm_display_order),
  moduleCourseId: Number(row.cm_course_id),
  moduleCourseCode: row.cm_course_code,
  moduleCourseSlug: row.cm_course_slug,
  languageName: row.cm_trans_language_name
});

// ─── Module CRUD ────────────────────────────────────────────────

export interface ListModulesResult {
  rows: CourseModuleDto[];
  meta: PaginationMeta;
}

export const listCourseModules = async (
  q: ListCourseModulesQuery
): Promise<ListModulesResult> => {
  const { rows, totalCount } = await db.callTableFunction<ModuleRow>(
    'udf_get_course_modules',
    {
      p_id: null,
      p_course_module_id: null,
      p_course_id: null,
      p_language_id: null,
      p_filter_course_id: q.courseId ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? false,
      p_search: q.searchTerm ?? null,
      p_sort_table: 'module',
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapModule),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getCourseModuleById = async (
  id: number
): Promise<CourseModuleDto | null> => {
  const { rows } = await db.callTableFunction<ModuleRow>(
    'udf_get_course_modules',
    { p_course_module_id: id }
  );
  const row = rows[0];
  return row ? mapModule(row) : null;
};

export interface CreateModuleResult {
  id: number;
  translationId?: number;
}

export const createCourseModule = async (
  body: CreateCourseModuleBody,
  callerId: number | null
): Promise<CreateModuleResult> => {
  const result = await db.callFunction('udf_insert_course_modules', {
    p_course_id: body.courseId,
    p_slug: body.slug ?? null,
    p_display_order: body.displayOrder ?? null,
    p_estimated_minutes: body.estimatedMinutes ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });

  const out: CreateModuleResult = { id: Number(result.id) };

  if (body.translation) {
    const tResult = await db.callFunction('udf_insert_course_module_translations', {
      p_course_module_id: out.id,
      p_language_id: body.translation.languageId,
      p_name: body.translation.name,
      p_short_intro: body.translation.shortIntro ?? null,
      p_description: body.translation.description ?? null,
      p_icon: body.translation.icon ?? null,
      p_image: body.translation.image ?? null,
      p_tags: body.translation.tags ?? null,
      p_meta_title: body.translation.metaTitle ?? null,
      p_meta_description: body.translation.metaDescription ?? null,
      p_meta_keywords: body.translation.metaKeywords ?? null,
      p_canonical_url: body.translation.canonicalUrl ?? null,
      p_og_site_name: body.translation.ogSiteName ?? null,
      p_og_title: body.translation.ogTitle ?? null,
      p_og_description: body.translation.ogDescription ?? null,
      p_og_type: body.translation.ogType ?? null,
      p_og_image: body.translation.ogImage ?? null,
      p_og_url: body.translation.ogUrl ?? null,
      p_twitter_site: body.translation.twitterSite ?? null,
      p_twitter_title: body.translation.twitterTitle ?? null,
      p_twitter_description: body.translation.twitterDescription ?? null,
      p_twitter_image: body.translation.twitterImage ?? null,
      p_twitter_card: body.translation.twitterCard ?? null,
      p_robots_directive: body.translation.robotsDirective ?? null,
      p_focus_keyword: body.translation.focusKeyword ?? null,
      p_structured_data: body.translation.structuredData ?? null,
      p_is_active: body.translation.isActive ?? null,
      p_actor_id: callerId
    });
    out.translationId = Number(tResult.id);
  }

  return out;
};

export const updateCourseModule = async (
  id: number,
  body: UpdateCourseModuleBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_course_modules', {
    p_id: id,
    p_slug: body.slug ?? null,
    p_display_order: body.displayOrder ?? null,
    p_estimated_minutes: body.estimatedMinutes ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteCourseModule = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_delete_course_modules', { p_id: id, p_actor_id: callerId });
};

export const restoreCourseModule = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_restore_course_modules', {
    p_id: id,
    p_restore_translations: true,
    p_actor_id: callerId
  });
};

// ─── Module Translation CRUD ────────────────────────────────────

export interface ListModuleTranslationsResult {
  rows: CourseModuleTranslationDto[];
  meta: PaginationMeta;
}

export const listCourseModuleTranslations = async (
  moduleId: number,
  q: ListCourseModuleTranslationsQuery
): Promise<ListModuleTranslationsResult> => {
  const { rows, totalCount } = await db.callTableFunction<ModuleRow>(
    'udf_get_course_modules',
    {
      p_id: null,
      p_course_module_id: moduleId,
      p_course_id: null,
      p_language_id: q.languageId ?? null,
      p_filter_course_id: null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? false,
      p_search: q.searchTerm ?? null,
      p_sort_table: 'translation',
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapModule),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  } as unknown as ListModuleTranslationsResult;
};

export const getCourseModuleTranslationById = async (
  id: number
): Promise<CourseModuleTranslationDto | null> => {
  const { rows } = await db.callTableFunction<ModuleTranslationRow>(
    'uv_course_module_translations',
    {},
    `cm_trans_id = ${id}`,
    1
  );
  const row = rows[0];
  return row ? mapModuleTranslation(row) : null;
};

export const createCourseModuleTranslation = async (
  moduleId: number,
  body: CreateCourseModuleTranslationBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_course_module_translations', {
    p_course_module_id: moduleId,
    p_language_id: body.languageId,
    p_name: body.name,
    p_short_intro: body.shortIntro ?? null,
    p_description: body.description ?? null,
    p_icon: body.icon ?? null,
    p_image: body.image ?? null,
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
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateCourseModuleTranslation = async (
  id: number,
  body: UpdateCourseModuleTranslationBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_course_module_translations', {
    p_id: id,
    p_name: body.name ?? null,
    p_short_intro: body.shortIntro ?? null,
    p_description: body.description ?? null,
    p_icon: body.icon ?? null,
    p_image: body.image ?? null,
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
    p_actor_id: callerId
  });
};

export const deleteCourseModuleTranslation = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_delete_course_module_translations', { p_id: id, p_actor_id: callerId });
};

export const restoreCourseModuleTranslation = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_restore_course_module_translations', { p_id: id, p_actor_id: callerId });
};
