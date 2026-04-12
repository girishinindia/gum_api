import { db } from '../../database/db';
import type { CreateMatchingPairTranslationBody, UpdateMatchingPairTranslationBody } from './matching-pair-translations.schemas';

export const createMatchingPairTranslation = async (body: CreateMatchingPairTranslationBody, callerId: number | null): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_matching_pair_translations', {
    p_matching_pair_id: body.matchingPairId,
    p_language_id: body.languageId,
    p_left_text: body.leftText,
    p_right_text: body.rightText,
    p_left_image: body.leftImage ?? null,
    p_right_image: body.rightImage ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateMatchingPairTranslation = async (id: number, body: UpdateMatchingPairTranslationBody, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_update_matching_pair_translations', {
    p_id: id,
    p_left_text: body.leftText ?? null,
    p_right_text: body.rightText ?? null,
    p_left_image: body.leftImage === null ? '' : (body.leftImage ?? null),
    p_right_image: body.rightImage === null ? '' : (body.rightImage ?? null),
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteMatchingPairTranslation = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_delete_matching_pair_translations', { p_id: id, p_actor_id: callerId });
};

export const restoreMatchingPairTranslation = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_restore_matching_pair_translations', { p_id: id, p_actor_id: callerId });
};
