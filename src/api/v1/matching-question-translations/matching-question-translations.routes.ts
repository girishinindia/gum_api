// ═══════════════════════════════════════════════════════════════
// /api/v1/matching-question-translations router — phase 10.
//
// Authorization model:
//   POST   /              matching_question_translation.create
//   PATCH  /:id           matching_question_translation.update
//   DELETE /:id           matching_question_translation.delete
//   POST   /:id/restore   matching_question_translation.restore
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { created, ok } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as mqtService from '../../../modules/matching-question-translations/matching-question-translations.service';
import {
  createMatchingQuestionTranslationBodySchema,
  updateMatchingQuestionTranslationBodySchema,
  type CreateMatchingQuestionTranslationBody,
  type UpdateMatchingQuestionTranslationBody
} from '../../../modules/matching-question-translations/matching-question-translations.schemas';

const router = Router();

router.use(authenticate);

// ─── CREATE ────────────────────────────────────────────────────

router.post(
  '/',
  authorize('matching_question_translation.create'),
  validate({ body: createMatchingQuestionTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateMatchingQuestionTranslationBody;
    const result = await mqtService.createMatchingQuestionTranslation(body, req.user?.id ?? null);
    return created(res, { id: result.id }, 'Matching question translation created');
  })
);

// ─── UPDATE ────────────────────────────────────────────────────

router.patch(
  '/:id',
  authorize('matching_question_translation.update'),
  validate({ params: idParamSchema, body: updateMatchingQuestionTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateMatchingQuestionTranslationBody;
    await mqtService.updateMatchingQuestionTranslation(id, body, req.user?.id ?? null);
    return ok(res, { id }, 'Matching question translation updated');
  })
);

// ─── DELETE ────────────────────────────────────────────────────

router.delete(
  '/:id',
  authorize('matching_question_translation.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await mqtService.deleteMatchingQuestionTranslation(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Matching question translation deleted');
  })
);

// ─── RESTORE ──────────────────────────────────────────────────

router.post(
  '/:id/restore',
  authorize('matching_question_translation.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await mqtService.restoreMatchingQuestionTranslation(id, req.user?.id ?? null);
    return ok(res, { id, restored: true }, 'Matching question translation restored');
  })
);

export default router;
