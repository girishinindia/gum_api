// ═══════════════════════════════════════════════════════════════
// chapters.service — UDF wrappers for /api/v1/chapters
//
// Handles CRUD operations for chapters and chapter translations
// with nested support for subject_id as required parent FK.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateChapterBody,
  ListChaptersQuery,
  UpdateChapterBody,
  CreateChapterTranslationBody,
  ListChapterTranslationsQuery,
  UpdateChapterTranslationBody
} from './chapters.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface ChapterDto {
  id: number;
  subjectId: number;
  slug: string;
  displayOrder: number | null;
  difficultyLevel: string | null;
  estimatedMinutes: number | null;
  viewCount: number | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  note: string | null;
}

export interface ChapterTranslationDto {
  id: number;
  chapterId: number;
  languageId: number;
  name: string;
  shortIntro: string | null;
  longIntro: string | null;
  prerequisites: string | null;
  learningObjectives: string | null;
  icon: string | null;
  image: string | null;
  video: string | null;
  tags: unknown | null;
  author: string | null;
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
  chapterSlug: string;
  subjectId: number;
}

// Row interfaces match udf_get_chapters RETURNS TABLE columns
interface ChapterRow {
  chapter_id: number | string;
  chapter_subject_id: number | string;
  chapter_slug: string;
  chapter_display_order: number | null;
  chapter_difficulty_level: string | null;
  chapter_estimated_minutes: number | null;
  chapter_view_count: number | null;
  chapter_is_active: boolean;
  chapter_is_deleted: boolean;
  chapter_created_at: Date | string | null;
  chapter_updated_at: Date | string | null;
  chapter_deleted_at: Date | string | null;
  chapter_note: string | null;
  total_count?: number | string;
}

interface ChapterTranslationRow {
  chap_trans_id: number | string;
  chap_trans_chapter_id: number | string;
  chap_trans_language_id: number | string;
  chap_trans_name: string;
  chap_trans_short_intro: string | null;
  chap_trans_long_intro: string | null;
  chap_trans_prerequisites: string | null;
  chap_trans_learning_objectives: string | null;
  chap_trans_icon: string | null;
  chap_trans_image: string | null;
  chap_trans_video_title: string | null;
  chap_trans_video_description: string | null;
  chap_trans_video_thumbnail: string | null;
  chap_trans_video_duration_minutes: number | null;
  chap_trans_tags: unknown | null;
  chap_trans_meta_title: string | null;
  chap_trans_meta_description: string | null;
  chap_trans_meta_keywords: string | null;
  chap_trans_canonical_url: string | null;
  chap_trans_og_site_name: string | null;
  chap_trans_og_title: string | null;
  chap_trans_og_description: string | null;
  chap_trans_og_type: string | null;
  chap_trans_og_image: string | null;
  chap_trans_og_url: string | null;
  chap_trans_twitter_site: string | null;
  chap_trans_twitter_title: string | null;
  chap_trans_twitter_description: string | null;
  chap_trans_twitter_image: string | null;
  chap_trans_twitter_card: string | null;
  chap_trans_robots_directive: string | null;
  chap_trans_focus_keyword: string | null;
  chap_trans_author_name: string | null;
  chap_trans_author_bio: string | null;
  chap_trans_structured_data: unknown | null;
  chap_trans_is_active: boolean;
  chap_trans_is_deleted: boolean;
  chap_trans_created_at: Date | string | null;
  chap_trans_updated_at: Date | string | null;
  chap_trans_deleted_at: Date | string | null;
  chapter_slug: string;
  chapter_subject_id: number | string;
  total_count?: number | string;
}

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapChapter = (row: ChapterRow): ChapterDto => ({
  id: Number(row.chapter_id),
  subjectId: Number(row.chapter_subject_id),
  slug: row.chapter_slug,
  displayOrder: row.chapter_display_order,
  difficultyLevel: row.chapter_difficulty_level,
  estimatedMinutes: row.chapter_estimated_minutes,
  viewCount: row.chapter_view_count ?? null,
  isActive: row.chapter_is_active,
  isDeleted: row.chapter_is_deleted ?? false,
  createdAt: toIsoString(row.chapter_created_at),
  updatedAt: toIsoString(row.chapter_updated_at),
  deletedAt: toIsoString(row.chapter_deleted_at ?? null),
  note: row.chapter_note ?? null
});

