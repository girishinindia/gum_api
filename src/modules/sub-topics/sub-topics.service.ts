// ═══════════════════════════════════════════════════════════════
// sub-topics.service — UDF wrappers for /api/v1/sub-topics
//
// Phase 08 sub-topics with translations. Supports difficulty_level
// enum, estimated_minutes, topic_id (NOT NULL), and page_url unique
// field on translations.
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
  CreateSubTopicBody,
  ListSubTopicsQuery,
  UpdateSubTopicBody,
  CreateSubTopicTranslationBody,
  ListSubTopicTranslationsQuery,
  UpdateSubTopicTranslationBody
} from './sub-topics.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface SubTopicDto {
  id: number;
  topicId: number;
  slug: string | null;
  displayOrder: number | null;
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

export interface SubTopicTranslationDto {
  id: number;
  subTopicId: number;
  languageId: number;
  name: string;
  shortIntro: string | null;
  longIntro: string | null;
  icon: string | null;
  image: string | null;
  video: string | null;
  tags: unknown | null;
  pageUrl: string | null;
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
  subTopicSlug: string | null;
  topicId: number;
}

// Row interfaces match udf_get_sub_topics RETURNS TABLE columns
interface SubTopicRow {
  sub_topic_id: number | string;
  sub_topic_topic_id: number | string;
  sub_topic_slug: string | null;
  sub_topic_display_order: number | null;
  sub_topic_difficulty_level: string | null;
  sub_topic_estimated_minutes: number | null;
  sub_topic_view_count: number;
  sub_topic_is_active: boolean;
  sub_topic_is_deleted: boolean;
  sub_topic_created_at: Date | string | null;
  sub_topic_updated_at: Date | string | null;
  sub_topic_deleted_at: Date | string | null;
  sub_topic_note: string | null;
  total_count?: number | string;
}

interface SubTopicTranslationRow {
  sub_topic_trans_id: number | string;
  sub_topic_trans_sub_topic_id: number | string;
  sub_topic_trans_language_id: number | string;
  sub_topic_trans_name: string;
  sub_topic_trans_short_intro: string | null;
  sub_topic_trans_long_intro: string | null;
  sub_topic_trans_icon: string | null;
  sub_topic_trans_image: string | null;
  sub_topic_trans_video_title: string | null;
  sub_topic_trans_video_description: string | null;
  sub_topic_trans_video_thumbnail: string | null;
  sub_topic_trans_video_duration_minutes: number | null;
  sub_topic_trans_tags: unknown | null;
  sub_topic_trans_page_url: string | null;
  sub_topic_trans_meta_title: string | null;
  sub_topic_trans_meta_description: string | null;
  sub_topic_trans_meta_keywords: string | null;
  sub_topic_trans_canonical_url: string | null;
  sub_topic_trans_og_site_name: string | null;
  sub_topic_trans_og_title: string | null;
  sub_topic_trans_og_description: string | null;
  sub_topic_trans_og_type: string | null;
  sub_topic_trans_og_image: string | null;
  sub_topic_trans_og_url: string | null;
  sub_topic_trans_twitter_site: string | null;
  sub_topic_trans_twitter_title: string | null;
  sub_topic_trans_twitter_description: string | null;
  sub_topic_trans_twitter_image: string | null;
  sub_topic_trans_twitter_card: string | null;
  sub_topic_trans_robots_directive: string | null;
  sub_topic_trans_focus_keyword: string | null;
  sub_topic_trans_author_name: string | null;
  sub_topic_trans_author_bio: string | null;
  sub_topic_trans_structured_data: unknown | null;
  sub_topic_trans_is_active: boolean;
  sub_topic_trans_is_deleted: boolean;
  sub_topic_trans_created_at: Date | string | null;
  sub_topic_trans_updated_at: Date | string | null;
  sub_topic_trans_deleted_at: Date | string | null;
  sub_topic_slug: string | null;
  sub_topic_topic_id: number | string;
  total_count?: number | string;
}

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapSubTopic = (row: SubTopicRow): SubTopicDto => ({
  id: Number(row.sub_topic_id),
  topicId: Number(row.sub_topic_topic_id),
  slug: row.sub_topic_slug,
  displayOrder: row.sub_topic_display_order,
  difficultyLevel: row.sub_topic_difficulty_level,
  estimatedMinutes: row.sub_topic_estimated_minutes,
  viewCount: Number(row.sub_topic_view_count),
  note: row.sub_topic_note ?? null,
  isActive: row.sub_topic_is_active,
  isDeleted: row.sub_topic_is_deleted ?? false,
  createdAt: toIsoString(row.sub_topic_created_at),
  updatedAt: toIsoString(row.sub_topic_updated_at),
  deletedAt: toIsoString(row.sub_topic_deleted_at ?? null)
});

