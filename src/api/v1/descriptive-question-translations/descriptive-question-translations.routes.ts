// ═══════════════════════════════════════════════════════════════
// /api/v1/descriptive-question-translations router — phase 10.
//
// Authorization model:
//   POST   /              descriptive_question_translation.create
//   PATCH  /:id           descriptive_question_translation.update
//   DELETE /:id           descriptive_question_translation.delete
//   POST   /:id/restore   descriptive_question_translation.restore
//
// GET is handled by /descriptive-questions (returns joined translation data).
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { created, ok } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as dqtService from '../../../modules/descriptive-question-translations/descriptive-question-translations.service';
import {
  createDescriptiveQuestionTranslationBodySchema,
  updateDescriptiveQuestionTranslationBodySchema,
  type CreateDescriptiveQuestionTranslationBody,
  type UpdateDescriptiveQuestionTranslationBody
} from '../../../modules/descriptive-question-translations/descriptive-question-translations.schemas';

const router = Router();

router.use(authenticate);

// ─── CREATE ────────────────────────────────────────────────────

router.post(
  '/',
  authorize('descriptive_question_translation.create'),
  validate({ body: createDescriptiveQuestionTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateDescriptiveQuestionTranslationBody;
    const result = await dqtService.createDescriptiveQuestionTranslation(body, req.user?.id ?? null);
    return created(res, { id: result.id }, 'Descriptive question translation created');
  })
);

// ─── UPDATE ────────────────────────────────────────────────────

router.patch(
  '/:id',
  authorize('descriptive_question_translation.update'),
  validate({ params: idParamSchema, body: updateDescriptiveQuestionTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateDescriptiveQuestionTranslationBody;
    await dqtService.updateDescriptiveQuestionTranslation(id, body, req.user?.id ?? null);
    return ok(res, { id }, 'Descriptive question translation updated');
  })
);

// ─── DELETE ────────────────────────────────────────────────────

router.delete(
  '/:id',
  authorize('descriptive_question_translation.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await dqtService.deleteDescriptiveQuestionTranslation(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Descriptive question translation deleted');
  })
);

// ─── RESTORE ──────────────────────────────────────────────────

router.post(
  '/:id/restore',
  authorize('descriptive_question_translation.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await dqtService.restoreDescriptiveQuestionTranslation(id, req.user?.id ?? null);
    return ok(res, { id, restored: true }, 'Descriptive question translation restored');
  })
);

export default router;
