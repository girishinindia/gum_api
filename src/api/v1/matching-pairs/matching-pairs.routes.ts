// ═══════════════════════════════════════════════════════════════
// /api/v1/matching-pairs router — phase 10.
//
// Authorization model:
//   POST   /              matching_pair.create
//   PATCH  /:id           matching_pair.update
//   DELETE /:id           matching_pair.delete       (cascade translations)
//   POST   /:id/restore   matching_pair.restore      (cascade translations)
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { created, ok } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as mpService from '../../../modules/matching-pairs/matching-pairs.service';
import {
  createMatchingPairBodySchema,
  updateMatchingPairBodySchema,
  type CreateMatchingPairBody,
  type UpdateMatchingPairBody
} from '../../../modules/matching-pairs/matching-pairs.schemas';

const router = Router();

router.use(authenticate);

// ─── CREATE ────────────────────────────────────────────────────

router.post(
  '/',
  authorize('matching_pair.create'),
  validate({ body: createMatchingPairBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateMatchingPairBody;
    const result = await mpService.createMatchingPair(body, req.user?.id ?? null);
    return created(res, { id: result.id }, 'Matching pair created');
  })
);

// ─── UPDATE ────────────────────────────────────────────────────

router.patch(
  '/:id',
  authorize('matching_pair.update'),
  validate({ params: idParamSchema, body: updateMatchingPairBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateMatchingPairBody;
    await mpService.updateMatchingPair(id, body, req.user?.id ?? null);
    return ok(res, { id }, 'Matching pair updated');
  })
);

// ─── DELETE (cascade translations) ─────────────────────────────

router.delete(
  '/:id',
  authorize('matching_pair.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await mpService.deleteMatchingPair(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Matching pair and translations deleted');
  })
);

// ─── RESTORE (cascade translations) ───────────────────────────

router.post(
  '/:id/restore',
  authorize('matching_pair.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await mpService.restoreMatchingPair(id, req.user?.id ?? null);
    return ok(res, { id, restored: true }, 'Matching pair and translations restored');
  })
);

export default router;
