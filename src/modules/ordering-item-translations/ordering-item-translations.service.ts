import { db } from '../../database/db';
import type { CreateOrderingItemTranslationBody, UpdateOrderingItemTranslationBody } from './ordering-item-translations.schemas';

export const createOrderingItemTranslation = async (body: CreateOrderingItemTranslationBody, callerId: number | null): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_ordering_item_translations', {
    p_ordering_item_id: body.orderingItemId,
    p_language_id: body.languageId,
    p_item_text: body.itemText,
    p_image: body.image ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateOrderingItemTranslation = async (id: number, body: UpdateOrderingItemTranslationBody, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_update_ordering_item_translations', {
    p_id: id,
    p_item_text: body.itemText ?? null,
    p_image: body.image === null ? '' : (body.image ?? null),
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteOrderingItemTranslation = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_delete_ordering_item_translations', { p_id: id, p_actor_id: callerId });
};

export const restoreOrderingItemTranslation = async (id: number, callerId: number | null): Promise<void> => {
  await db.callFunction('udf_restore_ordering_item_translations', { p_id: id, p_actor_id: callerId });
};
