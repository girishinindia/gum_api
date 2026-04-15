// ═══════════════════════════════════════════════════════════════
// subjects.service — UDF wrappers for /api/v1/subjects
//
// Provides CRUD operations for subjects and subject translations
// using the uv_subject_translations view and UDFs.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';
import { AppError } from '../../core/errors/app-error';
import {
  replaceImage,
  ICON_BOX_PX,
  IMAGE_BOX_PX,
  IMAGE_MAX_BYTES
} from '../../integrations/bunny/bunny-image-pipeline';

import type {
  CreateSubjectBody,
  ListSubjectsQuery,
  UpdateSubjectBody,
  CreateSubjectTranslationBody,
  ListSubjectTranslationsQuery,
  UpdateSubjectTranslationBody
} from './subjects.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface SubjectDto {
  id: number;
  code: string;
  slug: string;
  difficultyLevel: string | null;
  estimatedHours: number | null;
  viewCount: number;
  displayOrder: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}

export interface SubjectTranslationDto {
  id: number;
  subjectId: number;
  languageId: number;
  name: string;
  shortIntro: string | null;
  longIntro: string | null;
  icon: string | null;
  image: string | null;
  videoTitle: string | null;
  videoDescription: string | null;
  videoThumbnail: string | null;
  videoDurationMinutes: number | null;
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
  authorName: string | null;
  authorBio: string | null;
  searchVector: unknown | null;
  structuredData: unknown | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  // Parent context
  subjectCode: string;
  subjectSlug: string;
  subjectDifficultyLevel: string | null;
  subjectEstimatedHours: number | null;
  subjectViewCount: number;
  subjectDisplayOrder: number;
  subjectIsActive: boolean;
}

interface SubjectRow {
  subject_id: number | string;
  subject_code: string;
  subject_slug: string;
  subject_difficulty_level: string | null;
  subject_estimated_hours: number | null;
  subject_view_count: number | string;
  subject_display_order: number;
  subject_created_by: number | string | null;
  subject_updated_by: number | string | null;
  subject_is_active: boolean;
  subject_is_deleted: boolean;
  subject_created_at: Date | string | null;
  subject_updated_at: Date | string | null;
  subject_deleted_at: Date | string | null;
  total_count?: number | string;
}

interface SubjectTranslationRow {
  subj_trans_id: number | string;
  subj_trans_subject_id: number | string;
  subj_trans_language_id: number | string;
  subj_trans_name: string;
  subj_trans_short_intro: string | null;
  subj_trans_long_intro: string | null;
  subj_trans_icon: string | null;
  subj_trans_image: string | null;
  subj_trans_video_title: string | null;
  subj_trans_video_description: string | null;
  subj_trans_video_thumbnail: string | null;
  subj_trans_video_duration_minutes: number | null;
  subj_trans_tags: unknown | null;
  subj_trans_meta_title: string | null;
  subj_trans_meta_description: string | null;
  subj_trans_meta_keywords: string | null;
  subj_trans_canonical_url: string | null;
  subj_trans_og_site_name: string | null;
  subj_trans_og_title: string | null;
  subj_trans_og_description: string | null;
  subj_trans_og_type: string | null;
  subj_trans_og_image: string | null;
  subj_trans_og_url: string | null;
  subj_trans_twitter_site: string | null;
  subj_trans_twitter_title: string | null;
  subj_trans_twitter_description: string | null;
  subj_trans_twitter_image: string | null;
  subj_trans_twitter_card: string | null;
  subj_trans_robots_directive: string | null;
  subj_trans_focus_keyword: string | null;
  subj_trans_author_name: string | null;
  subj_trans_author_bio: string | null;
  subj_trans_search_vector: unknown | null;
  subj_trans_created_by: number | string | null;
  subj_trans_updated_by: number | string | null;
  subj_trans_is_active: boolean;
  subj_trans_is_deleted: boolean;
  subj_trans_created_at: Date | string | null;
  subj_trans_updated_at: Date | string | null;
  subj_trans_deleted_at: Date | string | null;
  subj_trans_structured_data: unknown | null;
  subject_code: string;
  subject_slug: string;
  subject_difficulty_level: string | null;
  subject_estimated_hours: number | null;
  subject_view_count: number | string;
  subject_display_order: number;
  subject_is_active: boolean;
  total_count?: number | string;
}

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapSubject = (row: SubjectRow): SubjectDto => ({
  id: Number(row.subject_id),
  code: row.subject_code,
  slug: row.subject_slug,
  difficultyLevel: row.subject_difficulty_level,
  estimatedHours: row.subject_estimated_hours ? Number(row.subject_estimated_hours) : null,
  viewCount: Number(row.subject_view_count),
  displayOrder: row.subject_display_order,
  isActive: row.subject_is_active,
  isDeleted: row.subject_is_deleted,
  createdAt: toIsoString(row.subject_created_at),
  updatedAt: toIsoString(row.subject_updated_at),
  deletedAt: toIsoString(row.subject_deleted_at)
});

