// ═══════════════════════════════════════════════════════════════
// ordering-questions.service — UDF wrappers
// GET uses 0-based p_page_index. API accepts 1-based pageIndex.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateOrderingQuestionBody,
  ListOrderingQuestionsQuery,
  UpdateOrderingQuestionBody
} from './ordering-questions.schemas';

// ─── DTOs ────────────────────────────────────────────────────────

export interface OrderingQuestionDto {
  translationId: number;
  orderingQuestionId: number;
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

interface OrderingQuestionRow {
  oqt_id: number | string;
  oqt_ordering_question_id: number | string;
  oqt_language_id: number | string;
  oqt_question_text: string;
  oqt_explanation: string | null;
  oqt_hint: string | null;
  oqt_image_1: string | null;
  oqt_image_2: string | null;
  oqt_is_active: boolean;
  oqt_created_at: Date | string | null;
  oqt_updated_at: Date | string | null;
  oq_id: number | string;
  oq_topic_id: number | string;
  oq_code: string | null;
  oq_slug: string | null;
  oq_points: number | string;
  oq_partial_scoring: boolean;
  oq_display_order: number | string;
  oq_difficulty_level: string;
  oq_is_mandatory: boolean;
  oq_created_by: number | string | null;
  oq_updated_by: number | string | null;
  oq_is_active: boolean;
  oq_created_at: Date | string | null;
  oq_updated_at: Date | string | null;
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

const mapRow = (row: OrderingQuestionRow): OrderingQuestionDto => ({
  translationId: Number(row.oqt_id),
  orderingQuestionId: Number(row.oqt_ordering_question_id),
  languageId: Number(row.oqt_language_id),
  questionText: row.oqt_question_text,
  explanation: row.oqt_explanation,
  hint: row.oqt_hint,
  image1: row.oqt_image_1,
  image2: row.oqt_image_2,
  translationIsActive: row.oqt_is_active,
  translationCreatedAt: toIso(row.oqt_created_at),
  translationUpdatedAt: toIso(row.oqt_updated_at),
  questionId: Number(row.oq_id),
  topicId: Number(row.oq_topic_id),
  code: row.oq_code,
  slug: row.oq_slug,
  points: Number(row.oq_points),
  partialScoring: row.oq_partial_scoring,
  displayOrder: Number(row.oq_display_order),
  difficultyLevel: row.oq_difficulty_level,
  isMandatory: row.oq_is_mandatory,
  createdBy: row.oq_created_by != null ? Number(row.oq_created_by) : null,
  updatedBy: row.oq_updated_by != null ? Number(row.oq_updated_by) : null,
  questionIsActive: row.oq_is_active,
  questionCreatedAt: toIso(row.oq_created_at),
  questionUpdatedAt: toIso(row.oq_updated_at),
  langId: row.lang_id != null ? Number(row.lang_id) : null,
  langCode: row.lang_code,
  langName: row.lang_name
});

// ─── CRUD ──────────────────────────────────────────────────────

export interface ListResult {
  rows: OrderingQuestionDto[];
  meta: PaginationMeta;
}

export const listOrderingQuestions = async (
  q: ListOrderingQuestionsQuery
): Promise<ListResult> => {
  const { rows, totalCount } = await db.callTableFunction<OrderingQuestionRow>(
    'udf_get_ordering_questions',
    {
      p_id: null,
      p_ordering_question_id: q.orderingQuestionId ?? null,
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

export const getOrderingQuestionById = async (
  id: number
): Promise<OrderingQuestionDto | null> => {
  const { rows } = await db.callTableFunction<OrderingQuestionRow>(
    'udf_get_ordering_questions',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapRow(row) : null;
};

export const createOrderingQuestion = async (
  body: CreateOrderingQuestionBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_ordering_questions', {
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

export const updateOrderingQuestion = async (
  id: number,
  body: UpdateOrderingQuestionBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_ordering_questions', {
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

export const deleteOrderingQuestion = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_ordering_questions', {
    p_id: id,
    p_actor_id: callerId
  });
};

export const restoreOrderingQuestion = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_ordering_questions', {
    p_id: id,
    p_actor_id: callerId
  });
};
