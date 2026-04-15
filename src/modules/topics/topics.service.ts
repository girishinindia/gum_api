// ═══════════════════════════════════════════════════════════════
// topics.service — UDF wrappers for /api/v1/topics (phase 08).
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';
import { AppError } from '../../core/errors/app-error';
import { resolveIsDeletedFilter } from '../../core/utils/visibility';
import {
  replaceImage,
  ICON_BOX_PX,
  IMAGE_BOX_PX,
  IMAGE_MAX_BYTES
} from '../../integrations/bunny/bunny-image-pipeline';

import type {
  CreateTopicBody,
  ListTopicsQuery,
  UpdateTopicBody,
  CreateTopicTranslationBody,
  ListTopicTranslationsQuery,
  UpdateTopicTranslationBody
} from './topics.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface TopicDto {
  id: number;
  chapterId: number | null;
  slug: string;
  displayOrder: number;
  difficultyLevel: string | null;
  estimatedMinutes: number | null;
  viewCount: number;
  note: string | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

export interface TopicTranslationDto {
  id: number;
  topicId: number;
  languageId: number;
  name: string;
  shortIntro: string | null;
  longIntro: string | null;
  prerequisites: unknown | null;
  learningObjectives: unknown | null;
  icon: string | null;
  image: string | null;
  video: string | null;
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
  author: string | null;
  structuredData: unknown | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  // Parent context
  topicSlug: string;
  topicDifficultyLevel: string | null;
  topicEstimatedMinutes: number | null;
  topicIsActive: boolean;
}

// Row interfaces match udf_get_topics RETURNS TABLE columns
interface TopicRow {
  topic_id: number | string;
  topic_chapter_id: number | string | null;
  topic_slug: string;
  topic_display_order: number;
  topic_difficulty_level: string | null;
  topic_estimated_minutes: number | null;
  topic_view_count: number;
  topic_note: string | null;
  topic_is_active: boolean;
  topic_is_deleted: boolean;
  topic_created_at: Date | string | null;
  topic_updated_at: Date | string | null;
  topic_deleted_at: Date | string | null;
  total_count?: number | string;
}

interface TopicTranslationRow {
  topic_trans_id: number | string;
  topic_trans_topic_id: number | string;
  topic_trans_language_id: number | string;
  topic_trans_name: string;
  topic_trans_short_intro: string | null;
  topic_trans_long_intro: string | null;
  topic_trans_prerequisites: unknown | null;
  topic_trans_learning_objectives: unknown | null;
  topic_trans_icon: string | null;
  topic_trans_image: string | null;
  topic_trans_video_title: string | null;
  topic_trans_video_description: string | null;
  topic_trans_video_thumbnail: string | null;
  topic_trans_video_duration_minutes: number | null;
  topic_trans_tags: unknown | null;
  topic_trans_meta_title: string | null;
  topic_trans_meta_description: string | null;
  topic_trans_meta_keywords: string | null;
  topic_trans_canonical_url: string | null;
  topic_trans_og_site_name: string | null;
  topic_trans_og_title: string | null;
  topic_trans_og_description: string | null;
  topic_trans_og_type: string | null;
  topic_trans_og_image: string | null;
  topic_trans_og_url: string | null;
  topic_trans_twitter_site: string | null;
  topic_trans_twitter_title: string | null;
  topic_trans_twitter_description: string | null;
  topic_trans_twitter_image: string | null;
  topic_trans_twitter_card: string | null;
  topic_trans_robots_directive: string | null;
  topic_trans_focus_keyword: string | null;
  topic_trans_author_name: string | null;
  topic_trans_author_bio: string | null;
  topic_trans_structured_data: unknown | null;
  topic_trans_is_active: boolean;
  topic_trans_is_deleted: boolean;
  topic_trans_created_at: Date | string | null;
  topic_trans_updated_at: Date | string | null;
  topic_trans_deleted_at: Date | string | null;
  topic_slug: string;
  topic_difficulty_level: string | null;
  topic_estimated_minutes: number | null;
  topic_is_active: boolean;
  total_count?: number | string;
}

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapTopic = (row: TopicRow): TopicDto => ({
  id: Number(row.topic_id),
  chapterId: row.topic_chapter_id ? Number(row.topic_chapter_id) : null,
  slug: row.topic_slug,
  displayOrder: row.topic_display_order,
  difficultyLevel: row.topic_difficulty_level,
  estimatedMinutes: row.topic_estimated_minutes,
  viewCount: row.topic_view_count,
  note: row.topic_note,
  isActive: row.topic_is_active,
  isDeleted: row.topic_is_deleted ?? false,
  createdAt: toIsoString(row.topic_created_at),
  updatedAt: toIsoString(row.topic_updated_at),
  deletedAt: toIsoString(row.topic_deleted_at ?? null)
});

