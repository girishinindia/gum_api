// ═══════════════════════════════════════════════════════════════
// /api/v1/one-word-synonyms router — phase 10.
//
// Authorization model:
//   POST   /              one_word_synonym.create
//   PATCH  /:id           one_word_synonym.update
//   DELETE /:id           one_word_synonym.delete       (cascade translations)
//   POST   /:id/restore   one_word_synonym.restore      (cascade translations)
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { created, ok } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as owsService from '../../../modules/one-word-synonyms/one-word-synonyms.service';
import {
  createOneWordSynonymBodySchema,
  updateOneWordSynonymBodySchema,
  type CreateOneWordSynonymBody,
  type UpdateOneWordSynonymBody
} from '../../../modules/one-word-synonyms/one-word-synonyms.schemas';

const router = Router();

router.use(authenticate);

// ─── CREATE ────────────────────────────────────────────────────

router.post(
  '/',
  authorize('one_word_synonym.create'),
  validate({ body: createOneWordSynonymBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateOneWordSynonymBody;
    const result = await owsService.createOneWordSynonym(body, req.user?.id ?? null);
    return created(res, { id: result.id }, 'One-word synonym created');
  })
);

// ─── UPDATE ────────────────────────────────────────────────────

router.patch(
  '/:id',
  authorize('one_word_synonym.update'),
  validate({ params: idParamSchema, body: updateOneWordSynonymBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateOneWordSynonymBody;
    await owsService.updateOneWordSynonym(id, body, req.user?.id ?? null);
    return ok(res, { id }, 'One-word synonym updated');
  })
);

// ─── DELETE (cascade translations) ─────────────────────────────

router.delete(
  '/:id',
  authorize('one_word_synonym.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await owsService.deleteOneWordSynonym(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'One-word synonym and translations deleted');
  })
);

// ─── RESTORE (cascade translations) ───────────────────────────

router.post(
  '/:id/restore',
  authorize('one_word_synonym.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await owsService.restoreOneWordSynonym(id, req.user?.id ?? null);
    return ok(res, { id, restored: true }, 'One-word synonym and translations restored');
  })
);

export default router;
