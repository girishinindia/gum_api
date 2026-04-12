import { db } from '../../database/db';
import type { CreateMatchingPairBody, UpdateMatchingPairBody } from './matching-pairs.schemas';

export const createMatchingPair = async (body: CreateMatchingPairBody, callerId: number | null): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_matching_pairs', {
    p_matching_question_id: body.matchingQuestionId,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateMatchingPair = async (id: number, body: UpdateMatchingPairBody, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_update_matching_pairs', {
    p_id: id,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteMatchingPair = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_delete_matching_pairs', { p_id: id, p_actor_id: callerId });
};

export const restoreMatchingPair = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_restore_matching_pairs', { p_id: id, p_actor_id: callerId });
};