const mapSubjectTranslation = (row: SubjectTranslationRow): SubjectTranslationDto => ({
  id: Number(row.subj_trans_id),
  subjectId: Number(row.subj_trans_subject_id),
  languageId: Number(row.subj_trans_language_id),
  name: row.subj_trans_name,
  shortIntro: row.subj_trans_short_intro,
  longIntro: row.subj_trans_long_intro,
  icon: row.subj_trans_icon,
  image: row.subj_trans_image,
  videoTitle: row.subj_trans_video_title,
  videoDescription: row.subj_trans_video_description,
  videoThumbnail: row.subj_trans_video_thumbnail,
  videoDurationMinutes: row.subj_trans_video_duration_minutes
    ? Number(row.subj_trans_video_duration_minutes)
    : null,
  tags: row.subj_trans_tags,
  metaTitle: row.subj_trans_meta_title,
  metaDescription: row.subj_trans_meta_description,
  metaKeywords: row.subj_trans_meta_keywords,
  canonicalUrl: row.subj_trans_canonical_url,
  ogSiteName: row.subj_trans_og_site_name,
  ogTitle: row.subj_trans_og_title,
  ogDescription: row.subj_trans_og_description,
  ogType: row.subj_trans_og_type,
  ogImage: row.subj_trans_og_image,
  ogUrl: row.subj_trans_og_url,
  twitterSite: row.subj_trans_twitter_site,
  twitterTitle: row.subj_trans_twitter_title,
  twitterDescription: row.subj_trans_twitter_description,
  twitterImage: row.subj_trans_twitter_image,
  twitterCard: row.subj_trans_twitter_card,
  robotsDirective: row.subj_trans_robots_directive,
  focusKeyword: row.subj_trans_focus_keyword,
  authorName: row.subj_trans_author_name,
  authorBio: row.subj_trans_author_bio,
  searchVector: row.subj_trans_search_vector,
  structuredData: row.subj_trans_structured_data,
  isActive: row.subj_trans_is_active,
  isDeleted: row.subj_trans_is_deleted,
  createdAt: toIsoString(row.subj_trans_created_at),
  updatedAt: toIsoString(row.subj_trans_updated_at),
  deletedAt: toIsoString(row.subj_trans_deleted_at),
  subjectCode: row.subject_code,
  subjectSlug: row.subject_slug,
  subjectDifficultyLevel: row.subject_difficulty_level,
  subjectEstimatedHours: row.subject_estimated_hours
    ? Number(row.subject_estimated_hours)
    : null,
  subjectViewCount: Number(row.subject_view_count),
  subjectDisplayOrder: row.subject_display_order,
  subjectIsActive: row.subject_is_active
});

// ─── Subject CRUD ────────────────────────────────────────────────

export interface ListSubjectsResult {
  rows: SubjectDto[];
  meta: PaginationMeta;
}