const mapChapterTranslation = (row: ChapterTranslationRow): ChapterTranslationDto => ({
  id: Number(row.chap_trans_id),
  chapterId: Number(row.chap_trans_chapter_id),
  languageId: Number(row.chap_trans_language_id),
  name: row.chap_trans_name,
  shortIntro: row.chap_trans_short_intro,
  longIntro: row.chap_trans_long_intro,
  prerequisites: row.chap_trans_prerequisites,
  learningObjectives: row.chap_trans_learning_objectives,
  icon: row.chap_trans_icon,
  image: row.chap_trans_image,
  video: row.chap_trans_video_title,
  tags: row.chap_trans_tags,
  author: row.chap_trans_author_name,
  metaTitle: row.chap_trans_meta_title,
  metaDescription: row.chap_trans_meta_description,
  metaKeywords: row.chap_trans_meta_keywords,
  canonicalUrl: row.chap_trans_canonical_url,
  ogSiteName: row.chap_trans_og_site_name,
  ogTitle: row.chap_trans_og_title,
  ogDescription: row.chap_trans_og_description,
  ogType: row.chap_trans_og_type,
  ogImage: row.chap_trans_og_image,
  ogUrl: row.chap_trans_og_url,
  twitterSite: row.chap_trans_twitter_site,
  twitterTitle: row.chap_trans_twitter_title,
  twitterDescription: row.chap_trans_twitter_description,
  twitterImage: row.chap_trans_twitter_image,
  twitterCard: row.chap_trans_twitter_card,
  robotsDirective: row.chap_trans_robots_directive,
  focusKeyword: row.chap_trans_focus_keyword,
  structuredData: row.chap_trans_structured_data,
  isActive: row.chap_trans_is_active,
  isDeleted: row.chap_trans_is_deleted,
  createdAt: toIsoString(row.chap_trans_created_at),
  updatedAt: toIsoString(row.chap_trans_updated_at),
  deletedAt: toIsoString(row.chap_trans_deleted_at),
  chapterSlug: row.chapter_slug,
  subjectId: Number(row.chapter_subject_id)
});

// ─── Chapter CRUD ────────────────────────────────────────────────

export interface ListChaptersResult {
  rows: ChapterDto[];
  meta: PaginationMeta;
}