const mapTopicTranslation = (row: TopicTranslationRow): TopicTranslationDto => ({
  id: Number(row.topic_trans_id),
  topicId: Number(row.topic_trans_topic_id),
  languageId: Number(row.topic_trans_language_id),
  name: row.topic_trans_name,
  shortIntro: row.topic_trans_short_intro,
  longIntro: row.topic_trans_long_intro,
  prerequisites: row.topic_trans_prerequisites,
  learningObjectives: row.topic_trans_learning_objectives,
  icon: row.topic_trans_icon,
  image: row.topic_trans_image,
  video: row.topic_trans_video_title,
  tags: row.topic_trans_tags,
  metaTitle: row.topic_trans_meta_title,
  metaDescription: row.topic_trans_meta_description,
  metaKeywords: row.topic_trans_meta_keywords,
  canonicalUrl: row.topic_trans_canonical_url,
  ogSiteName: row.topic_trans_og_site_name,
  ogTitle: row.topic_trans_og_title,
  ogDescription: row.topic_trans_og_description,
  ogType: row.topic_trans_og_type,
  ogImage: row.topic_trans_og_image,
  ogUrl: row.topic_trans_og_url,
  twitterSite: row.topic_trans_twitter_site,
  twitterTitle: row.topic_trans_twitter_title,
  twitterDescription: row.topic_trans_twitter_description,
  twitterImage: row.topic_trans_twitter_image,
  twitterCard: row.topic_trans_twitter_card,
  robotsDirective: row.topic_trans_robots_directive,
  focusKeyword: row.topic_trans_focus_keyword,
  author: row.topic_trans_author_name,
  structuredData: row.topic_trans_structured_data,
  isActive: row.topic_trans_is_active,
  isDeleted: row.topic_trans_is_deleted,
  createdAt: toIsoString(row.topic_trans_created_at),
  updatedAt: toIsoString(row.topic_trans_updated_at),
  deletedAt: toIsoString(row.topic_trans_deleted_at),
  topicSlug: row.topic_slug,
  topicDifficultyLevel: row.topic_difficulty_level,
  topicEstimatedMinutes: row.topic_estimated_minutes,
  topicIsActive: row.topic_is_active
});

// ─── Topic CRUD ───────────────────────────────────────────────────

export interface ListTopicsResult {
  rows: TopicDto[];
  meta: PaginationMeta;
}

// Whitelisted sort-column → uv_topics column. Mirrors TOPIC_SORT_COLUMNS in
// topics.schemas.ts; values come from a zod enum so this map is exhaustive.
const TOPIC_LIST_SORT_MAP: Record<string, string> = {
  id: 'topic_id',
  slug: 'topic_slug',
  display_order: 'topic_display_order',
  difficulty_level: 'topic_difficulty_level',
  estimated_minutes: 'topic_estimated_minutes',
  view_count: 'topic_view_count',
  is_active: 'topic_is_active',
  is_deleted: 'topic_is_deleted',
  created_at: 'topic_created_at',
  updated_at: 'topic_updated_at'
};

/**
 * List topics at the parent level — queries `uv_topics` directly so topics
 * without any translation row are still visible. The translation sub-resource
 * (`/topics/:id/translations`) keeps using `udf_get_topics` which INNER JOINs
 * translations.
 *
 * Mirrors the chapters/subjects/sub-topics pattern documented in the
 * "Phase-08 parent CRUD bypasses translation INNER JOIN" memory.
 */
