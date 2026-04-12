// ═══════════════════════════════════════════════════════════════
// courses.service — UDF wrappers for /api/v1/courses
//
// Provides CRUD operations for courses and course translations
// using the udf_get_courses function and UDFs.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateCourseBody,
  ListCoursesQuery,
  UpdateCourseBody,
  CreateCourseTranslationBody,
  ListCourseTranslationsQuery,
  UpdateCourseTranslationBody
} from './courses.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface CourseDto {
  id: number;
  translationId: number | null;
  code: string | null;
  slug: string;
  title: string | null;
  languageCode: string | null;
  instructorFullName: string | null;
  price: number;
  currency: string;
  isFree: boolean;
  difficultyLevel: string | null;
  courseStatus: string;
  isActive: boolean;
  ratingAverage: number;
  enrollmentCount: number;
  totalLessons: number;
}

export interface CourseTranslationDto {
  id: number;
  courseId: number;
  languageId: number;
  title: string;
  shortIntro: string | null;
  longIntro: string | null;
  tagline: string | null;
  webThumbnail: string | null;
  webBanner: string | null;
  appThumbnail: string | null;
  appBanner: string | null;
  videoTitle: string | null;
  videoDescription: string | null;
  videoThumbnail: string | null;
  videoDurationMinutes: number | null;
  tags: unknown | null;
  isNewTitle: string | null;
  prerequisites: unknown | null;
  skillsGain: unknown | null;
  whatYouWillLearn: unknown | null;
  courseIncludes: unknown | null;
  courseIsFor: unknown | null;
  applyForDesignations: unknown | null;
  demandInCountries: unknown | null;
  salaryStandard: unknown | null;
  futureCourses: unknown | null;
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
  courseCode: string | null;
  courseSlug: string;
  courseDifficultyLevel: string | null;
  coursePrice: number;
  courseCurrency: string;
  courseIsActive: boolean;
}

// ─── Internal Row Interfaces ────────────────────────────────────

interface CourseRow {
  course_trans_id: number | string;
  course_id: number | string;
  course_code: string | null;
  course_slug: string;
  course_trans_title: string | null;
  trans_language_code: string | null;
  instructor_full_name: string | null;
  course_price: number | string;
  course_currency: string;
  course_is_free: boolean;
  course_difficulty_level: string | null;
  course_status: string;
  course_is_active: boolean;
  course_rating_average: number | string;
  course_enrollment_count: number | string;
  course_total_lessons: number | string;
  total_count?: number | string;
}

interface CourseTranslationRow {
  course_trans_id: number | string;
  course_trans_course_id: number | string;
  course_trans_language_id: number | string;
  course_trans_title: string;
  course_trans_short_intro: string | null;
  course_trans_long_intro: string | null;
  course_trans_tagline: string | null;
  course_trans_web_thumbnail: string | null;
  course_trans_web_banner: string | null;
  course_trans_app_thumbnail: string | null;
  course_trans_app_banner: string | null;
  course_trans_video_title: string | null;
  course_trans_video_description: string | null;
  course_trans_video_thumbnail: string | null;
  course_trans_video_duration_minutes: number | null;
  course_trans_tags: unknown | null;
  course_trans_is_new_title: string | null;
  course_trans_prerequisites: unknown | null;
  course_trans_skills_gain: unknown | null;
  course_trans_what_you_will_learn: unknown | null;
  course_trans_course_includes: unknown | null;
  course_trans_course_is_for: unknown | null;
  course_trans_apply_for_designations: unknown | null;
  course_trans_demand_in_countries: unknown | null;
  course_trans_salary_standard: unknown | null;
  course_trans_future_courses: unknown | null;
  course_trans_meta_title: string | null;
  course_trans_meta_description: string | null;
  course_trans_meta_keywords: string | null;
  course_trans_canonical_url: string | null;
  course_trans_og_site_name: string | null;
  course_trans_og_title: string | null;
  course_trans_og_description: string | null;
  course_trans_og_type: string | null;
  course_trans_og_image: string | null;
  course_trans_og_url: string | null;
  course_trans_twitter_site: string | null;
  course_trans_twitter_title: string | null;
  course_trans_twitter_description: string | null;
  course_trans_twitter_image: string | null;
  course_trans_twitter_card: string | null;
  course_trans_robots_directive: string | null;
  course_trans_focus_keyword: string | null;
  course_trans_structured_data: unknown | null;
  course_trans_is_active: boolean;
  course_trans_is_deleted: boolean;
  course_trans_created_at: Date | string | null;
  course_trans_updated_at: Date | string | null;
  course_trans_deleted_at: Date | string | null;
  course_code: string | null;
  course_slug: string;
  course_difficulty_level: string | null;
  course_price: number | string;
  course_currency: string;
  course_is_active: boolean;
  total_count?: number | string;
}