const mapSubTopicTranslation = (row: SubTopicTranslationRow): SubTopicTranslationDto => ({
  id: Number(row.sub_topic_trans_id),
  subTopicId: Number(row.sub_topic_trans_sub_topic_id),
  languageId: Number(row.sub_topic_trans_language_id),
  name: row.sub_topic_trans_name,
  shortIntro: row.sub_topic_trans_short_intro,
  longIntro: row.sub_topic_trans_long_intro,
  icon: row.sub_topic_trans_icon,
  image: row.sub_topic_trans_image,
  video: row.sub_topic_trans_video_title,
  tags: row.sub_topic_trans_tags,
  pageUrl: row.sub_topic_trans_page_url,
  author: row.sub_topic_trans_author_name,
  metaTitle: row.sub_topic_trans_meta_title,
  metaDescription: row.sub_topic_trans_meta_description,
  metaKeywords: row.sub_topic_trans_meta_keywords,
  canonicalUrl: row.sub_topic_trans_canonical_url,
  ogSiteName: row.sub_topic_trans_og_site_name,
  ogTitle: row.sub_topic_trans_og_title,
  ogDescription: row.sub_topic_trans_og_description,
  ogType: row.sub_topic_trans_og_type,
  ogImage: row.sub_topic_trans_og_image,
  ogUrl: row.sub_topic_trans_og_url,
  twitterSite: row.sub_topic_trans_twitter_site,
  twitterTitle: row.sub_topic_trans_twitter_title,
  twitterDescription: row.sub_topic_trans_twitter_description,
  twitterImage: row.sub_topic_trans_twitter_image,
  twitterCard: row.sub_topic_trans_twitter_card,
  robotsDirective: row.sub_topic_trans_robots_directive,
  focusKeyword: row.sub_topic_trans_focus_keyword,
  structuredData: row.sub_topic_trans_structured_data,
  isActive: row.sub_topic_trans_is_active,
  isDeleted: row.sub_topic_trans_is_deleted,
  createdAt: toIsoString(row.sub_topic_trans_created_at),
  updatedAt: toIsoString(row.sub_topic_trans_updated_at),
  deletedAt: toIsoString(row.sub_topic_trans_deleted_at),
  subTopicSlug: row.sub_topic_slug,
  topicId: Number(row.sub_topic_topic_id)
});

// ─── Sub-topic CRUD ──────────────────────────────────────────────

export interface ListSubTopicsResult {
  rows: SubTopicDto[];
  meta: PaginationMeta;
}

// Whitelisted sort-column → uv_sub_topics column. Mirrors SUB_TOPIC_SORT_COLUMNS in
// sub-topics.schemas.ts; values come from a zod enum so this map is exhaustive.
const SUB_TOPIC_LIST_SORT_MAP: Record<string, string> = {
  id: 'sub_topic_id',
  slug: 'sub_topic_slug',
  display_order: 'sub_topic_display_order',
  difficulty_level: 'sub_topic_difficulty_level',
  estimated_minutes: 'sub_topic_estimated_minutes',
  is_active: 'sub_topic_is_active',
  is_deleted: 'sub_topic_is_deleted',
  created_at: 'sub_topic_created_at',
  updated_at: 'sub_topic_updated_at'
};

/**
 * List sub-topics at the parent level — queries `uv_sub_topics` directly so
 * sub-topics without any translation row are still visible. The translation
 * sub-resource (`/sub-topics/:id/translations`) keeps using `udf_get_sub_topics`
 * which INNER JOINs translations.
 */