export const listTopics = async (q: ListTopicsQuery): Promise<ListTopicsResult> => {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  const next = (v: unknown) => { params.push(v); return `$${i++}`; };

  if (q.chapterId != null) conditions.push(`topic_chapter_id = ${next(q.chapterId)}`);
  if (q.isActive != null) conditions.push(`topic_is_active = ${next(q.isActive)}`);
  // Tri-state isDeleted (see resolveIsDeletedFilter): super_admin's default
  // becomes "show all" via the gateSoftDeleteFilters middleware injecting
  // 'all'; non-super-admin callers can never reach here with the param set.
  const { filterIsDeleted, hideDeleted } = resolveIsDeletedFilter(q.isDeleted);
  if (filterIsDeleted !== null) {
    conditions.push(`topic_is_deleted = ${next(filterIsDeleted)}`);
  } else if (hideDeleted) {
    conditions.push(`topic_is_deleted = FALSE`);
  }
  if (q.searchTerm && q.searchTerm.trim() !== '') {
    const term = `%${q.searchTerm.trim()}%`;
    conditions.push(
      `(topic_slug::TEXT ILIKE ${next(term)} OR chapter_slug::TEXT ILIKE $${i - 1} OR subject_code::TEXT ILIKE $${i - 1} OR subject_slug::TEXT ILIKE $${i - 1})`
    );
  }

  const sortCol = TOPIC_LIST_SORT_MAP[q.sortColumn] ?? 'topic_display_order';
  const sortDir = q.sortDirection === 'DESC' ? 'DESC' : 'ASC';
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = q.pageSize;
  const offset = (Math.max(q.pageIndex, 1) - 1) * q.pageSize;

  const sql = `
    SELECT *, COUNT(*) OVER()::INT AS total_count
    FROM uv_topics
    ${where}
    ORDER BY ${sortCol} ${sortDir}
    LIMIT ${next(limit)} OFFSET ${next(offset)}
  `;

  const result = await db.query<TopicRow & { total_count?: number | string }>(sql, params);
  const totalCount = result.rows[0]?.total_count != null ? Number(result.rows[0].total_count) : 0;

  return {
    rows: result.rows.map(mapTopic),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

/**
 * Fetch a topic by id from `uv_topics` directly. Bypasses `udf_get_topics`
 * which INNER JOINs translations and would return null for a freshly-created
 * topic that has no translation row yet.
 */
export const getTopicById = async (id: number): Promise<TopicDto | null> => {
  const result = await db.query<TopicRow>(
    'SELECT * FROM uv_topics WHERE topic_id = $1 LIMIT 1',
    [id]
  );
  const row = result.rows[0];
  return row ? mapTopic(row) : null;
};

export interface CreateTopicResult {
  id: number;
  translationId?: number;
}

export const createTopic = async (
  body: CreateTopicBody,
  callerId: number | null
): Promise<CreateTopicResult> => {
  // Step 1: Create base topic
  const result = await db.callFunction('udf_insert_topics', {
    p_chapter_id: body.chapterId ?? null,
    p_slug: body.slug ?? null,
    p_difficulty_level: body.difficultyLevel ?? null,
    p_estimated_minutes: body.estimatedMinutes ?? null,
    p_display_order: body.displayOrder ?? null,
    p_note: body.note ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });

  const topicId = Number(result.id);
  let translationId: number | undefined;

  // Step 2: Create embedded translation if provided
  if (body.translation) {
    const transResult = await db.callFunction('udf_insert_topic_translations', {
      p_topic_id: topicId,
      p_language_id: body.translation.languageId,
      p_name: body.translation.name,
      p_short_intro: body.translation.shortIntro ?? null,
      p_long_intro: body.translation.longIntro ?? null,
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

  return { id: topicId, translationId };
};

export const updateTopic = async (
  id: number,
  body: UpdateTopicBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_topics', {
    p_id: id,
    p_slug: body.slug ?? null,
    p_difficulty_level: body.difficultyLevel ?? null,
    p_estimated_minutes: body.estimatedMinutes ?? null,
    p_display_order: body.displayOrder ?? null,
    p_note: body.note ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteTopic = async (id: number): Promise<void> => {
  await db.callFunction('udf_delete_topics', { p_id: id });
};

export const restoreTopic = async (id: number): Promise<void> => {
  await db.callFunction('udf_restore_topics', {
    p_id: id,
    p_restore_translations: true
  });
};

// ─── Topic Translation CRUD ──────────────────────────────────────

export interface ListTopicTranslationsResult {
  rows: TopicTranslationDto[];
  meta: PaginationMeta;
}

export const listTopicTranslations = async (
  topicId: number,
  q: ListTopicTranslationsQuery
): Promise<ListTopicTranslationsResult> => {
  const { rows, totalCount } = await db.callTableFunction<TopicTranslationRow>(
    'udf_get_topics',
    {
      p_id: null,
      p_topic_id: topicId,
      p_chapter_id: null,
      p_language_id: q.languageId ?? null,
      p_is_active: q.isActive ?? null,
      p_sort_table: 'translation',
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_is_active: q.isActive ?? null,
      // 'all' → NULL; true/false → as-is. See chapters.service for context.
      p_filter_is_deleted: q.isDeleted === 'all' ? null : (q.isDeleted ?? null),
      // See chapters.service for the rationale on why we send null instead
      // of true for the default-hide case.
      p_hide_deleted: q.isDeleted === 'all' ? false : null,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapTopicTranslation),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getTopicTranslationById = async (
  id: number
): Promise<TopicTranslationDto | null> => {
  const { rows } = await db.callTableFunction<TopicTranslationRow>('udf_get_topics', {
    p_id: id
  });
  const row = rows[0];
  return row ? mapTopicTranslation(row) : null;
};

export const createTopicTranslation = async (
  topicId: number,
  body: CreateTopicTranslationBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_topic_translations', {
    p_topic_id: topicId,
    p_language_id: body.languageId,
    p_name: body.name,
    p_short_intro: body.shortIntro ?? null,
    p_long_intro: body.longIntro ?? null,
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

export const updateTopicTranslation = async (
  id: number,
  body: UpdateTopicTranslationBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_topic_translations', {
    p_id: id,
    p_name: body.name ?? null,
    p_short_intro: body.shortIntro ?? null,
    p_long_intro: body.longIntro ?? null,
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

export const deleteTopicTranslation = async (id: number): Promise<void> => {
  await db.callFunction('udf_delete_topic_translations', { p_id: id });
};

export const restoreTopicTranslation = async (id: number): Promise<void> => {
  await db.callFunction('udf_restore_topic_translations', { p_id: id });
};

// ─── Translation image upload pipeline (4 slots) ─────────────────

export type TopicTranslationImageSlot = 'icon' | 'image' | 'ogImage' | 'twitterImage';
export type TopicTranslationImageFiles = Partial<
  Record<TopicTranslationImageSlot, Express.Multer.File>
>;

const TOPIC_TRANSLATION_SLOT_CONFIG: Record<
  TopicTranslationImageSlot,
  { pathSegment: string; boxPx: number }
> = {
  icon: { pathSegment: 'icon', boxPx: ICON_BOX_PX },
  image: { pathSegment: 'image', boxPx: IMAGE_BOX_PX },
  ogImage: { pathSegment: 'og-image', boxPx: IMAGE_BOX_PX },
  twitterImage: { pathSegment: 'twitter-image', boxPx: IMAGE_BOX_PX }
};

const setTopicTranslationImageUrl = async (
  id: number,
  slot: TopicTranslationImageSlot,
  url: string | null,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_topic_translations', {
    p_id: id,
    p_name: null,
    p_short_intro: null,
    p_long_intro: null,
    p_icon: slot === 'icon' ? url : null,
    p_image: slot === 'image' ? url : null,
    p_video_title: null,
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
    p_author_name: null,
    p_structured_data: null,
    p_is_active: null,
    p_actor_id: callerId
  });
};

export const processTopicTranslationImageUploads = async (
  translationId: number,
  files: TopicTranslationImageFiles,
  callerId: number | null
): Promise<void> => {
  const existing = await getTopicTranslationById(translationId);
  if (!existing) {
    throw AppError.notFound(`Topic translation ${translationId} not found`);
  }

  const currentUrls: Record<TopicTranslationImageSlot, string | null> = {
    icon: existing.icon,
    image: existing.image,
    ogImage: existing.ogImage,
    twitterImage: existing.twitterImage
  };

  const slots: TopicTranslationImageSlot[] = ['icon', 'image', 'ogImage', 'twitterImage'];
  for (const slot of slots) {
    const file = files[slot];
    if (!file) continue;
    const cfg = TOPIC_TRANSLATION_SLOT_CONFIG[slot];
    const result = await replaceImage({
      inputBuffer: file.buffer,
      targetPath: `topics/translations/${translationId}/${cfg.pathSegment}.webp`,
      currentUrl: currentUrls[slot],
      boxPx: cfg.boxPx,
      maxBytes: IMAGE_MAX_BYTES,
      logContext: { topicTranslationId: translationId, slot }
    });
    if (!result) {
      throw AppError.badRequest(
        `Topic translation ${slot} is too complex to compress under ${Math.round(IMAGE_MAX_BYTES / 1024)} KB. Try a simpler image.`,
        { slot, maxBytes: IMAGE_MAX_BYTES }
      );
    }
    await setTopicTranslationImageUrl(translationId, slot, result.cdnUrl, callerId);
  }
};