// ─── Mappers ────────────────────────────────────────────────────

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapCourse = (row: CourseRow): CourseDto => ({
  id: Number(row.course_id),
  translationId: row.course_trans_id ? Number(row.course_trans_id) : null,
  code: row.course_code,
  slug: row.course_slug,
  title: row.course_trans_title,
  languageCode: row.trans_language_code,
  instructorFullName: row.instructor_full_name,
  price: Number(row.course_price),
  currency: row.course_currency,
  isFree: row.course_is_free,
  difficultyLevel: row.course_difficulty_level,
  courseStatus: row.course_status,
  isActive: row.course_is_active,
  ratingAverage: Number(row.course_rating_average),
  enrollmentCount: Number(row.course_enrollment_count),
  totalLessons: Number(row.course_total_lessons)
});

const mapCourseTranslation = (row: CourseTranslationRow): CourseTranslationDto => ({
  id: Number(row.course_trans_id),
  courseId: Number(row.course_trans_course_id),
  languageId: Number(row.course_trans_language_id),
  title: row.course_trans_title,
  shortIntro: row.course_trans_short_intro,
  longIntro: row.course_trans_long_intro,
  tagline: row.course_trans_tagline,
  webThumbnail: row.course_trans_web_thumbnail,
  webBanner: row.course_trans_web_banner,
  appThumbnail: row.course_trans_app_thumbnail,
  appBanner: row.course_trans_app_banner,
  videoTitle: row.course_trans_video_title,
  videoDescription: row.course_trans_video_description,
  videoThumbnail: row.course_trans_video_thumbnail,
  videoDurationMinutes: row.course_trans_video_duration_minutes
    ? Number(row.course_trans_video_duration_minutes)
    : null,
  tags: row.course_trans_tags,
  isNewTitle: row.course_trans_is_new_title,
  prerequisites: row.course_trans_prerequisites,
  skillsGain: row.course_trans_skills_gain,
  whatYouWillLearn: row.course_trans_what_you_will_learn,
  courseIncludes: row.course_trans_course_includes,
  courseIsFor: row.course_trans_course_is_for,
  applyForDesignations: row.course_trans_apply_for_designations,
  demandInCountries: row.course_trans_demand_in_countries,
  salaryStandard: row.course_trans_salary_standard,
  futureCourses: row.course_trans_future_courses,
  metaTitle: row.course_trans_meta_title,
  metaDescription: row.course_trans_meta_description,
  metaKeywords: row.course_trans_meta_keywords,
  canonicalUrl: row.course_trans_canonical_url,
  ogSiteName: row.course_trans_og_site_name,
  ogTitle: row.course_trans_og_title,
  ogDescription: row.course_trans_og_description,
  ogType: row.course_trans_og_type,
  ogImage: row.course_trans_og_image,
  ogUrl: row.course_trans_og_url,
  twitterSite: row.course_trans_twitter_site,
  twitterTitle: row.course_trans_twitter_title,
  twitterDescription: row.course_trans_twitter_description,
  twitterImage: row.course_trans_twitter_image,
  twitterCard: row.course_trans_twitter_card,
  robotsDirective: row.course_trans_robots_directive,
  focusKeyword: row.course_trans_focus_keyword,
  structuredData: row.course_trans_structured_data,
  isActive: row.course_trans_is_active,
  isDeleted: row.course_trans_is_deleted,
  createdAt: toIsoString(row.course_trans_created_at),
  updatedAt: toIsoString(row.course_trans_updated_at),
  deletedAt: toIsoString(row.course_trans_deleted_at),
  courseCode: row.course_code,
  courseSlug: row.course_slug,
  courseDifficultyLevel: row.course_difficulty_level,
  coursePrice: Number(row.course_price),
  courseCurrency: row.course_currency,
  courseIsActive: row.course_is_active
});

