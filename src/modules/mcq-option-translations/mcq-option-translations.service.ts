// ═══════════════════════════════════════════════════════════════
// mcq-option-translations.service — UDF wrappers
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';

import type {
  CreateMcqOptionTranslationBody,
  UpdateMcqOptionTranslationBody
} from './mcq-option-translations.schemas';

// ─── CRUD ──────────────────────────────────────────────────────

export const createMcqOptionTranslation = async (
  body: CreateMcqOptionTranslationBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_mcq_option_translations', {
    p_mcq_option_id: body.mcqOptionId,
    p_language_id: body.languageId,
    p_option_text: body.optionText,
    p_image: body.image ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateMcqOptionTranslation = async (
  id: number,
  body: UpdateMcqOptionTranslationBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_mcq_option_translations', {
    p_id: id,
    p_option_text: body.optionText ?? null,
    p_image: body.image === null ? '' : (body.image ?? null),
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteMcqOptionTranslation = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_mcq_option_translations', {
    p_id: id,
    p_actor_id: callerId
  });
};

export const restoreMcqOptionTranslation = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_mcq_option_translations', {
    p_id: id,
    p_actor_id: callerId
  });
};
