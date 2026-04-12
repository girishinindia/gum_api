// ═══════════════════════════════════════════════════════════════
// /api/v1/mcq-option-translations router — phase 10.
//
// Authorization model:
//   POST   /              mcq_option_translation.create
//   PATCH  /:id           mcq_option_translation.update
//   DELETE /:id           mcq_option_translation.delete
//   POST   /:id/restore   mcq_option_translation.restore
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { created, ok } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as motService from '../../../modules/mcq-option-translations/mcq-option-translations.service';
import {
  createMcqOptionTranslationBodySchema,
  updateMcqOptionTranslationBodySchema,
  type CreateMcqOptionTranslationBody,
  type UpdateMcqOptionTranslationBody
} from '../../../modules/mcq-option-translations/mcq-option-translations.schemas';

const router = Router();

router.use(authenticate);

// ─── CREATE ────────────────────────────────────────────────────

router.post(
  '/',
  authorize('mcq_option_translation.create'),
  validate({ body: createMcqOptionTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateMcqOptionTranslationBody;
    const result = await motService.createMcqOptionTranslation(body, req.user?.id ?? null);
    return created(res, { id: result.id }, 'MCQ option translation created');
  })
);

// ─── UPDATE ────────────────────────────────────────────────────

router.patch(
  '/:id',
  authorize('mcq_option_translation.update'),
  validate({ params: idParamSchema, body: updateMcqOptionTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateMcqOptionTranslationBody;
    await motService.updateMcqOptionTranslation(id, body, req.user?.id ?? null);
    return ok(res, { id }, 'MCQ option translation updated');
  })
);

// ─── DELETE ────────────────────────────────────────────────────

router.delete(
  '/:id',
  authorize('mcq_option_translation.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await motService.deleteMcqOptionTranslation(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'MCQ option translation deleted');
  })
);

// ─── RESTORE ──────────────────────────────────────────────────

router.post(
  '/:id/restore',
  authorize('mcq_option_translation.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await motService.restoreMcqOptionTranslation(id, req.user?.id ?? null);
    return ok(res, { id, restored: true }, 'MCQ option translation restored');
  })
);

export default router;