export const listSubTopics = async (
  q: ListSubTopicsQuery
): Promise<ListSubTopicsResult> => {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  const next = (v: unknown) => { params.push(v); return `$${i++}`; };

  if (q.topicId != null) conditions.push(`sub_topic_topic_id = ${next(q.topicId)}`);
  if (q.isActive != null) conditions.push(`sub_topic_is_active = ${next(q.isActive)}`);
  // Tri-state isDeleted filter (see resolveIsDeletedFilter docs in chapters.service).
  const { filterIsDeleted, hideDeleted } = resolveIsDeletedFilter(q.isDeleted);
  if (filterIsDeleted !== null) {
    conditions.push(`sub_topic_is_deleted = ${next(filterIsDeleted)}`);
  } else if (hideDeleted) {
    conditions.push(`sub_topic_is_deleted = FALSE`);
  }
  if (q.searchTerm && q.searchTerm.trim() !== '') {
    const term = `%${q.searchTerm.trim()}%`;
    conditions.push(`sub_topic_slug::TEXT ILIKE ${next(term)}`);
  }

  const sortCol = SUB_TOPIC_LIST_SORT_MAP[q.sortColumn] ?? 'sub_topic_display_order';
  const sortDir = q.sortDirection === 'DESC' ? 'DESC' : 'ASC';
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = q.pageSize;
  const offset = (Math.max(q.pageIndex, 1) - 1) * q.pageSize;

  const sql = `
    SELECT *, COUNT(*) OVER()::INT AS total_count
    FROM uv_sub_topics
    ${where}
    ORDER BY ${sortCol} ${sortDir}
    LIMIT ${next(limit)} OFFSET ${next(offset)}
  `;

  const result = await db.query<SubTopicRow & { total_count?: number | string }>(sql, params);
  const totalCount = result.rows[0]?.total_count != null ? Number(result.rows[0].total_count) : 0;

  return {
    rows: result.rows.map(mapSubTopic),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

/**
 * Fetch a sub-topic by id from `uv_sub_topics` directly. Bypasses
 * `udf_get_sub_topics` which INNER JOINs translations and would return
 * null for a freshly-created sub-topic that has no translation yet.
 */
export const getSubTopicById = async (id: number): Promise<SubTopicDto | null> => {
  const result = await db.query<SubTopicRow>(
    'SELECT * FROM uv_sub_topics WHERE sub_topic_id = $1 LIMIT 1',
    [id]
  );
  const row = result.rows[0];
  return row ? mapSubTopic(row) : null;
};

export interface CreateSubTopicResult {
  id: number;
  translationId?: number;
}

export const createSubTopic = async (
  body: CreateSubTopicBody,
  callerId: number | null
): Promise<CreateSubTopicResult> => {
  // Step 1: Create base sub-topic
  const result = await db.callFunction('udf_insert_sub_topics', {
    p_topic_id: body.topicId,
    p_slug: body.slug ?? null,
    p_difficulty_level: body.difficultyLevel ?? null,
    p_estimated_minutes: body.estimatedMinutes ?? null,
    p_display_order: body.displayOrder ?? null,
    p_note: body.note ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });

  const subTopicId = Number(result.id);
  let translationId: number | undefined;

  // Step 2: Create embedded translation if provided
  if (body.translation) {
    const transResult = await db.callFunction('udf_insert_sub_topic_translations', {
      p_sub_topic_id: subTopicId,
      p_language_id: body.translation.languageId,
      p_name: body.translation.name,
      p_short_intro: body.translation.shortIntro ?? null,
      p_long_intro: body.translation.longIntro ?? null,
      p_icon: body.translation.icon ?? null,
      p_image: body.translation.image ?? null,
      p_video_title: body.translation.video ?? null,
      p_tags: body.translation.tags ?? null,
      p_page_url: body.translation.pageUrl ?? null,
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

  return { id: subTopicId, translationId };
};

export const updateSubTopic = async (
  id: number,
  body: UpdateSubTopicBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_sub_topics', {
    p_id: id,
    p_topic_id: body.topicId ?? null,
    p_slug: body.slug ?? null,
    p_display_order: body.displayOrder ?? null,
    p_difficulty_level: body.difficultyLevel ?? null,
    p_estimated_minutes: body.estimatedMinutes ?? null,
    p_note: body.note ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteSubTopic = async (id: number): Promise<void> => {
  await db.callFunction('udf_delete_sub_topics', { p_id: id });
};

export const restoreSubTopic = async (id: number): Promise<void> => {
  await db.callFunction('udf_restore_sub_topics', {
    p_id: id,
    p_restore_translations: true
  });
};

// ─── Sub-topic Translation CRUD ──────────────────────────────────

export interface ListSubTopicTranslationsResult {
  rows: SubTopicTranslationDto[];
  meta: PaginationMeta;
}

export const listSubTopicTranslations = async (
  subTopicId: number,
  q: ListSubTopicTranslationsQuery
): Promise<ListSubTopicTranslationsResult> => {
  const { rows, totalCount } = await db.callTableFunction<SubTopicTranslationRow>(
    'udf_get_sub_topics',
    {
      p_id: null,
      p_sub_topic_id: subTopicId,
      p_language_id: q.languageId ?? null,
      p_is_active: q.isActive ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted === 'all' ? null : (q.isDeleted ?? null),
      // See chapters.service for the rationale.
      p_hide_deleted: q.isDeleted === 'all' ? false : null,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapSubTopicTranslation),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getSubTopicTranslationById = async (
  id: number
): Promise<SubTopicTranslationDto | null> => {
  const { rows } = await db.callTableFunction<SubTopicTranslationRow>(
    'udf_get_sub_topics',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapSubTopicTranslation(row) : null;
};

export const createSubTopicTranslation = async (
  subTopicId: number,
  body: CreateSubTopicTranslationBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_sub_topic_translations', {
    p_sub_topic_id: subTopicId,
    p_language_id: body.languageId,
    p_name: body.name,
    p_short_intro: body.shortIntro ?? null,
    p_long_intro: body.longIntro ?? null,
    p_icon: body.icon ?? null,
    p_image: body.image ?? null,
    p_video_title: body.video ?? null,
    p_tags: body.tags ?? null,
    p_page_url: body.pageUrl ?? null,
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

export const updateSubTopicTranslation = async (
  id: number,
  body: UpdateSubTopicTranslationBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_sub_topic_translations', {
    p_id: id,
    p_name: body.name ?? null,
    p_short_intro: body.shortIntro ?? null,
    p_long_intro: body.longIntro ?? null,
    p_icon: body.icon ?? null,
    p_image: body.image ?? null,
    p_video_title: body.video ?? null,
    p_tags: body.tags ?? null,
    p_page_url: body.pageUrl ?? null,
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

export const deleteSubTopicTranslation = async (id: number): Promise<void> => {
  await db.callFunction('udf_delete_sub_topic_translations', { p_id: id });
};

export const restoreSubTopicTranslation = async (id: number): Promise<void> => {
  await db.callFunction('udf_restore_sub_topic_translations', { p_id: id });
};

// ─── Translation image upload pipeline (4 slots) ─────────────────

export type SubTopicTranslationImageSlot = 'icon' | 'image' | 'ogImage' | 'twitterImage';
export type SubTopicTranslationImageFiles = Partial<
  Record<SubTopicTranslationImageSlot, Express.Multer.File>
>;

const SUB_TOPIC_TRANSLATION_SLOT_CONFIG: Record<
  SubTopicTranslationImageSlot,
  { pathSegment: string; boxPx: number }
> = {
  icon: { pathSegment: 'icon', boxPx: ICON_BOX_PX },
  image: { pathSegment: 'image', boxPx: IMAGE_BOX_PX },
  ogImage: { pathSegment: 'og-image', boxPx: IMAGE_BOX_PX },
  twitterImage: { pathSegment: 'twitter-image', boxPx: IMAGE_BOX_PX }
};

const setSubTopicTranslationImageUrl = async (
  id: number,
  slot: SubTopicTranslationImageSlot,
  url: string | null,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_sub_topic_translations', {
    p_id: id,
    p_name: null,
    p_short_intro: null,
    p_long_intro: null,
    p_icon: slot === 'icon' ? url : null,
    p_image: slot === 'image' ? url : null,
    p_video_title: null,
    p_tags: null,
    p_page_url: null,
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

export const processSubTopicTranslationImageUploads = async (
  translationId: number,
  files: SubTopicTranslationImageFiles,
  callerId: number | null
): Promise<void> => {
  const existing = await getSubTopicTranslationById(translationId);
  if (!existing) {
    throw AppError.notFound(`Sub-topic translation ${translationId} not found`);
  }

  const currentUrls: Record<SubTopicTranslationImageSlot, string | null> = {
    icon: existing.icon,
    image: existing.image,
    ogImage: existing.ogImage,
    twitterImage: existing.twitterImage
  };

  const slots: SubTopicTranslationImageSlot[] = ['icon', 'image', 'ogImage', 'twitterImage'];
  for (const slot of slots) {
    const file = files[slot];
    if (!file) continue;
    const cfg = SUB_TOPIC_TRANSLATION_SLOT_CONFIG[slot];
    const result = await replaceImage({
      inputBuffer: file.buffer,
      targetPath: `sub-topics/translations/${translationId}/${cfg.pathSegment}.webp`,
      currentUrl: currentUrls[slot],
      boxPx: cfg.boxPx,
      maxBytes: IMAGE_MAX_BYTES,
      logContext: { subTopicTranslationId: translationId, slot }
    });
    if (!result) {
      throw AppError.badRequest(
        `Sub-topic translation ${slot} is too complex to compress under ${Math.round(IMAGE_MAX_BYTES / 1024)} KB. Try a simpler image.`,
        { slot, maxBytes: IMAGE_MAX_BYTES }
      );
    }
    await setSubTopicTranslationImageUrl(translationId, slot, result.cdnUrl, callerId);
  }
};