// ─── Course CRUD ────────────────────────────────────────────────

export interface ListCoursesResult {
  rows: CourseDto[];
  meta: PaginationMeta;
}

export const listCourses = async (
  q: ListCoursesQuery
): Promise<ListCoursesResult> => {
  const { rows, totalCount } = await db.callTableFunction<CourseRow>(
    'udf_get_courses',
    {
      p_id: null,
      p_course_id: null,
      p_language_id: null,
      p_is_active: q.isActive ?? null,
      p_filter_difficulty_level: q.difficultyLevel ?? null,
      p_filter_course_status: q.courseStatus ?? null,
      p_filter_is_free: q.isFree ?? null,
      p_filter_currency: q.currency ?? null,
      p_filter_is_instructor_course: q.isInstructorCourse ?? null,
      p_filter_is_deleted: q.isDeleted ?? false,
      p_search_term: q.searchTerm ?? null,
      p_sort_table: 'course',
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapCourse),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getCourseById = async (id: number): Promise<CourseDto | null> => {
  const { rows } = await db.callTableFunction<CourseRow>(
    'udf_get_courses',
    { p_course_id: id }
  );
  const row = rows[0];
  return row ? mapCourse(row) : null;
};

export interface CreateCourseResult {
  id: number;
  translationId?: number;
}

export const createCourse = async (
  body: CreateCourseBody,
  callerId: number | null
): Promise<CreateCourseResult> => {
  const result = await db.callFunction('udf_insert_courses', {
    p_instructor_id: body.instructorId ?? null,
    p_course_language_id: body.courseLanguageId ?? null,
    p_is_instructor_course: body.isInstructorCourse ?? null,
    p_code: body.code ?? null,
    p_slug: body.slug ?? null,
    p_difficulty_level: body.difficultyLevel ?? null,
    p_course_status: body.courseStatus ?? null,
    p_duration_hours: body.durationHours ?? null,
    p_price: body.price ?? null,
    p_original_price: body.originalPrice ?? null,
    p_discount_percentage: body.discountPercentage ?? null,
    p_currency: body.currency ?? null,
    p_is_free: body.isFree ?? null,
    p_trailer_video_url: body.trailerVideoUrl ?? null,
    p_trailer_thumbnail_url: body.trailerThumbnailUrl ?? null,
    p_video_url: body.videoUrl ?? null,
    p_brochure_url: body.brochureUrl ?? null,
    p_is_new: body.isNew ?? null,
    p_new_until: body.newUntil ?? null,
    p_is_featured: body.isFeatured ?? null,
    p_is_bestseller: body.isBestseller ?? null,
    p_has_placement_assistance: body.hasPlacementAssistance ?? null,
    p_has_certificate: body.hasCertificate ?? null,
    p_max_students: body.maxStudents ?? null,
    p_refund_days: body.refundDays ?? null,
    p_is_active: body.isActive ?? null,
    p_published_at: body.publishedAt ?? null,
    p_content_updated_at: body.contentUpdatedAt ?? null,
    p_actor_id: callerId
  });

  const out: CreateCourseResult = { id: Number(result.id) };

  // If embedded translation was provided, create it too
  if (body.translation) {
    const tResult = await db.callFunction('udf_insert_course_translations', {
      p_course_id: out.id,
      p_language_id: body.translation.languageId,
      p_title: body.translation.title,
      p_short_intro: body.translation.shortIntro ?? null,
      p_long_intro: body.translation.longIntro ?? null,
      p_tagline: body.translation.tagline ?? null,
      p_web_thumbnail: body.translation.webThumbnail ?? null,
      p_web_banner: body.translation.webBanner ?? null,
      p_app_thumbnail: body.translation.appThumbnail ?? null,
      p_app_banner: body.translation.appBanner ?? null,
      p_video_title: body.translation.videoTitle ?? null,
      p_video_description: body.translation.videoDescription ?? null,
      p_video_thumbnail: body.translation.videoThumbnail ?? null,
      p_video_duration_minutes: body.translation.videoDurationMinutes ?? null,
      p_tags: body.translation.tags ?? null,
      p_is_new_title: body.translation.isNewTitle ?? null,
      p_prerequisites: body.translation.prerequisites ?? null,
      p_skills_gain: body.translation.skillsGain ?? null,
      p_what_you_will_learn: body.translation.whatYouWillLearn ?? null,
      p_course_includes: body.translation.courseIncludes ?? null,
      p_course_is_for: body.translation.courseIsFor ?? null,
      p_apply_for_designations: body.translation.applyForDesignations ?? null,
      p_demand_in_countries: body.translation.demandInCountries ?? null,
      p_salary_standard: body.translation.salaryStandard ?? null,
      p_future_courses: body.translation.futureCourses ?? null,
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
      p_actor_id: callerId
    });
    out.translationId = Number(tResult.id);
  }

  return out;
};

export const updateCourse = async (
  id: number,
  body: UpdateCourseBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_courses', {
    p_id: id,
    p_instructor_id: body.instructorId ?? null,
    p_course_language_id: body.courseLanguageId ?? null,
    p_is_instructor_course: body.isInstructorCourse ?? null,
    p_code: body.code ?? null,
    p_slug: body.slug ?? null,
    p_difficulty_level: body.difficultyLevel ?? null,
    p_course_status: body.courseStatus ?? null,
    p_duration_hours: body.durationHours ?? null,
    p_price: body.price ?? null,
    p_original_price: body.originalPrice ?? null,
    p_discount_percentage: body.discountPercentage ?? null,
    p_currency: body.currency ?? null,
    p_is_free: body.isFree ?? null,
    p_trailer_video_url: body.trailerVideoUrl ?? null,
    p_trailer_thumbnail_url: body.trailerThumbnailUrl ?? null,
    p_video_url: body.videoUrl ?? null,
    p_brochure_url: body.brochureUrl ?? null,
    p_is_new: body.isNew ?? null,
    p_new_until: body.newUntil ?? null,
    p_is_featured: body.isFeatured ?? null,
    p_is_bestseller: body.isBestseller ?? null,
    p_has_placement_assistance: body.hasPlacementAssistance ?? null,
    p_has_certificate: body.hasCertificate ?? null,
    p_max_students: body.maxStudents ?? null,
    p_refund_days: body.refundDays ?? null,
    p_is_active: body.isActive ?? null,
    p_published_at: body.publishedAt ?? null,
    p_content_updated_at: body.contentUpdatedAt ?? null,
    p_actor_id: callerId
  });
};

