// ═══════════════════════════════════════════════════════════════
// assessments.service — UDF wrappers for /api/v1/assessments
//
// Provides CRUD for assessments + assessment_translations.
// Uses udf_get_assessments (combined view with translations)
// and individual insert/update/delete/restore UDFs.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateAssessmentBody,
  CreateAssessmentTranslationBody,
  ListAssessmentsQuery,
  ListAssessmentTranslationsQuery,
  UpdateAssessmentBody,
  UpdateAssessmentTranslationBody
} from './assessments.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface AssessmentDto {
  id: number;
  assessmentType: string;
  assessmentScope: string;
  chapterId: number | null;
  moduleId: number | null;
  courseId: number | null;
  contentType: string;
  code: string | null;
  slug: string | null;
  points: number;
  difficultyLevel: string | null;
  dueDays: number | null;
  estimatedHours: number | null;
  isMandatory: boolean;
  displayOrder: number;
  createdBy: number | null;
  updatedBy: number | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  // Translation context (from joined view)
  translation: AssessmentTranslationDto | null;
}

export interface AssessmentTranslationDto {
  id: number;
  languageId: number;
  title: string;
  description: string | null;
  instructions: string | null;
  techStack: unknown;
  learningOutcomes: unknown;
  image1: string | null;
  image2: string | null;
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
  // Language info
  languageName: string | null;
  languageIsoCode: string | null;
}

// ─── Internal Row Interface ────────────────────────────────────

interface AssessmentRow {
  asmt_id: number | string;
  asmt_assessment_type: string;
  asmt_assessment_scope: string;
  asmt_chapter_id: number | string | null;
  asmt_module_id: number | string | null;
  asmt_course_id: number | string | null;
  asmt_content_type: string;
  asmt_code: string | null;
  asmt_slug: string | null;
  asmt_points: number | string;
  asmt_difficulty_level: string | null;
  asmt_due_days: number | null;
  asmt_estimated_hours: number | string | null;
  asmt_is_mandatory: boolean;
  asmt_display_order: number | string;
  asmt_created_by: number | null;
  asmt_updated_by: number | null;
  asmt_is_active: boolean;
  asmt_is_deleted: boolean;
  asmt_created_at: Date | string | null;
  asmt_updated_at: Date | string | null;
  asmt_deleted_at: Date | string | null;
  // Translation columns
  asmt_trans_id: number | string | null;
  asmt_trans_language_id: number | string | null;
  asmt_trans_title: string | null;
  asmt_trans_description: string | null;
  asmt_trans_instructions: string | null;
  asmt_trans_tech_stack: unknown;
  asmt_trans_learning_outcomes: unknown;
  asmt_trans_image_1: string | null;
  asmt_trans_image_2: string | null;
  asmt_trans_tags: unknown;
  asmt_trans_meta_title: string | null;
  asmt_trans_meta_description: string | null;
  asmt_trans_meta_keywords: string | null;
  asmt_trans_canonical_url: string | null;
  asmt_trans_og_site_name: string | null;
  asmt_trans_og_title: string | null;
  asmt_trans_og_description: string | null;
  asmt_trans_og_type: string | null;
  asmt_trans_og_image: string | null;
  asmt_trans_og_url: string | null;
  asmt_trans_twitter_site: string | null;
  asmt_trans_twitter_title: string | null;
  asmt_trans_twitter_description: string | null;
  asmt_trans_twitter_image: string | null;
  asmt_trans_twitter_card: string | null;
  asmt_trans_robots_directive: string | null;
  asmt_trans_focus_keyword: string | null;
  asmt_trans_structured_data: unknown;
  asmt_trans_is_active: boolean | null;
  asmt_trans_is_deleted: boolean | null;
  asmt_trans_created_at: Date | string | null;
  asmt_trans_updated_at: Date | string | null;
  asmt_trans_deleted_at: Date | string | null;
  // Language
  language_id: number | string | null;
  language_name: string | null;
  language_iso_code: string | null;
  total_count?: number | string;
}

