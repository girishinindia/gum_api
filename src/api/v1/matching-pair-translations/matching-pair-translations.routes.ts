// ═══════════════════════════════════════════════════════════════
// /api/v1/matching-pair-translations router — phase 10.
//
// Authorization model:
//   POST   /              matching_pair_translation.create
//   PATCH  /:id           matching_pair_translation.update
//   DELETE /:id           matching_pair_translation.delete
//   POST   /:id/restore   matching_pair_translation.restore
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { created, ok } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as mptService from '../../../modules/matching-pair-translations/matching-pair-translations.service';
import {
  createMatchingPairTranslationBodySchema,
  updateMatchingPairTranslationBodySchema,
  type CreateMatchingPairTranslationBody,
  type UpdateMatchingPairTranslationBody
} from '../../../modules/matching-pair-translations/matching-pair-translations.schemas';

const router = Router();

router.use(authenticate);

// ─── CREATE ────────────────────────────────────────────────────

router.post(
  '/',
  authorize('matching_pair_translation.create'),
  validate({ body: createMatchingPairTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateMatchingPairTranslationBody;
    const result = await mptService.createMatchingPairTranslation(body, req.user?.id ?? null);
    return created(res, { id: result.id }, 'Matching pair translation created');
  })
);

// ─── UPDATE ────────────────────────────────────────────────────

router.patch(
  '/:id',
  authorize('matching_pair_translation.update'),
  validate({ params: idParamSchema, body: updateMatchingPairTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateMatchingPairTranslationBody;
    await mptService.updateMatchingPairTranslation(id, body, req.user?.id ?? null);
    return ok(res, { id }, 'Matching pair translation updated');
  })
);

// ─── DELETE ────────────────────────────────────────────────────

router.delete(
  '/:id',
  authorize('matching_pair_translation.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await mptService.deleteMatchingPairTranslation(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Matching pair translation deleted');
  })
);

// ─── RESTORE ──────────────────────────────────────────────────

router.post(
  '/:id/restore',
  authorize('matching_pair_translation.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await mptService.restoreMatchingPairTranslation(id, req.user?.id ?? null);
    return ok(res, { id, restored: true }, 'Matching pair translation restored');
  })
);

export default router;
