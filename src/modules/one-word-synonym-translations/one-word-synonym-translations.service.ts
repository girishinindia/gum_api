import { db } from '../../database/db';
import type { CreateOneWordSynonymTranslationBody, UpdateOneWordSynonymTranslationBody } from './one-word-synonym-translations.schemas';

export const createOneWordSynonymTranslation = async (body: CreateOneWordSynonymTranslationBody, callerId: number | null): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_one_word_synonym_translations', {
    p_one_word_synonym_id: body.oneWordSynonymId, p_language_id: body.languageId,
    p_synonym_text: body.synonymText,
    p_is_active: body.isActive ?? null, p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateOneWordSynonymTranslation = async (id: number, body: UpdateOneWordSynonymTranslationBody, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_update_one_word_synonym_translations', {
    p_id: id, p_synonym_text: body.synonymText ?? null,
    p_is_active: body.isActive ?? null, p_actor_id: callerId
  });
};

export const deleteOneWordSynonymTranslation = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_delete_one_word_synonym_translations', { p_id: id, p_actor_id: callerId });
};

export const restoreOneWordSynonymTranslation = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_restore_one_word_synonym_translations', { p_id: id, p_actor_id: callerId });
};
