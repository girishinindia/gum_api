// ═══════════════════════════════════════════════════════════════
// webinars.service — UDF wrappers for /api/v1/webinars
//
// Provides CRUD for webinars + webinar_translations.
// Uses udf_get_webinars (combined view with translations)
// and individual insert/update/delete/restore UDFs.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateWebinarBody,
  CreateWebinarTranslationBody,
  ListWebinarsQuery,
  ListWebinarTranslationsQuery,
  UpdateWebinarBody,
  UpdateWebinarTranslationBody
} from './webinars.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface WebinarDto {
  id: number;
  webinarOwner: string;
  instructorId: number | null;
  instructorFirstName: string | null;
  instructorLastName: string | null;
  instructorEmail: string | null;
  courseId: number | null;
  chapterId: number | null;
  code: string | null;
  slug: string | null;
  isFree: boolean;
  price: number;
  scheduledAt: string | null;
  durationMinutes: number | null;
  maxAttendees: number | null;
  registeredCount: number;
  meetingPlatform: string | null;
  meetingUrl: string | null;
  meetingId: string | null;
  meetingPassword: string | null;
  recordingUrl: string | null;
  webinarStatus: string;
  displayOrder: number;
  createdBy: number | null;
  updatedBy: number | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  translation: WebinarTranslationDto | null;
}

export interface WebinarTranslationDto {
  id: number;
  webinarId: number;
  languageId: number;
  title: string;
  description: string | null;
  shortDescription: string | null;
  thumbnailUrl: string | null;
  bannerUrl: string | null;
  tags: unknown;
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
  structuredData: unknown;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  languageName: string | null;
  languageIsoCode: string | null;
  languageNativeName: string | null;
}

// ─── Internal Row Interface ─────────────────────────────────────

interface WebinarRow {
  total_count?: number | string;
  webinar_trans_id: number | string | null;
  webinar_trans_webinar_id: number | string | null;
  webinar_trans_language_id: number | string | null;
  webinar_trans_language_code: string | null;
  webinar_trans_language_name: string | null;
  webinar_trans_language_native_name: string | null;
  webinar_trans_title: string | null;
  webinar_trans_description: string | null;
  webinar_trans_short_description: string | null;
  webinar_trans_thumbnail_url: string | null;
  webinar_trans_banner_url: string | null;
  webinar_trans_tags: unknown;
  webinar_trans_meta_title: string | null;
  webinar_trans_meta_description: string | null;
  webinar_trans_meta_keywords: string | null;
  webinar_trans_canonical_url: string | null;
  webinar_trans_og_site_name: string | null;
  webinar_trans_og_title: string | null;
  webinar_trans_og_description: string | null;
  webinar_trans_og_type: string | null;
  webinar_trans_og_image: string | null;
  webinar_trans_og_url: string | null;
  webinar_trans_twitter_site: string | null;
  webinar_trans_twitter_title: string | null;
  webinar_trans_twitter_description: string | null;
  webinar_trans_twitter_image: string | null;
  webinar_trans_twitter_card: string | null;
  webinar_trans_robots_directive: string | null;
  webinar_trans_focus_keyword: string | null;
  webinar_trans_structured_data: unknown;
  webinar_trans_is_active: boolean | null;
  webinar_trans_is_deleted: boolean | null;
  webinar_trans_created_at: Date | string | null;
  webinar_trans_updated_at: Date | string | null;
  webinar_trans_deleted_at: Date | string | null;
  webinar_id: number | string;
  webinar_owner: string;
  webinar_instructor_id: number | string | null;
  webinar_instructor_first_name: string | null;
  webinar_instructor_last_name: string | null;
  webinar_instructor_email: string | null;
  webinar_course_id: number | string | null;
  webinar_chapter_id: number | string | null;
  webinar_code: string | null;
  webinar_slug: string | null;
  webinar_is_free: boolean;
  webinar_price: number | string;
  webinar_scheduled_at: Date | string | null;
  webinar_duration_minutes: number | null;
  webinar_max_attendees: number | null;
  webinar_registered_count: number | string;
  webinar_meeting_platform: string | null;
  webinar_meeting_url: string | null;
  webinar_meeting_id: string | null;
  webinar_meeting_password: string | null;
  webinar_recording_url: string | null;
  webinar_webinar_status: string;
  webinar_display_order: number | string;
  webinar_created_by: number | null;
  webinar_updated_by: number | null;
  webinar_is_active: boolean;
  webinar_is_deleted: boolean;
  webinar_created_at: Date | string | null;
  webinar_updated_at: Date | string | null;
}

