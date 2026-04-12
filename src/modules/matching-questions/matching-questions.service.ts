// ═══════════════════════════════════════════════════════════════
// matching-questions.service — UDF wrappers
// GET uses 0-based p_page_index. API accepts 1-based pageIndex.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateMatchingQuestionBody,
  ListMatchingQuestionsQuery,
  UpdateMatchingQuestionBody
} from './matching-questions.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface MatchingQuestionDto {
  translationId: number;
  matchingQuestionId: number;
  languageId: number;
  questionText: string;
  explanation: string | null;
  hint: string | null;
  image1: string | null;
  image2: string | null;
  translationIsActive: boolean;
  translationCreatedAt: string | null;
  translationUpdatedAt: string | null;
  questionId: number;
  topicId: number;
  code: string | null;
  slug: string | null;
  points: number;
  partialScoring: boolean;
  displayOrder: number;
  difficultyLevel: string;
  isMandatory: boolean;
  createdBy: number | null;
  updatedBy: number | null;
  questionIsActive: boolean;
  questionCreatedAt: string | null;
  questionUpdatedAt: string | null;
  langId: number | null;
  langCode: string | null;
  langName: string | null;
}

// ─── Internal Row Interface ────────────────────────────────────

interface MatchingQuestionRow {
  mqt_id: number | string;
  mqt_matching_question_id: number | string;
  mqt_language_id: number | string;
  mqt_question_text: string;
  mqt_explanation: string | null;
  mqt_hint: string | null;
  mqt_image_1: string | null;
  mqt_image_2: string | null;
  mqt_is_active: boolean;
  mqt_created_at: Date | string | null;
  mqt_updated_at: Date | string | null;
  mq_id: number | string;
  mq_topic_id: number | string;
  mq_code: string | null;
  mq_slug: string | null;
  mq_points: number | string;
  mq_partial_scoring: boolean;
  mq_display_order: number | string;
  mq_difficulty_level: string;
  mq_is_mandatory: boolean;
  mq_created_by: number | string | null;
  mq_updated_by: number | string | null;
  mq_is_active: boolean;
  mq_created_at: Date | string | null;
  mq_updated_at: Date | string | null;
  lang_id: number | string | null;
  lang_code: string | null;
  lang_name: string | null;
  total_count?: number | string;
}

// ─── Mapper ────────────────────────────────────────────────────

const toIso = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapRow = (row: MatchingQuestionRow): MatchingQuestionDto => ({
  translationId: Number(row.mqt_id),
  matchingQuestionId: Number(row.mqt_matching_question_id),
  languageId: Number(row.mqt_language_id),
  questionText: row.mqt_question_text,
  explanation: row.mqt_explanation,
  hint: row.mqt_hint,
  image1: row.mqt_image_1,
  image2: row.mqt_image_2,
  translationIsActive: row.mqt_is_active,
  translationCreatedAt: toIso(row.mqt_created_at),
  translationUpdatedAt: toIso(row.mqt_updated_at),
  questionId: Number(row.mq_id),
  topicId: Number(row.mq_topic_id),
  code: row.mq_code,
  slug: row.mq_slug,
  points: Number(row.mq_points),
  partialScoring: row.mq_partial_scoring,
  displayOrder: Number(row.mq_display_order),
  difficultyLevel: row.mq_difficulty_level,
  isMandatory: row.mq_is_mandatory,
  createdBy: row.mq_created_by != null ? Number(row.mq_created_by) : null,
  updatedBy: row.mq_updated_by != null ? Number(row.mq_updated_by) : null,
  questionIsActive: row.mq_is_active,
  questionCreatedAt: toIso(row.mq_created_at),
  questionUpdatedAt: toIso(row.mq_updated_at),
  langId: row.lang_id != null ? Number(row.lang_id) : null,
  langCode: row.lang_code,
  langName: row.lang_name
});

// ─── CRUD ──────────────────────────────────────────────────────

export interface ListResult {
  rows: MatchingQuestionDto[];
  meta: PaginationMeta;
}

export const listMatchingQuestions = async (
  q: ListMatchingQuestionsQuery
): Promise<ListResult> => {
  const { rows, totalCount } = await db.callTableFunction<MatchingQuestionRow>(
    'udf_get_matching_questions',
    {
      p_id: null,
      p_matching_question_id: q.matchingQuestionId ?? null,
      p_language_id: q.languageId ?? null,
      p_is_active: q.isActive ?? null,
      p_filter_topic_id: q.topicId ?? null,
      p_filter_difficulty_level: q.difficultyLevel ?? null,
      p_filter_is_mandatory: q.isMandatory ?? null,
      p_filter_partial_scoring: q.partialScoring ?? null,
      p_filter_is_active: q.filterIsActive ?? null,
      p_filter_is_deleted: false,
      p_search_text: q.searchTerm ?? null,
      p_sort_table: q.sortTable,
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_page_index: q.pageIndex - 1,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapRow),
    meta: buildPaginationMeta(q.pageIndex - 1, q.pageSize, totalCount)
  };
};

export const getMatchingQuestionById = async (
  id: number
): Promise<MatchingQuestionDto | null> => {
  const { rows } = await db.callTableFunction<MatchingQuestionRow>(
    'udf_get_matching_questions',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapRow(row) : null;
};

export const createMatchingQuestion = async (
  body: CreateMatchingQuestionBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_matching_questions', {
    p_topic_id: body.topicId,
    p_code: body.code ?? null,
    p_points: body.points ?? null,
    p_partial_scoring: body.partialScoring ?? null,
    p_display_order: body.displayOrder ?? null,
    p_difficulty_level: body.difficultyLevel ?? null,
    p_is_mandatory: body.isMandatory ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateMatchingQuestion = async (
  id: number,
  body: UpdateMatchingQuestionBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_matching_questions', {
    p_id: id,
    p_topic_id: body.topicId ?? null,
    p_code: body.code === null ? '' : (body.code ?? null),
    p_points: body.points ?? null,
    p_partial_scoring: body.partialScoring ?? null,
    p_display_order: body.displayOrder ?? null,
    p_difficulty_level: body.difficultyLevel ?? null,
    p_is_mandatory: body.isMandatory ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteMatchingQuestion = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_matching_questions', {
    p_id: id,
    p_actor_id: callerId
  });
};

export const restoreMatchingQuestion = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_matching_questions', {
    p_id: id,
    p_actor_id: callerId
  });
};
