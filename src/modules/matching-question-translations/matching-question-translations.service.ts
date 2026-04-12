import { db } from '../../database/db';
import type {
  CreateMatchingQuestionTranslationBody,
  UpdateMatchingQuestionTranslationBody
} from './matching-question-translations.schemas';

export const createMatchingQuestionTranslation = async (
  body: CreateMatchingQuestionTranslationBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_matching_question_translations', {
    p_matching_question_id: body.matchingQuestionId,
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

export const updateMatchingQuestionTranslation = async (
  id: number,
  body: UpdateMatchingQuestionTranslationBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_matching_question_translations', {
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

export const deleteMatchingQuestionTranslation = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_matching_question_translations', {
    p_id: id,
    p_actor_id: callerId
  });
};

export const restoreMatchingQuestionTranslation = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_matching_question_translations', {
    p_id: id,
    p_actor_id: callerId
  });
};