// ─── Mapper ─────────────────────────────────────────────────────

const toIso = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapTranslation = (row: WebinarRow): WebinarTranslationDto | null => {
  if (row.webinar_trans_id == null) return null;
  return {
    id: Number(row.webinar_trans_id),
    webinarId: Number(row.webinar_trans_webinar_id),
    languageId: Number(row.webinar_trans_language_id),
    title: row.webinar_trans_title ?? '',
    description: row.webinar_trans_description,
    shortDescription: row.webinar_trans_short_description,
    thumbnailUrl: row.webinar_trans_thumbnail_url,
    bannerUrl: row.webinar_trans_banner_url,
    tags: row.webinar_trans_tags,
    metaTitle: row.webinar_trans_meta_title,
    metaDescription: row.webinar_trans_meta_description,
    metaKeywords: row.webinar_trans_meta_keywords,
    canonicalUrl: row.webinar_trans_canonical_url,
    ogSiteName: row.webinar_trans_og_site_name,
    ogTitle: row.webinar_trans_og_title,
    ogDescription: row.webinar_trans_og_description,
    ogType: row.webinar_trans_og_type,
    ogImage: row.webinar_trans_og_image,
    ogUrl: row.webinar_trans_og_url,
    twitterSite: row.webinar_trans_twitter_site,
    twitterTitle: row.webinar_trans_twitter_title,
    twitterDescription: row.webinar_trans_twitter_description,
    twitterImage: row.webinar_trans_twitter_image,
    twitterCard: row.webinar_trans_twitter_card,
    robotsDirective: row.webinar_trans_robots_directive,
    focusKeyword: row.webinar_trans_focus_keyword,
    structuredData: row.webinar_trans_structured_data,
    isActive: row.webinar_trans_is_active ?? true,
    isDeleted: row.webinar_trans_is_deleted ?? false,
    createdAt: toIso(row.webinar_trans_created_at),
    updatedAt: toIso(row.webinar_trans_updated_at),
    deletedAt: toIso(row.webinar_trans_deleted_at),
    languageName: row.webinar_trans_language_name,
    languageIsoCode: row.webinar_trans_language_code,
    languageNativeName: row.webinar_trans_language_native_name
  };
};

const mapRow = (row: WebinarRow): WebinarDto => ({
  id: Number(row.webinar_id),
  webinarOwner: row.webinar_owner,
  instructorId: row.webinar_instructor_id != null ? Number(row.webinar_instructor_id) : null,
  instructorFirstName: row.webinar_instructor_first_name,
  instructorLastName: row.webinar_instructor_last_name,
  instructorEmail: row.webinar_instructor_email,
  courseId: row.webinar_course_id != null ? Number(row.webinar_course_id) : null,
  chapterId: row.webinar_chapter_id != null ? Number(row.webinar_chapter_id) : null,
  code: row.webinar_code,
  slug: row.webinar_slug,
  isFree: row.webinar_is_free,
  price: Number(row.webinar_price),
  scheduledAt: toIso(row.webinar_scheduled_at),
  durationMinutes: row.webinar_duration_minutes,
  maxAttendees: row.webinar_max_attendees,
  registeredCount: Number(row.webinar_registered_count),
  meetingPlatform: row.webinar_meeting_platform,
  meetingUrl: row.webinar_meeting_url,
  meetingId: row.webinar_meeting_id,
  meetingPassword: row.webinar_meeting_password,
  recordingUrl: row.webinar_recording_url,
  webinarStatus: row.webinar_webinar_status,
  displayOrder: Number(row.webinar_display_order),
  createdBy: row.webinar_created_by,
  updatedBy: row.webinar_updated_by,
  isActive: row.webinar_is_active,
  isDeleted: row.webinar_is_deleted,
  createdAt: toIso(row.webinar_created_at),
  updatedAt: toIso(row.webinar_updated_at),
  translation: mapTranslation(row)
});

// ─── Webinar CRUD ───────────────────────────────────────────────

export interface ListResult {
  rows: WebinarDto[];
  meta: PaginationMeta;
}