// ─── Mapper ────────────────────────────────────────────────────

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapTranslation = (row: AssessmentRow): AssessmentTranslationDto | null => {
  if (row.asmt_trans_id == null) return null;
  return {
    id: Number(row.asmt_trans_id),
    languageId: Number(row.asmt_trans_language_id),
    title: row.asmt_trans_title ?? '',
    description: row.asmt_trans_description,
    instructions: row.asmt_trans_instructions,
    techStack: row.asmt_trans_tech_stack,
    learningOutcomes: row.asmt_trans_learning_outcomes,
    image1: row.asmt_trans_image_1,
    image2: row.asmt_trans_image_2,
    tags: row.asmt_trans_tags,
    metaTitle: row.asmt_trans_meta_title,
    metaDescription: row.asmt_trans_meta_description,
    metaKeywords: row.asmt_trans_meta_keywords,
    canonicalUrl: row.asmt_trans_canonical_url,
    ogSiteName: row.asmt_trans_og_site_name,
    ogTitle: row.asmt_trans_og_title,
    ogDescription: row.asmt_trans_og_description,
    ogType: row.asmt_trans_og_type,
    ogImage: row.asmt_trans_og_image,
    ogUrl: row.asmt_trans_og_url,
    twitterSite: row.asmt_trans_twitter_site,
    twitterTitle: row.asmt_trans_twitter_title,
    twitterDescription: row.asmt_trans_twitter_description,
    twitterImage: row.asmt_trans_twitter_image,
    twitterCard: row.asmt_trans_twitter_card,
    robotsDirective: row.asmt_trans_robots_directive,
    focusKeyword: row.asmt_trans_focus_keyword,
    structuredData: row.asmt_trans_structured_data,
    isActive: row.asmt_trans_is_active ?? true,
    isDeleted: row.asmt_trans_is_deleted ?? false,
    createdAt: toIsoString(row.asmt_trans_created_at),
    updatedAt: toIsoString(row.asmt_trans_updated_at),
    deletedAt: toIsoString(row.asmt_trans_deleted_at),
    languageName: row.language_name,
    languageIsoCode: row.language_iso_code
  };
};

const mapRow = (row: AssessmentRow): AssessmentDto => ({
  id: Number(row.asmt_id),
  assessmentType: row.asmt_assessment_type,
  assessmentScope: row.asmt_assessment_scope,
  chapterId: row.asmt_chapter_id != null ? Number(row.asmt_chapter_id) : null,
  moduleId: row.asmt_module_id != null ? Number(row.asmt_module_id) : null,
  courseId: row.asmt_course_id != null ? Number(row.asmt_course_id) : null,
  contentType: row.asmt_content_type,
  code: row.asmt_code,
  slug: row.asmt_slug,
  points: Number(row.asmt_points),
  difficultyLevel: row.asmt_difficulty_level,
  dueDays: row.asmt_due_days,
  estimatedHours: row.asmt_estimated_hours != null ? Number(row.asmt_estimated_hours) : null,
  isMandatory: row.asmt_is_mandatory,
  displayOrder: Number(row.asmt_display_order),
  createdBy: row.asmt_created_by,
  updatedBy: row.asmt_updated_by,
  isActive: row.asmt_is_active,
  isDeleted: row.asmt_is_deleted,
  createdAt: toIsoString(row.asmt_created_at),
  updatedAt: toIsoString(row.asmt_updated_at),
  deletedAt: toIsoString(row.asmt_deleted_at),
  translation: mapTranslation(row)
});

// ─── Assessment CRUD ──────────────────────────────────────────

export interface ListResult {
  rows: AssessmentDto[];
  meta: PaginationMeta;
}

export const listAssessments = async (
  q: ListAssessmentsQuery
): Promise<ListResult> => {
  const { rows, totalCount } = await db.callTableFunction<AssessmentRow>(
    'udf_get_assessments',
    {
      p_id: null,
      p_assessment_id: null,
      p_language_id: q.languageId ?? null,
      p_filter_assessment_type: q.assessmentType ?? null,
      p_filter_assessment_scope: q.assessmentScope ?? null,
      p_filter_content_type: q.contentType ?? null,
      p_filter_difficulty_level: q.difficultyLevel ?? null,
      p_filter_chapter_id: q.chapterId ?? null,
      p_filter_module_id: q.moduleId ?? null,
      p_filter_course_id: q.courseId ?? null,
      p_filter_is_mandatory: q.isMandatory ?? null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? false,
      p_search_query: q.searchTerm ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapRow),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getAssessmentById = async (
  id: number
): Promise<AssessmentDto | null> => {
  const { rows } = await db.callTableFunction<AssessmentRow>(
    'udf_get_assessments',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapRow(row) : null;
};

export const createAssessment = async (
  body: CreateAssessmentBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_assessments', {
    p_assessment_type: body.assessmentType,
    p_assessment_scope: body.assessmentScope,
    p_chapter_id: body.chapterId ?? null,
    p_module_id: body.moduleId ?? null,
    p_course_id: body.courseId ?? null,
    p_content_type: body.contentType,
    p_code: body.code ?? null,
    p_points: body.points ?? null,
    p_difficulty_level: body.difficultyLevel ?? null,
    p_due_days: body.dueDays ?? null,
    p_estimated_hours: body.estimatedHours ?? null,
    p_is_mandatory: body.isMandatory ?? null,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_created_by: callerId
  });
  return { id: Number(result.id) };
};

export const updateAssessment = async (
  id: number,
  body: UpdateAssessmentBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_assessments', {
    p_id: id,
    p_assessment_type: body.assessmentType ?? null,
    p_content_type: body.contentType ?? null,
    p_code: body.code ?? null,
    p_points: body.points ?? null,
    p_difficulty_level: body.difficultyLevel ?? null,
    p_due_days: body.dueDays ?? null,
    p_estimated_hours: body.estimatedHours ?? null,
    p_is_mandatory: body.isMandatory ?? null,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_updated_by: callerId
  });
};

