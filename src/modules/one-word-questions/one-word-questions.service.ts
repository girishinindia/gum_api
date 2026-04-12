// ═══════════════════════════════════════════════════════════════
// one-word-questions.service — UDF wrappers
// GET uses 0-based p_page_index. API accepts 1-based pageIndex.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateOneWordQuestionBody,
  ListOneWordQuestionsQuery,
  UpdateOneWordQuestionBody
} from './one-word-questions.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface OneWordQuestionDto {
  translationId: number;
  oneWordQuestionId: number;
  languageId: number;
  questionText: string;
  explanation: string | null;
  hint: string | null;
  correctAnswer: string;
  image1: string | null;
  image2: string | null;
  translationIsActive: boolean;
  translationCreatedAt: string | null;
  translationUpdatedAt: string | null;
  questionId: number;
  topicId: number;
  questionType: string;
  code: string | null;
  slug: string | null;
  points: number;
  isCaseSensitive: boolean;
  isTrimWhitespace: boolean;
  displayOrder: number;
  difficultyLevel: string;
  isMandatory: boolean;
  createdBy: number | null;
  questionIsActive: boolean;
  questionCreatedAt: string | null;
  questionUpdatedAt: string | null;
  langId: number | null;
  langCode: string | null;
  langName: string | null;
}

// ─── Internal Row Interface ────────────────────────────────────

interface OneWordQuestionRow {
  owqt_id: number | string;
  owqt_one_word_question_id: number | string;
  owqt_language_id: number | string;
  owqt_question_text: string;
  owqt_explanation: string | null;
  owqt_hint: string | null;
  owqt_correct_answer: string;
  owqt_image_1: string | null;
  owqt_image_2: string | null;
  owqt_is_active: boolean;
  owqt_created_at: Date | string | null;
  owqt_updated_at: Date | string | null;
  owq_id: number | string;
  owq_topic_id: number | string;
  owq_question_type: string;
  owq_code: string | null;
  owq_slug: string | null;
  owq_points: number | string;
  owq_is_case_sensitive: boolean;
  owq_is_trim_whitespace: boolean;
  owq_display_order: number | string;
  owq_difficulty_level: string;
  owq_is_mandatory: boolean;
  owq_created_by: number | string | null;
  owq_is_active: boolean;
  owq_created_at: Date | string | null;
  owq_updated_at: Date | string | null;
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

const mapRow = (row: OneWordQuestionRow): OneWordQuestionDto => ({
  translationId: Number(row.owqt_id),
  oneWordQuestionId: Number(row.owqt_one_word_question_id),
  languageId: Number(row.owqt_language_id),
  questionText: row.owqt_question_text,
  explanation: row.owqt_explanation,
  hint: row.owqt_hint,
  correctAnswer: row.owqt_correct_answer,
  image1: row.owqt_image_1,
  image2: row.owqt_image_2,
  translationIsActive: row.owqt_is_active,
  translationCreatedAt: toIso(row.owqt_created_at),
  translationUpdatedAt: toIso(row.owqt_updated_at),
  questionId: Number(row.owq_id),
  topicId: Number(row.owq_topic_id),
  questionType: row.owq_question_type,
  code: row.owq_code,
  slug: row.owq_slug,
  points: Number(row.owq_points),
  isCaseSensitive: row.owq_is_case_sensitive,
  isTrimWhitespace: row.owq_is_trim_whitespace,
  displayOrder: Number(row.owq_display_order),
  difficultyLevel: row.owq_difficulty_level,
  isMandatory: row.owq_is_mandatory,
  createdBy: row.owq_created_by != null ? Number(row.owq_created_by) : null,
  questionIsActive: row.owq_is_active,
  questionCreatedAt: toIso(row.owq_created_at),
  questionUpdatedAt: toIso(row.owq_updated_at),
  langId: row.lang_id != null ? Number(row.lang_id) : null,
  langCode: row.lang_code,
  langName: row.lang_name
});

// ─── CRUD ──────────────────────────────────────────────────────

export interface ListResult {
  rows: OneWordQuestionDto[];
  meta: PaginationMeta;
}

export const listOneWordQuestions = async (
  q: ListOneWordQuestionsQuery
): Promise<ListResult> => {
  const { rows, totalCount } = await db.callTableFunction<OneWordQuestionRow>(
    'udf_get_one_word_questions',
    {
      p_id: null,
      p_one_word_question_id: q.oneWordQuestionId ?? null,
      p_language_id: q.languageId ?? null,
      p_is_active: q.isActive ?? null,
      p_filter_topic_id: q.topicId ?? null,
      p_filter_question_type: q.questionType ?? null,
      p_filter_difficulty_level: q.difficultyLevel ?? null,
      p_filter_is_mandatory: q.isMandatory ?? null,
      p_filter_is_case_sensitive: q.isCaseSensitive ?? null,
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

export const getOneWordQuestionById = async (
  id: number
): Promise<OneWordQuestionDto | null> => {
  const { rows } = await db.callTableFunction<OneWordQuestionRow>(
    'udf_get_one_word_questions',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapRow(row) : null;
};

export const createOneWordQuestion = async (
  body: CreateOneWordQuestionBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_one_word_questions', {
    p_topic_id: body.topicId,
    p_question_type: body.questionType ?? null,
    p_code: body.code ?? null,
    p_points: body.points ?? null,
    p_is_case_sensitive: body.isCaseSensitive ?? null,
    p_is_trim_whitespace: body.isTrimWhitespace ?? null,
    p_display_order: body.displayOrder ?? null,
    p_difficulty_level: body.difficultyLevel ?? null,
    p_is_mandatory: body.isMandatory ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateOneWordQuestion = async (
  id: number,
  body: UpdateOneWordQuestionBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_one_word_questions', {
    p_id: id,
    p_topic_id: body.topicId ?? null,
    p_question_type: body.questionType ?? null,
    p_code: body.code === null ? '' : (body.code ?? null),
    p_points: body.points ?? null,
    p_is_case_sensitive: body.isCaseSensitive ?? null,
    p_is_trim_whitespace: body.isTrimWhitespace ?? null,
    p_display_order: body.displayOrder ?? null,
    p_difficulty_level: body.difficultyLevel ?? null,
    p_is_mandatory: body.isMandatory ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteOneWordQuestion = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_one_word_questions', {
    p_id: id,
    p_actor_id: callerId
  });
};

export const restoreOneWordQuestion = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_one_word_questions', {
    p_id: id,
    p_actor_id: callerId
  });
};
