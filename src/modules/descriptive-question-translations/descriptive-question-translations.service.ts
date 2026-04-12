import { db } from '../../database/db';
import type {
  CreateDescriptiveQuestionTranslationBody,
  UpdateDescriptiveQuestionTranslationBody
} from './descriptive-question-translations.schemas';

export const createDescriptiveQuestionTranslation = async (
  body: CreateDescriptiveQuestionTranslationBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_descriptive_question_translations', {
    p_descriptive_question_id: body.descriptiveQuestionId,
    p_language_id: body.languageId,
    p_question_text: body.questionText,
    p_explanation: body.explanation ?? null,
    p_hint: body.hint ?? null,
    p_model_answer: body.modelAnswer ?? null,
    p_question_image_1: body.questionImage1 ?? null,
    p_question_image_2: body.questionImage2 ?? null,
    p_question_image_3: body.questionImage3 ?? null,
    p_answer_image_1: body.answerImage1 ?? null,
    p_answer_image_2: body.answerImage2 ?? null,
    p_answer_image_3: body.answerImage3 ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateDescriptiveQuestionTranslation = async (
  id: number,
  body: UpdateDescriptiveQuestionTranslationBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_descriptive_question_translations', {
    p_id: id,
    p_question_text: body.questionText ?? null,
    p_explanation: body.explanation === null ? '' : (body.explanation ?? null),
    p_hint: body.hint === null ? '' : (body.hint ?? null),
    p_model_answer: body.modelAnswer === null ? '' : (body.modelAnswer ?? null),
    p_question_image_1: body.questionImage1 === null ? '' : (body.questionImage1 ?? null),
    p_question_image_2: body.questionImage2 === null ? '' : (body.questionImage2 ?? null),
    p_question_image_3: body.questionImage3 === null ? '' : (body.questionImage3 ?? null),
    p_answer_image_1: body.answerImage1 === null ? '' : (body.answerImage1 ?? null),
    p_answer_image_2: body.answerImage2 === null ? '' : (body.answerImage2 ?? null),
    p_answer_image_3: body.answerImage3 === null ? '' : (body.answerImage3 ?? null),
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteDescriptiveQuestionTranslation = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_descriptive_question_translations', {
    p_id: id,
    p_actor_id: callerId
  });
};

export const restoreDescriptiveQuestionTranslation = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_descriptive_question_translations', {
    p_id: id,
    p_actor_id: callerId
  });
};