export const deleteAssessment = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_assessments', {
    p_id: id,
    p_deleted_by: callerId
  });
};

export const restoreAssessment = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_assessments', {
    p_id: id,
    p_restore_children: true,
    p_restored_by: callerId
  });
};

// ─── Assessment Translation CRUD ───────────────────────────────

export interface ListTranslationsResult {
  rows: AssessmentDto[];
  meta: PaginationMeta;
}

export const listAssessmentTranslations = async (
  assessmentId: number,
  q: ListAssessmentTranslationsQuery
): Promise<ListTranslationsResult> => {
  const { rows, totalCount } = await db.callTableFunction<AssessmentRow>(
    'udf_get_assessments',
    {
      p_id: null,
      p_assessment_id: assessmentId,
      p_language_id: q.languageId ?? null,
      p_filter_assessment_type: null,
      p_filter_assessment_scope: null,
      p_filter_content_type: null,
      p_filter_difficulty_level: null,
      p_filter_chapter_id: null,
      p_filter_module_id: null,
      p_filter_course_id: null,
      p_filter_is_mandatory: null,
      p_filter_is_active: q.isActive ?? null,
      p_filter_is_deleted: q.isDeleted ?? false,
      p_search_query: q.searchTerm ?? null,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapRow),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

export const getAssessmentTranslationById = async (
  id: number
): Promise<AssessmentDto | null> => {
  // Query the view directly — udf_get_assessments filters by assessment_id, not translation_id.
  const result = await db.query<AssessmentRow>(
    'SELECT *, COUNT(*) OVER()::INT AS total_count FROM uv_assessment_translations WHERE asmt_trans_id = $1 LIMIT 1',
    [id]
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
};

export const createAssessmentTranslation = async (
  assessmentId: number,
  body: CreateAssessmentTranslationBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_assessment_translations', {
    p_assessment_id: assessmentId,
    p_language_id: body.languageId,
    p_title: body.title,
    p_description: body.description ?? null,
    p_instructions: body.instructions ?? null,
    p_tech_stack: body.techStack ?? null,
    p_learning_outcomes: body.learningOutcomes ?? null,
    p_image_1: body.image1 ?? null,
    p_image_2: body.image2 ?? null,
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

export const updateAssessmentTranslation = async (
  id: number,
  body: UpdateAssessmentTranslationBody,
  _callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_assessment_translations', {
    p_id: id,
    p_title: body.title ?? null,
    p_description: body.description !== undefined ? (body.description ?? '') : null,
    p_instructions: body.instructions !== undefined ? (body.instructions ?? '') : null,
    p_tech_stack: body.techStack ?? null,
    p_learning_outcomes: body.learningOutcomes ?? null,
    p_image_1: body.image1 !== undefined ? (body.image1 ?? '') : null,
    p_image_2: body.image2 !== undefined ? (body.image2 ?? '') : null,
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
    p_twitter_card: body.twitterCard ?? null,
    p_robots_directive: body.robotsDirective ?? null,
    p_focus_keyword: body.focusKeyword !== undefined ? (body.focusKeyword ?? '') : null,
    p_structured_data: body.structuredData ?? null,
    p_is_active: body.isActive ?? null
  });
};

export const deleteAssessmentTranslation = async (
  id: number,
  _callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_assessment_translations', { p_id: id });
};

export const restoreAssessmentTranslation = async (
  id: number,
  _callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_assessment_translations', { p_id: id });
};
