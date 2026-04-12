import { db } from '../../database/db';
import type { CreateOrderingItemBody, UpdateOrderingItemBody } from './ordering-items.schemas';

export const createOrderingItem = async (body: CreateOrderingItemBody, callerId: number | null): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_ordering_items', {
    p_ordering_question_id: body.orderingQuestionId,
    p_correct_position: body.correctPosition,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateOrderingItem = async (id: number, body: UpdateOrderingItemBody, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_update_ordering_items', {
    p_id: id,
    p_correct_position: body.correctPosition ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteOrderingItem = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_delete_ordering_items', { p_id: id, p_actor_id: callerId });
};

export const restoreOrderingItem = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_restore_ordering_items', { p_id: id, p_actor_id: callerId });
};
