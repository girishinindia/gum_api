// ═══════════════════════════════════════════════════════════════
// mcq-options.service — UDF wrappers
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';

import type {
  CreateMcqOptionBody,
  UpdateMcqOptionBody
} from './mcq-options.schemas';

// ─── CRUD ──────────────────────────────────────────────────────

export const createMcqOption = async (
  body: CreateMcqOptionBody,
  callerId: number | null
): Promise<{ id: number }> => {
  const result = await db.callFunction('udf_insert_mcq_options', {
    p_mcq_question_id: body.mcqQuestionId,
    p_is_correct: body.isCorrect ?? null,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
  return { id: Number(result.id) };
};

export const updateMcqOption = async (
  id: number,
  body: UpdateMcqOptionBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_mcq_options', {
    p_id: id,
    p_is_correct: body.isCorrect ?? null,
    p_display_order: body.displayOrder ?? null,
    p_is_active: body.isActive ?? null,
    p_actor_id: callerId
  });
};

export const deleteMcqOption = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_mcq_options', {
    p_id: id,
    p_actor_id: callerId
  });
};

export const restoreMcqOption = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_restore_mcq_options', {
    p_id: id,
    p_actor_id: callerId
  });
};
