// ═══════════════════════════════════════════════════════════════
// /api/v1/mcq-question-translations router — phase 10.
//
// Authorization model:
//   POST   /              mcq_question_translation.create
//   PATCH  /:id           mcq_question_translation.update
//   DELETE /:id           mcq_question_translation.delete
//   POST   /:id/restore   mcq_question_translation.restore
//
// GET is handled by /mcq-questions (returns joined translation data).
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { created, ok } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as mqtService from '../../../modules/mcq-question-translations/mcq-question-translations.service';
import {
  createMcqQuestionTranslationBodySchema,
  updateMcqQuestionTranslationBodySchema,
  type CreateMcqQuestionTranslationBody,
  type UpdateMcqQuestionTranslationBody
} from '../../../modules/mcq-question-translations/mcq-question-translations.schemas';

const router = Router();

router.use(authenticate);

// ─── CREATE ────────────────────────────────────────────────────

router.post(
  '/',
  authorize('mcq_question_translation.create'),
  validate({ body: createMcqQuestionTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateMcqQuestionTranslationBody;
    const result = await mqtService.createMcqQuestionTranslation(body, req.user?.id ?? null);
    return created(res, { id: result.id }, 'MCQ question translation created');
  })
);

// ─── UPDATE ────────────────────────────────────────────────────

router.patch(
  '/:id',
  authorize('mcq_question_translation.update'),
  validate({ params: idParamSchema, body: updateMcqQuestionTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateMcqQuestionTranslationBody;
    await mqtService.updateMcqQuestionTranslation(id, body, req.user?.id ?? null);
    return ok(res, { id }, 'MCQ question translation updated');
  })
);

// ─── DELETE ────────────────────────────────────────────────────

router.delete(
  '/:id',
  authorize('mcq_question_translation.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await mqtService.deleteMcqQuestionTranslation(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'MCQ question translation deleted');
  })
);

// ─── RESTORE ──────────────────────────────────────────────────

router.post(
  '/:id/restore',
  authorize('mcq_question_translation.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await mqtService.restoreMcqQuestionTranslation(id, req.user?.id ?? null);
    return ok(res, { id, restored: true }, 'MCQ question translation restored');
  })
);

export default router;