export const listChapters = async (q: ListChaptersQuery): Promise<ListChaptersResult> => {
  const { rows, totalCount } = await db.callTableFunction<ChapterRow>(
    'udf_get_chapters',
    {
      p_id: null,
      p_chapter_id: null,
      p_subject_id: q.subjectId ?? null,
      p_language_id: null,
      p_is_active: q.isActive ?? null,
      p_sort_table: 'chapter',
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_difficulty_level: q.difficultyLevel ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? null,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapChapter),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getChapterById = async (id: number): Promise<ChapterDto | null> => {
  const { rows } = await db.callTableFunction<ChapterRow>('udf_get_chapters', {
    p_chapter_id: id
  });
  const row = rows[0];
  return row ? mapChapter(row) : null;
};

export interface CreateChapterResult {
  id: number;
  translationId?: number;
}

export const createChapter = async (
  body: CreateChapterBody,
  callerId: number | null
): Promise<CreateChapterResult> => {
  // Step 1: Create base chapter (UDF expects p_estimated_hours, converts internally)
  const result = await db.callFunction('udf_insert_chapters', {
    p_subject_id: body.subjectId,
    p_difficulty_level: body.difficultyLevel ?? null,
    p_estimated_hours: body.estimatedMinutes != null ? body.estimatedMinutes / 60 : null,
    p_display_order: body.displayOrder ?? null,
    p_note: body.note ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });

  const chapterId = Number(result.id);
  let translationId: number | undefined;

  // Step 2: Create embedded translation if provided
  if (body.translation) {
    const transResult = await db.callFunction('udf_insert_chapter_translations', {
      p_chapter_id: chapterId,
      p_language_id: body.translation.languageId,
      p_name: body.translation.name,
      p_short_intro: body.translation.shortIntro ?? null,
      p_long_intro: body.translation.longIntro ?? null,
      p_prerequisites: body.translation.prerequisites ?? null,
      p_learning_objectives: body.translation.learningObjectives ?? null,
      p_icon: body.translation.icon ?? null,
      p_image: body.translation.image ?? null,
      p_video_title: body.translation.video ?? null,
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
      p_author_name: body.translation.author ?? null,
      p_structured_data: body.translation.structuredData ?? null,
      p_actor_id: callerId
    });
    translationId = Number(transResult.id);
  }

  return { id: chapterId, translationId };
};

export const updateChapter = async (
  id: number,
  body: UpdateChapterBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_chapters', {
    p_id: id,
    p_difficulty_level: body.difficultyLevel ?? null,
    p_estimated_hours: body.estimatedMinutes != null ? body.estimatedMinutes / 60 : null,
    p_display_order: body.displayOrder ?? null,
    p_note: body.note ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteChapter = async (id: number): Promise<void> => {
  await db.callFunction('udf_delete_chapters', { p_id: id });
};

export const restoreChapter = async (id: number): Promise<void> => {
  await db.callFunction('udf_restore_chapters', {
    p_id: id,
    p_restore_translations: true
  });
};

// ─── Chapter Translation CRUD ────────────────────────────────────

export interface ListChapterTranslationsResult {
  rows: ChapterTranslationDto[];
  meta: PaginationMeta;
}

export const listChapterTranslations = async (
  chapterId: number,
  q: ListChapterTranslationsQuery
): Promise<ListChapterTranslationsResult> => {
  const { rows, totalCount } = await db.callTableFunction<ChapterTranslationRow>(
    'udf_get_chapters',
    {
      p_id: null,
      p_chapter_id: chapterId,
      p_subject_id: null,
      p_language_id: q.languageId ?? null,
      p_is_active: q.isActive ?? null,
      p_sort_table: 'translation',
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? null,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapChapterTranslation),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getChapterTranslationById = async (
  id: number
): Promise<ChapterTranslationDto | null> => {
  const { rows } = await db.callTableFunction<ChapterTranslationRow>(
    'udf_get_chapters',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapChapterTranslation(row) : null;
};

export const createChapterTranslation = async (
  chapterId: number,
  body: CreateChapterTranslationBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_chapter_translations', {
    p_chapter_id: chapterId,
    p_language_id: body.languageId,
    p_name: body.name,
    p_short_intro: body.shortIntro ?? null,
    p_long_intro: body.longIntro ?? null,
    p_prerequisites: body.prerequisites ?? null,
    p_learning_objectives: body.learningObjectives ?? null,
    p_icon: body.icon ?? null,
    p_image: body.image ?? null,
    p_video_title: body.video ?? null,
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
    p_author_name: body.author ?? null,
    p_structured_data: body.structuredData ?? null,
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateChapterTranslation = async (
  id: number,
  body: UpdateChapterTranslationBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_chapter_translations', {
    p_id: id,
    p_name: body.name ?? null,
    p_short_intro: body.shortIntro ?? null,
    p_long_intro: body.longIntro ?? null,
    p_prerequisites: body.prerequisites ?? null,
    p_learning_objectives: body.learningObjectives ?? null,
    p_icon: body.icon ?? null,
    p_image: body.image ?? null,
    p_video_title: body.video ?? null,
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
    p_author_name: body.author ?? null,
    p_structured_data: body.structuredData ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteChapterTranslation = async (id: number): Promise<void> => {
  await db.callFunction('udf_delete_chapter_translations', { p_id: id });
};

export const restoreChapterTranslation = async (id: number): Promise<void> => {
  await db.callFunction('udf_restore_chapter_translations', { p_id: id });
};
