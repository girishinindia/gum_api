// ═══════════════════════════════════════════════════════════════
// /api/v1/one-word-question-translations router — phase 10.
//
// Authorization model:
//   POST   /              one_word_question_translation.create
//   PATCH  /:id           one_word_question_translation.update
//   DELETE /:id           one_word_question_translation.delete
//   POST   /:id/restore   one_word_question_translation.restore
//
// GET is handled by /one-word-questions (returns joined translation data).
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { created, ok } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as owqtService from '../../../modules/one-word-question-translations/one-word-question-translations.service';
import {
  createOneWordQuestionTranslationBodySchema,
  updateOneWordQuestionTranslationBodySchema,
  type CreateOneWordQuestionTranslationBody,
  type UpdateOneWordQuestionTranslationBody
} from '../../../modules/one-word-question-translations/one-word-question-translations.schemas';

const router = Router();

router.use(authenticate);

// ─── CREATE ────────────────────────────────────────────────────

router.post(
  '/',
  authorize('one_word_question_translation.create'),
  validate({ body: createOneWordQuestionTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateOneWordQuestionTranslationBody;
    const result = await owqtService.createOneWordQuestionTranslation(body, req.user?.id ?? null);
    return created(res, { id: result.id }, 'One-word question translation created');
  })
);

// ─── UPDATE ────────────────────────────────────────────────────

router.patch(
  '/:id',
  authorize('one_word_question_translation.update'),
  validate({ params: idParamSchema, body: updateOneWordQuestionTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateOneWordQuestionTranslationBody;
    await owqtService.updateOneWordQuestionTranslation(id, body, req.user?.id ?? null);
    return ok(res, { id }, 'One-word question translation updated');
  })
);

// ─── DELETE ────────────────────────────────────────────────────

router.delete(
  '/:id',
  authorize('one_word_question_translation.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await owqtService.deleteOneWordQuestionTranslation(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'One-word question translation deleted');
  })
);

// ─── RESTORE ──────────────────────────────────────────────────

router.post(
  '/:id/restore',
  authorize('one_word_question_translation.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await owqtService.restoreOneWordQuestionTranslation(id, req.user?.id ?? null);
    return ok(res, { id, restored: true }, 'One-word question translation restored');
  })
);

export default router;
