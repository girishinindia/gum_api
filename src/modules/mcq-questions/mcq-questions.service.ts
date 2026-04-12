// ═══════════════════════════════════════════════════════════════
// mcq-questions.service — UDF wrappers for /api/v1/mcq-questions
//
// GET function uses 0-based p_page_index internally.
// API accepts 1-based pageIndex → converted here.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateMcqQuestionBody,
  ListMcqQuestionsQuery,
  UpdateMcqQuestionBody
} from './mcq-questions.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface McqQuestionDto {
  translationId: number;
  mcqQuestionId: number;
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
  mcqType: string;
  code: string | null;
  slug: string | null;
  points: number;
  displayOrder: number;
  difficultyLevel: string;
  isMandatory: boolean;
  createdBy: number | null;
  updatedBy: number | null;
  questionIsActive: boolean;
  questionCreatedAt: string | null;
  questionUpdatedAt: string | null;
  langId: number | null;
  langName: string | null;
  langCode: string | null;
  langIsActive: boolean | null;
}

// ─── Internal Row Interface ────────────────────────────────────

interface McqQuestionRow {
  mcq_qt_id: number | string;
  mcq_qt_mcq_question_id: number | string;
  mcq_qt_language_id: number | string;
  mcq_qt_question_text: string;
  mcq_qt_explanation: string | null;
  mcq_qt_hint: string | null;
  mcq_qt_image_1: string | null;
  mcq_qt_image_2: string | null;
  mcq_qt_is_active: boolean;
  mcq_qt_created_at: Date | string | null;
  mcq_qt_updated_at: Date | string | null;
  mcq_q_id: number | string;
  mcq_q_topic_id: number | string;
  mcq_q_mcq_type: string;
  mcq_q_code: string | null;
  mcq_q_slug: string | null;
  mcq_q_points: number | string;
  mcq_q_display_order: number | string;
  mcq_q_difficulty_level: string;
  mcq_q_is_mandatory: boolean;
  mcq_q_created_by: number | string | null;
  mcq_q_updated_by: number | string | null;
  mcq_q_is_active: boolean;
  mcq_q_created_at: Date | string | null;
  mcq_q_updated_at: Date | string | null;
  lang_id: number | string | null;
  lang_name: string | null;
  lang_code: string | null;
  lang_is_active: boolean | null;
  total_count?: number | string;
}

// ─── Mapper ────────────────────────────────────────────────────

const toIsoString = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

const mapRow = (row: McqQuestionRow): McqQuestionDto => ({
  translationId: Number(row.mcq_qt_id),
  mcqQuestionId: Number(row.mcq_qt_mcq_question_id),
  languageId: Number(row.mcq_qt_language_id),
  questionText: row.mcq_qt_question_text,
  explanation: row.mcq_qt_explanation,
  hint: row.mcq_qt_hint,
  image1: row.mcq_qt_image_1,
  image2: row.mcq_qt_image_2,
  translationIsActive: row.mcq_qt_is_active,
  translationCreatedAt: toIsoString(row.mcq_qt_created_at),
  translationUpdatedAt: toIsoString(row.mcq_qt_updated_at),
  questionId: Number(row.mcq_q_id),
  topicId: Number(row.mcq_q_topic_id),
  mcqType: row.mcq_q_mcq_type,
  code: row.mcq_q_code,
  slug: row.mcq_q_slug,
  points: Number(row.mcq_q_points),
  displayOrder: Number(row.mcq_q_display_order),
  difficultyLevel: row.mcq_q_difficulty_level,
  isMandatory: row.mcq_q_is_mandatory,
  createdBy: row.mcq_q_created_by != null ? Number(row.mcq_q_created_by) : null,
  updatedBy: row.mcq_q_updated_by != null ? Number(row.mcq_q_updated_by) : null,
  questionIsActive: row.mcq_q_is_active,
  questionCreatedAt: toIsoString(row.mcq_q_created_at),
  questionUpdatedAt: toIsoString(row.mcq_q_updated_at),
  langId: row.lang_id != null ? Number(row.lang_id) : null,
  langName: row.lang_name,
  langCode: row.lang_code,
  langIsActive: row.lang_is_active
});

// ─── CRUD ──────────────────────────────────────────────────────

export interface ListResult {
  rows: McqQuestionDto[];
  meta: PaginationMeta;
}

export const listMcqQuestions = async (
  q: ListMcqQuestionsQuery
): Promise<ListResult> => {
  const { rows, totalCount } = await db.callTableFunction<McqQuestionRow>(
    'udf_get_mcq_questions',
    {
      p_id: null,
      p_mcq_question_id: q.mcqQuestionId ?? null,
      p_language_id: q.languageId ?? null,
      p_is_active: q.isActive ?? null,
      p_filter_topic_id: q.topicId ?? null,
      p_filter_mcq_type: q.mcqType ?? null,
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

export const getMcqQuestionById = async (
  id: number
): Promise<McqQuestionDto | null> => {
  const { rows } = await db.callTableFunction<McqQuestionRow>(
    'udf_get_mcq_questions',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapRow(row) : null;
};

export const createMcqQuestion = async (
  body: CreateMcqQuestionBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_mcq_questions', {
    p_topic_id: body.topicId,
    p_mcq_type: body.mcqType ?? null,
    p_code: body.code ?? null,
    p_points: body.points ?? null,
    p_display_order: body.displayOrder ?? null,
    p_difficulty_level: body.difficultyLevel ?? null,
    p_is_mandatory: body.isMandatory ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateMcqQuestion = async (
  id: number,
  body: UpdateMcqQuestionBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_mcq_questions', {
    p_id: id,
    p_topic_id: body.topicId ?? null,
    p_mcq_type: body.mcqType ?? null,
    p_code: body.code === null ? '' : (body.code ?? null),
    p_points: body.points ?? null,
    p_display_order: body.displayOrder ?? null,
    p_difficulty_level: body.difficultyLevel ?? null,
    p_is_mandatory: body.isMandatory ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteMcqQuestion = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_mcq_questions', {
    p_id: id,
    p_actor_id: callerId
  });
};

export const restoreMcqQuestion = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_mcq_questions', {
    p_id: id,
    p_actor_id: callerId
  });
};
