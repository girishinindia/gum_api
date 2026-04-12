import { db } from '../../database/db';
import type { CreateOneWordSynonymBody, UpdateOneWordSynonymBody } from './one-word-synonyms.schemas';

export const createOneWordSynonym = async (body: CreateOneWordSynonymBody, callerId: number | null): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_one_word_synonyms', {
    p_one_word_question_id: body.oneWordQuestionId,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null, p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateOneWordSynonym = async (id: number, body: UpdateOneWordSynonymBody, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_update_one_word_synonyms', {
    p_id: id, p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null, p_actor_id: callerId
  });
};

export const deleteOneWordSynonym = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_delete_one_word_synonyms', { p_id: id, p_actor_id: callerId });
};

export const restoreOneWordSynonym = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_restore_one_word_synonyms', { p_id: id, p_actor_id: callerId });
};
