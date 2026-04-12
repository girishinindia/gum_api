// ═══════════════════════════════════════════════════════════════
// mcq-question-translations.service — UDF wrappers
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';

import type {
  CreateMcqQuestionTranslationBody,
  UpdateMcqQuestionTranslationBody
} from './mcq-question-translations.schemas';

// ─── CRUD ──────────────────────────────────────────────────────

export const createMcqQuestionTranslation = async (
  body: CreateMcqQuestionTranslationBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_mcq_question_translations', {
    p_mcq_question_id: body.mcqQuestionId,
    p_language_id: body.languageId,
    p_question_text: body.questionText,
    p_explanation: body.explanation ?? null,
    p_hint: body.hint ?? null,
    p_image_1: body.image1 ?? null,
    p_image_2: body.image2 ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateMcqQuestionTranslation = async (
  id: number,
  body: UpdateMcqQuestionTranslationBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_mcq_question_translations', {
    p_id: id,
    p_question_text: body.questionText ?? null,
    p_explanation: body.explanation === null ? '' : (body.explanation ?? null),
    p_hint: body.hint === null ? '' : (body.hint ?? null),
    p_image_1: body.image1 === null ? '' : (body.image1 ?? null),
    p_image_2: body.image2 === null ? '' : (body.image2 ?? null),
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteMcqQuestionTranslation = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_mcq_question_translations', {
    p_id: id,
    p_actor_id: callerId
  });
};

export const restoreMcqQuestionTranslation = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_mcq_question_translations', {
    p_id: id,
    p_actor_id: callerId
  });
};
