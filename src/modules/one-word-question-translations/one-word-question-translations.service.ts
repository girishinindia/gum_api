import { db } from '../../database/db';
import type { CreateOneWordQuestionTranslationBody, UpdateOneWordQuestionTranslationBody } from './one-word-question-translations.schemas';

export const createOneWordQuestionTranslation = async (body: CreateOneWordQuestionTranslationBody, callerId: number | null): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_one_word_question_translations', {
    p_one_word_question_id: body.oneWordQuestionId, p_language_id: body.languageId,
    p_question_text: body.questionText, p_correct_answer: body.correctAnswer,
    p_explanation: body.explanation ?? null, p_hint: body.hint ?? null,
    p_image_1: body.image1 ?? null, p_image_2: body.image2 ?? null,
    p_is_active: body.isActive ?? null, p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateOneWordQuestionTranslation = async (id: number, body: UpdateOneWordQuestionTranslationBody, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_update_one_word_question_translations', {
    p_id: id, p_question_text: body.questionText ?? null,
    p_correct_answer: body.correctAnswer ?? null,
    p_explanation: body.explanation === null ? '' : (body.explanation ?? null),
    p_hint: body.hint === null ? '' : (body.hint ?? null),
    p_image_1: body.image1 === null ? '' : (body.image1 ?? null),
    p_image_2: body.image2 === null ? '' : (body.image2 ?? null),
    p_is_active: body.isActive ?? null, p_actor_id: callerId
  });
};

export const deleteOneWordQuestionTranslation = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_delete_one_word_question_translations', { p_id: id, p_actor_id: callerId });
};

export const restoreOneWordQuestionTranslation = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_restore_one_word_question_translations', { p_id: id, p_actor_id: callerId });
};