export const deleteCourse = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_delete_courses', { p_id: id, p_actor_id: callerId });
};

export const restoreCourse = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_restore_courses', {
    p_id: id,
    p_restore_translations: true,
    p_actor_id: callerId
  });
};

// ─── Course Translation CRUD ────────────────────────────────────

export interface ListCourseTranslationsResult {
  rows: CourseTranslationDto[];
  meta: PaginationMeta;
}

export const listCourseTranslations = async (
  courseId: number,
  q: ListCourseTranslationsQuery
): Promise<ListCourseTranslationsResult> => {
  const { rows, totalCount } = await db.callTableFunction<CourseTranslationRow>(
    'udf_get_courses',
    {
      p_id: null,
      p_course_id: courseId,
      p_language_id: q.languageId ?? null,
      p_is_active: q.isActive ?? null,
      p_filter_difficulty_level: null,
      p_filter_course_status: null,
      p_filter_is_free: null,
      p_filter_currency: null,
      p_filter_is_instructor_course: null,
      p_filter_is_deleted: q.isDeleted ?? false,
      p_search_term: q.searchTerm ?? null,
      p_sort_table: 'translation',
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapCourseTranslation),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getCourseTranslationById = async (
  id: number
): Promise<CourseTranslationDto | null> => {
  // Query the view directly since udf_get_courses filters by course_id, not translation_id
  const { rows } = await db.callTableFunction<CourseTranslationRow>(
    'uv_course_translations',
    {},
    `course_trans_id = ${id}`,
    1
  );
  const row = rows[0];
  return row ? mapCourseTranslation(row) : null;
};

export const createCourseTranslation = async (
  courseId: number,
  body: CreateCourseTranslationBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_course_translations', {
    p_course_id: courseId,
    p_language_id: body.languageId,
    p_title: body.title,
    p_short_intro: body.shortIntro ?? null,
    p_long_intro: body.longIntro ?? null,
    p_tagline: body.tagline ?? null,
    p_web_thumbnail: body.webThumbnail ?? null,
    p_web_banner: body.webBanner ?? null,
    p_app_thumbnail: body.appThumbnail ?? null,
    p_app_banner: body.appBanner ?? null,
    p_video_title: body.videoTitle ?? null,
    p_video_description: body.videoDescription ?? null,
    p_video_thumbnail: body.videoThumbnail ?? null,
    p_video_duration_minutes: body.videoDurationMinutes ?? null,
    p_tags: body.tags ?? null,
    p_is_new_title: body.isNewTitle ?? null,
    p_prerequisites: body.prerequisites ?? null,
    p_skills_gain: body.skillsGain ?? null,
    p_what_you_will_learn: body.whatYouWillLearn ?? null,
    p_course_includes: body.courseIncludes ?? null,
    p_course_is_for: body.courseIsFor ?? null,
    p_apply_for_designations: body.applyForDesignations ?? null,
    p_demand_in_countries: body.demandInCountries ?? null,
    p_salary_standard: body.salaryStandard ?? null,
    p_future_courses: body.futureCourses ?? null,
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
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateCourseTranslation = async (
  id: number,
  body: UpdateCourseTranslationBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_course_translations', {
    p_id: id,
    p_title: body.title ?? null,
    p_short_intro: body.shortIntro ?? null,
    p_long_intro: body.longIntro ?? null,
    p_tagline: body.tagline ?? null,
    p_web_thumbnail: body.webThumbnail ?? null,
    p_web_banner: body.webBanner ?? null,
    p_app_thumbnail: body.appThumbnail ?? null,
    p_app_banner: body.appBanner ?? null,
    p_video_title: body.videoTitle ?? null,
    p_video_description: body.videoDescription ?? null,
    p_video_thumbnail: body.videoThumbnail ?? null,
    p_video_duration_minutes: body.videoDurationMinutes ?? null,
    p_tags: body.tags ?? null,
    p_is_new_title: body.isNewTitle ?? null,
    p_prerequisites: body.prerequisites ?? null,
    p_skills_gain: body.skillsGain ?? null,
    p_what_you_will_learn: body.whatYouWillLearn ?? null,
    p_course_includes: body.courseIncludes ?? null,
    p_course_is_for: body.courseIsFor ?? null,
    p_apply_for_designations: body.applyForDesignations ?? null,
    p_demand_in_countries: body.demandInCountries ?? null,
    p_salary_standard: body.salaryStandard ?? null,
    p_future_courses: body.futureCourses ?? null,
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

export const deleteCourseTranslation = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_delete_course_translations', { p_id: id, p_actor_id: callerId });
};

export const restoreCourseTranslation = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_restore_course_translations', { p_id: id, p_actor_id: callerId });
};