export const listWebinars = async (
  q: ListWebinarsQuery
): Promise<ListResult> => {
  const offset = (q.pageIndex - 1) * q.pageSize;
  const { rows, totalCount } = await db.callTableFunction<WebinarRow>(
    'udf_get_webinars',
    {
      p_id: null,
      p_webinar_id: null,
      p_language_id: q.languageId ?? null,
      p_is_active: q.isActive ?? null,
      p_filter_webinar_owner: q.webinarOwner ?? null,
      p_filter_webinar_status: q.webinarStatus ?? null,
      p_filter_meeting_platform: q.meetingPlatform ?? null,
      p_filter_is_free: q.isFree ?? null,
      p_filter_course_id: q.courseId ?? null,
      p_filter_chapter_id: q.chapterId ?? null,
      p_filter_instructor_id: q.instructorId ?? null,
      p_filter_is_deleted: q.isDeleted ?? false,
      p_search_query: q.searchTerm ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_limit: q.pageSize,
      p_offset: offset
    }
  );

  return {
    rows: rows.map(mapRow),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getWebinarById = async (
  id: number
): Promise<WebinarDto | null> => {
  const { rows } = await db.callTableFunction<WebinarRow>(
    'udf_get_webinars',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapRow(row) : null;
};

export const createWebinar = async (
  body: CreateWebinarBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_webinars', {
    p_webinar_owner: body.webinarOwner ?? null,
    p_instructor_id: body.instructorId ?? null,
    p_course_id: body.courseId ?? null,
    p_chapter_id: body.chapterId ?? null,
    p_code: body.code ?? null,
    p_is_free: body.isFree ?? null,
    p_price: body.price ?? null,
    p_scheduled_at: body.scheduledAt ?? null,
    p_duration_minutes: body.durationMinutes ?? null,
    p_max_attendees: body.maxAttendees ?? null,
    p_meeting_platform: body.meetingPlatform ?? null,
    p_meeting_url: body.meetingUrl ?? null,
    p_meeting_id: body.meetingId ?? null,
    p_meeting_password: body.meetingPassword ?? null,
    p_recording_url: body.recordingUrl ?? null,
    p_webinar_status: body.webinarStatus ?? null,
    p_display_order: body.displayOrder ?? null,
    p_created_by: callerId,
    p_is_active: body.isActive ?? null
  });
  return { id: Number(result.id) };
};

export const updateWebinar = async (
  id: number,
  body: UpdateWebinarBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_webinars', {
    p_webinar_id: id,
    p_instructor_id: body.instructorId ?? null,
    p_course_id: body.courseId ?? null,
    p_chapter_id: body.chapterId ?? null,
    p_code: body.code !== undefined ? (body.code ?? '') : null,
    p_is_free: body.isFree ?? null,
    p_price: body.price ?? null,
    p_scheduled_at: body.scheduledAt ?? null,
    p_duration_minutes: body.durationMinutes ?? null,
    p_max_attendees: body.maxAttendees ?? null,
    p_meeting_platform: body.meetingPlatform ?? null,
    p_meeting_url: body.meetingUrl !== undefined ? (body.meetingUrl ?? '') : null,
    p_meeting_id: body.meetingId !== undefined ? (body.meetingId ?? '') : null,
    p_meeting_password: body.meetingPassword !== undefined ? (body.meetingPassword ?? '') : null,
    p_recording_url: body.recordingUrl !== undefined ? (body.recordingUrl ?? '') : null,
    p_webinar_status: body.webinarStatus ?? null,
    p_display_order: body.displayOrder ?? null,
    p_updated_by: callerId,
    p_is_active: body.isActive ?? null
  });
};

export const deleteWebinar = async (id: number): Promise<void> => {
  await db.callFunction('udf_delete_webinars', { p_webinar_id: id });
};

export const restoreWebinar = async (id: number): Promise<void> => {
  await db.callFunction('udf_restore_webinars', { p_webinar_id: id });
};

// ─── Translation CRUD ───────────────────────────────────────────