export const listSubjects = async (
  q: ListSubjectsQuery
): Promise<ListSubjectsResult> => {
  const { rows, totalCount } = await db.callTableFunction<SubjectRow>(
    'udf_get_subjects',
    {
      p_id: null,
      p_subject_id: null,
      p_language_id: null,
      p_is_active: q.isActive ?? null,
      p_filter_difficulty_level: q.difficultyLevel ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? null,
      p_search_term: q.searchTerm ?? null,
      p_sort_table: 'subject',
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapSubject),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getSubjectById = async (id: number): Promise<SubjectDto | null> => {
  // Query uv_subjects directly — udf_get_subjects INNER JOINs translations,
  // so subjects without translations would return zero rows.
  const result = await db.query<SubjectRow>(
    'SELECT *, COUNT(*) OVER()::INT AS total_count FROM uv_subjects WHERE subject_id = $1 LIMIT 1',
    [id]
  );
  const row = result.rows[0];
  return row ? mapSubject(row) : null;
};

export interface CreateSubjectResult {
  id: number;
  translationId?: number;
}

export const createSubject = async (
  body: CreateSubjectBody,
  callerId: number | null
): Promise<CreateSubjectResult> => {
  const result = await db.callFunction('udf_insert_subjects', {
    p_code: body.code,
    p_difficulty_level: body.difficultyLevel ?? null,
    p_estimated_hours: body.estimatedHours ?? null,
    p_display_order: body.displayOrder ?? null,
    p_note: body.note ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
  return {
    id: Number(result.id)
  };
};

export const updateSubject = async (
  id: number,
  body: UpdateSubjectBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_subjects', {
    p_id: id,
    p_code: body.code ?? null,
    p_difficulty_level: body.difficultyLevel ?? null,
    p_estimated_hours: body.estimatedHours ?? null,
    p_display_order: body.displayOrder ?? null,
    p_note: body.note ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteSubject = async (id: number): Promise<void> => {
  await db.callFunction('udf_delete_subjects', { p_id: id, p_actor_id: null });
};

export const restoreSubject = async (id: number): Promise<void> => {
  await db.callFunction('udf_restore_subjects', {
    p_id: id,
    p_restore_translations: true,
    p_actor_id: null
  });
};

// ─── Subject Translation CRUD ────────────────────────────────────

export interface ListSubjectTranslationsResult {
  rows: SubjectTranslationDto[];
  meta: PaginationMeta;
}

export const listSubjectTranslations = async (
  subjectId: number,
  q: ListSubjectTranslationsQuery
): Promise<ListSubjectTranslationsResult> => {
  const { rows, totalCount } = await db.callTableFunction<SubjectTranslationRow>(
    'udf_get_subjects',
    {
      p_id: null,
      p_subject_id: subjectId,
      p_language_id: q.languageId ?? null,
      p_is_active: q.isActive ?? null,
      p_filter_difficulty_level: null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? null,
      p_search_term: q.searchTerm ?? null,
      p_sort_table: 'translation',
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapSubjectTranslation),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getSubjectTranslationById = async (
  id: number
): Promise<SubjectTranslationDto | null> => {
  const { rows } = await db.callTableFunction<SubjectTranslationRow>(
    'udf_get_subjects',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapSubjectTranslation(row) : null;
};

export const createSubjectTranslation = async (
  subjectId: number,
  body: CreateSubjectTranslationBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_subject_translations', {
    p_subject_id: subjectId,
    p_language_id: body.languageId,
    p_name: body.name,
    p_short_intro: body.shortIntro ?? null,
    p_long_intro: body.longIntro ?? null,
    p_icon: body.icon ?? null,
    p_image: body.image ?? null,
    p_video_title: body.videoTitle ?? null,
    p_video_description: body.videoDescription ?? null,
    p_video_thumbnail: body.videoThumbnail ?? null,
    p_video_duration_minutes: body.videoDurationMinutes ?? null,
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
    p_author_name: body.authorName ?? null,
    p_author_bio: body.authorBio ?? null,
    p_structured_data: body.structuredData ?? null,
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateSubjectTranslation = async (
  id: number,
  body: UpdateSubjectTranslationBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_subject_translations', {
    p_id: id,
    p_name: body.name ?? null,
    p_short_intro: body.shortIntro ?? null,
    p_long_intro: body.longIntro ?? null,
    p_icon: body.icon ?? null,
    p_image: body.image ?? null,
    p_video_title: body.videoTitle ?? null,
    p_video_description: body.videoDescription ?? null,
    p_video_thumbnail: body.videoThumbnail ?? null,
    p_video_duration_minutes: body.videoDurationMinutes ?? null,
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
    p_author_name: body.authorName ?? null,
    p_author_bio: body.authorBio ?? null,
    p_structured_data: body.structuredData ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteSubjectTranslation = async (id: number): Promise<void> => {
  await db.callFunction('udf_delete_subject_translations', { p_id: id, p_actor_id: null });
};

export const restoreSubjectTranslation = async (id: number): Promise<void> => {
  await db.callFunction('udf_restore_subject_translations', { p_id: id, p_actor_id: null });
};

// ─── Translation image upload pipeline (4 slots) ─────────────────
//
// Slots: icon / image / ogImage / twitterImage.
// Same Bunny WebP contract as categories — sharp re-encode with
// quality loop until ≤ IMAGE_MAX_BYTES (100 KB), deterministic path
// `subjects/translations/<tid>/<slot>.webp`, delete-before-upload.
// Icon uses the smaller ICON_BOX_PX (256px); the other three use
// IMAGE_BOX_PX (512px).

export type SubjectTranslationImageSlot = 'icon' | 'image' | 'ogImage' | 'twitterImage';
export type SubjectTranslationImageFiles = Partial<
  Record<SubjectTranslationImageSlot, Express.Multer.File>
>;

const SUBJECT_TRANSLATION_SLOT_CONFIG: Record<
  SubjectTranslationImageSlot,
  { pathSegment: string; boxPx: number }
> = {
  icon: { pathSegment: 'icon', boxPx: ICON_BOX_PX },
  image: { pathSegment: 'image', boxPx: IMAGE_BOX_PX },
  ogImage: { pathSegment: 'og-image', boxPx: IMAGE_BOX_PX },
  twitterImage: { pathSegment: 'twitter-image', boxPx: IMAGE_BOX_PX }
};

/** Write a single image URL for a subject translation via the UDF. */
const setSubjectTranslationImageUrl = async (
  id: number,
  slot: SubjectTranslationImageSlot,
  url: string | null,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_subject_translations', {
    p_id: id,
    p_name: null,
    p_short_intro: null,
    p_long_intro: null,
    p_icon: slot === 'icon' ? url : null,
    p_image: slot === 'image' ? url : null,
    p_video_title: null,
    p_video_description: null,
    p_video_thumbnail: null,
    p_video_duration_minutes: null,
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
    p_author_bio: null,
    p_structured_data: null,
    p_is_active: null,
    p_actor_id: callerId
  });
};

/**
 * Re-encode each uploaded file to WebP, upload to Bunny under a
 * deterministic key, then persist the CDN URL on the translation.
 * Called after create or on PATCH when at least one file is present.
 */
export const processSubjectTranslationImageUploads = async (
  translationId: number,
  files: SubjectTranslationImageFiles,
  callerId: number | null
): Promise<void> => {
  const existing = await getSubjectTranslationById(translationId);
  if (!existing) {
    throw AppError.notFound(`Subject translation ${translationId} not found`);
  }

  const currentUrls: Record<SubjectTranslationImageSlot, string | null> = {
    icon: existing.icon,
    image: existing.image,
    ogImage: existing.ogImage,
    twitterImage: existing.twitterImage
  };

  const slots: SubjectTranslationImageSlot[] = ['icon', 'image', 'ogImage', 'twitterImage'];
  for (const slot of slots) {
    const file = files[slot];
    if (!file) continue;
    const cfg = SUBJECT_TRANSLATION_SLOT_CONFIG[slot];
    const result = await replaceImage({
      inputBuffer: file.buffer,
      targetPath: `subjects/translations/${translationId}/${cfg.pathSegment}.webp`,
      currentUrl: currentUrls[slot],
      boxPx: cfg.boxPx,
      maxBytes: IMAGE_MAX_BYTES,
      logContext: { subjectTranslationId: translationId, slot }
    });
    if (!result) {
      throw AppError.badRequest(
        `Subject translation ${slot} is too complex to compress under ${Math.round(IMAGE_MAX_BYTES / 1024)} KB. Try a simpler image.`,
        { slot, maxBytes: IMAGE_MAX_BYTES }
      );
    }
    await setSubjectTranslationImageUrl(translationId, slot, result.cdnUrl, callerId);
  }
};
