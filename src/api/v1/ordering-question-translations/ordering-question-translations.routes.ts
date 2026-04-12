// ═══════════════════════════════════════════════════════════════
// /api/v1/ordering-question-translations router — phase 10.
//
// Authorization model:
//   POST   /              ordering_question_translation.create
//   PATCH  /:id           ordering_question_translation.update
//   DELETE /:id           ordering_question_translation.delete
//   POST   /:id/restore   ordering_question_translation.restore
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { created, ok } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as oqtService from '../../../modules/ordering-question-translations/ordering-question-translations.service';
import {
  createOrderingQuestionTranslationBodySchema,
  updateOrderingQuestionTranslationBodySchema,
  type CreateOrderingQuestionTranslationBody,
  type UpdateOrderingQuestionTranslationBody
} from '../../../modules/ordering-question-translations/ordering-question-translations.schemas';

const router = Router();

router.use(authenticate);

// ─── CREATE ────────────────────────────────────────────────────

router.post(
  '/',
  authorize('ordering_question_translation.create'),
  validate({ body: createOrderingQuestionTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateOrderingQuestionTranslationBody;
    const result = await oqtService.createOrderingQuestionTranslation(body, req.user?.id ?? null);
    return created(res, { id: result.id }, 'Ordering question translation created');
  })
);

// ─── UPDATE ────────────────────────────────────────────────────

router.patch(
  '/:id',
  authorize('ordering_question_translation.update'),
  validate({ params: idParamSchema, body: updateOrderingQuestionTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateOrderingQuestionTranslationBody;
    await oqtService.updateOrderingQuestionTranslation(id, body, req.user?.id ?? null);
    return ok(res, { id }, 'Ordering question translation updated');
  })
);

// ─── DELETE ────────────────────────────────────────────────────

router.delete(
  '/:id',
  authorize('ordering_question_translation.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await oqtService.deleteOrderingQuestionTranslation(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Ordering question translation deleted');
  })
);

// ─── RESTORE ──────────────────────────────────────────────────

router.post(
  '/:id/restore',
  authorize('ordering_question_translation.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await oqtService.restoreOrderingQuestionTranslation(id, req.user?.id ?? null);
    return ok(res, { id, restored: true }, 'Ordering question translation restored');
  })
);

export default router;