export const listWebinarTranslations = async (
  webinarId: number,
  q: ListWebinarTranslationsQuery
): Promise<ListResult> => {
  const offset = (q.pageIndex - 1) * q.pageSize;
  const { rows, totalCount } = await db.callTableFunction<WebinarRow>(
    'udf_get_webinars',
    {
      p_id: null,
      p_webinar_id: webinarId,
      p_language_id: q.languageId ?? null,
      p_is_active: q.isActive ?? null,
      p_filter_webinar_owner: null,
      p_filter_webinar_status: null,
      p_filter_meeting_platform: null,
      p_filter_is_free: null,
      p_filter_course_id: null,
      p_filter_chapter_id: null,
      p_filter_instructor_id: null,
      p_filter_is_deleted: q.isDeleted ?? false,
      p_search_query: q.searchTerm ?? null,
      p_sort_column: q.sortColumn === 'id' ? 'webinar_trans_id'
        : q.sortColumn === 'title' ? 'webinar_trans_title'
        : q.sortColumn === 'created_at' ? 'webinar_trans_created_at'
        : q.sortColumn === 'updated_at' ? 'webinar_trans_updated_at'
        : 'webinar_trans_created_at',
      p_sort_direction: q.sortDirection,
      p_limit: q.pageSize,
      p_offset: offset
    }
  );

  return {
    rows: rows.map(mapRow),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getWebinarTranslationById = async (
  translationId: number
): Promise<WebinarDto | null> => {
  // Query the view directly — udf_get_webinars filters by webinar_id, not translation_id.
  const result = await db.query<WebinarRow>(
    'SELECT *, COUNT(*) OVER()::INT AS total_count FROM uv_webinar_translations WHERE webinar_trans_id = $1 LIMIT 1',
    [translationId]
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
};

export const createWebinarTranslation = async (
  webinarId: number,
  body: CreateWebinarTranslationBody
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_webinar_translations', {
    p_webinar_id: webinarId,
    p_language_id: body.languageId,
    p_title: body.title,
    p_description: body.description ?? null,
    p_short_description: body.shortDescription ?? null,
    p_thumbnail_url: body.thumbnailUrl ?? null,
    p_banner_url: body.bannerUrl ?? null,
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
    p_is_active: body.isActive ?? null
  });
  return { id: Number(result.id) };
};

export const updateWebinarTranslation = async (
  translationId: number,
  body: UpdateWebinarTranslationBody
): Promise<void> => {
  await db.callFunction('udf_update_webinar_translations', {
    p_translation_id: translationId,
    p_title: body.title ?? null,
    p_description: body.description !== undefined ? (body.description ?? '') : null,
    p_short_description: body.shortDescription !== undefined ? (body.shortDescription ?? '') : null,
    p_thumbnail_url: body.thumbnailUrl !== undefined ? (body.thumbnailUrl ?? '') : null,
    p_banner_url: body.bannerUrl !== undefined ? (body.bannerUrl ?? '') : null,
    p_tags: body.tags ?? null,
    p_meta_title: body.metaTitle !== undefined ? (body.metaTitle ?? '') : null,
    p_meta_description: body.metaDescription !== undefined ? (body.metaDescription ?? '') : null,
    p_meta_keywords: body.metaKeywords !== undefined ? (body.metaKeywords ?? '') : null,
    p_canonical_url: body.canonicalUrl !== undefined ? (body.canonicalUrl ?? '') : null,
    p_og_site_name: body.ogSiteName !== undefined ? (body.ogSiteName ?? '') : null,
    p_og_title: body.ogTitle !== undefined ? (body.ogTitle ?? '') : null,
    p_og_description: body.ogDescription !== undefined ? (body.ogDescription ?? '') : null,
    p_og_type: body.ogType !== undefined ? (body.ogType ?? '') : null,
    p_og_image: body.ogImage !== undefined ? (body.ogImage ?? '') : null,
    p_og_url: body.ogUrl !== undefined ? (body.ogUrl ?? '') : null,
    p_twitter_site: body.twitterSite !== undefined ? (body.twitterSite ?? '') : null,
    p_twitter_title: body.twitterTitle !== undefined ? (body.twitterTitle ?? '') : null,
    p_twitter_description: body.twitterDescription !== undefined ? (body.twitterDescription ?? '') : null,
    p_twitter_image: body.twitterImage !== undefined ? (body.twitterImage ?? '') : null,
    p_twitter_card: body.twitterCard !== undefined ? (body.twitterCard ?? '') : null,
    p_robots_directive: body.robotsDirective !== undefined ? (body.robotsDirective ?? '') : null,
    p_focus_keyword: body.focusKeyword !== undefined ? (body.focusKeyword ?? '') : null,
    p_structured_data: body.structuredData ?? null,
    p_is_active: body.isActive ?? null
  });
};

export const deleteWebinarTranslation = async (id: number): Promise<void> => {
  await db.callFunction('udf_delete_webinar_translations', {
    p_translation_id: id
  });
};

export const restoreWebinarTranslation = async (id: number): Promise<void> => {
  await db.callFunction('udf_restore_webinar_translations', {
    p_translation_id: id
  });
};
