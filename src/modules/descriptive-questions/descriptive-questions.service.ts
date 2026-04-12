// ═══════════════════════════════════════════════════════════════
// descriptive-questions.service — UDF wrappers
// GET uses 0-based p_page_index. API accepts 1-based pageIndex.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateDescriptiveQuestionBody,
  ListDescriptiveQuestionsQuery,
  UpdateDescriptiveQuestionBody
} from './descriptive-questions.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface DescriptiveQuestionDto {
  translationId: number;
  descriptiveQuestionId: number;
  languageId: number;
  questionText: string;
  explanation: string | null;
  hint: string | null;
  modelAnswer: string | null;
  questionImage1: string | null;
  questionImage2: string | null;
  questionImage3: string | null;
  answerImage1: string | null;
  answerImage2: string | null;
  answerImage3: string | null;
  translationIsActive: boolean;
  translationCreatedAt: string | null;
  translationUpdatedAt: string | null;
  questionId: number;
  topicId: number;
  answerType: string;
  code: string | null;
  slug: string | null;
  points: number;
  minWords: number | null;
  maxWords: number | null;
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

interface DescriptiveQuestionRow {
  dqt_id: number | string;
  dqt_descriptive_question_id: number | string;
  dqt_language_id: number | string;
  dqt_question_text: string;
  dqt_explanation: string | null;
  dqt_hint: string | null;
  dqt_model_answer: string | null;
  dqt_question_image_1: string | null;
  dqt_question_image_2: string | null;
  dqt_question_image_3: string | null;
  dqt_answer_image_1: string | null;
  dqt_answer_image_2: string | null;
  dqt_answer_image_3: string | null;
  dqt_is_active: boolean;
  dqt_created_at: Date | string | null;
  dqt_updated_at: Date | string | null;
  dq_id: number | string;
  dq_topic_id: number | string;
  dq_answer_type: string;
  dq_code: string | null;
  dq_slug: string | null;
  dq_points: number | string;
  dq_min_words: number | string | null;
  dq_max_words: number | string | null;
  dq_display_order: number | string;
  dq_difficulty_level: string;
  dq_is_mandatory: boolean;
  dq_created_by: number | string | null;
  dq_updated_by: number | string | null;
  dq_is_active: boolean;
  dq_created_at: Date | string | null;
  dq_updated_at: Date | string | null;
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

const mapRow = (row: DescriptiveQuestionRow): DescriptiveQuestionDto => ({
  translationId: Number(row.dqt_id),
  descriptiveQuestionId: Number(row.dqt_descriptive_question_id),
  languageId: Number(row.dqt_language_id),
  questionText: row.dqt_question_text,
  explanation: row.dqt_explanation,
  hint: row.dqt_hint,
  modelAnswer: row.dqt_model_answer,
  questionImage1: row.dqt_question_image_1,
  questionImage2: row.dqt_question_image_2,
  questionImage3: row.dqt_question_image_3,
  answerImage1: row.dqt_answer_image_1,
  answerImage2: row.dqt_answer_image_2,
  answerImage3: row.dqt_answer_image_3,
  translationIsActive: row.dqt_is_active,
  translationCreatedAt: toIso(row.dqt_created_at),
  translationUpdatedAt: toIso(row.dqt_updated_at),
  questionId: Number(row.dq_id),
  topicId: Number(row.dq_topic_id),
  answerType: row.dq_answer_type,
  code: row.dq_code,
  slug: row.dq_slug,
  points: Number(row.dq_points),
  minWords: row.dq_min_words != null ? Number(row.dq_min_words) : null,
  maxWords: row.dq_max_words != null ? Number(row.dq_max_words) : null,
  displayOrder: Number(row.dq_display_order),
  difficultyLevel: row.dq_difficulty_level,
  isMandatory: row.dq_is_mandatory,
  createdBy: row.dq_created_by != null ? Number(row.dq_created_by) : null,
  updatedBy: row.dq_updated_by != null ? Number(row.dq_updated_by) : null,
  questionIsActive: row.dq_is_active,
  questionCreatedAt: toIso(row.dq_created_at),
  questionUpdatedAt: toIso(row.dq_updated_at),
  langId: row.lang_id != null ? Number(row.lang_id) : null,
  langCode: row.lang_code,
  langName: row.lang_name
});

// ─── CRUD ──────────────────────────────────────────────────────

export interface ListResult {
  rows: DescriptiveQuestionDto[];
  meta: PaginationMeta;
}

export const listDescriptiveQuestions = async (
  q: ListDescriptiveQuestionsQuery
): Promise<ListResult> => {
  const { rows, totalCount } = await db.callTableFunction<DescriptiveQuestionRow>(
    'udf_get_descriptive_questions',
    {
      p_id: null,
      p_descriptive_question_id: q.descriptiveQuestionId ?? null,
      p_language_id: q.languageId ?? null,
      p_is_active: q.isActive ?? null,
      p_filter_topic_id: q.topicId ?? null,
      p_filter_answer_type: q.answerType ?? null,
      p_filter_difficulty_level: q.difficultyLevel ?? null,
      p_filter_is_mandatory: q.isMandatory ?? null,
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

export const getDescriptiveQuestionById = async (
  id: number
): Promise<DescriptiveQuestionDto | null> => {
  const { rows } = await db.callTableFunction<DescriptiveQuestionRow>(
    'udf_get_descriptive_questions',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapRow(row) : null;
};

export const createDescriptiveQuestion = async (
  body: CreateDescriptiveQuestionBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_descriptive_questions', {
    p_topic_id: body.topicId,
    p_answer_type: body.answerType ?? null,
    p_code: body.code ?? null,
    p_points: body.points ?? null,
    p_min_words: body.minWords ?? null,
    p_max_words: body.maxWords ?? null,
    p_display_order: body.displayOrder ?? null,
    p_difficulty_level: body.difficultyLevel ?? null,
    p_is_mandatory: body.isMandatory ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateDescriptiveQuestion = async (
  id: number,
  body: UpdateDescriptiveQuestionBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_descriptive_questions', {
    p_id: id,
    p_topic_id: body.topicId ?? null,
    p_answer_type: body.answerType ?? null,
    p_code: body.code === null ? '' : (body.code ?? null),
    p_points: body.points ?? null,
    p_min_words: body.minWords === null ? -1 : (body.minWords ?? null),
    p_max_words: body.maxWords === null ? -1 : (body.maxWords ?? null),
    p_display_order: body.displayOrder ?? null,
    p_difficulty_level: body.difficultyLevel ?? null,
    p_is_mandatory: body.isMandatory ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteDescriptiveQuestion = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_descriptive_questions', {
    p_id: id,
    p_actor_id: callerId
  });
};

export const restoreDescriptiveQuestion = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_descriptive_questions', {
    p_id: id,
    p_actor_id: callerId
  });
};
