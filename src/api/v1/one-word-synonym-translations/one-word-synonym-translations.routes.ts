// ═══════════════════════════════════════════════════════════════
// /api/v1/one-word-synonym-translations router — phase 10.
//
// Authorization model:
//   POST   /              one_word_synonym_translation.create
//   PATCH  /:id           one_word_synonym_translation.update
//   DELETE /:id           one_word_synonym_translation.delete
//   POST   /:id/restore   one_word_synonym_translation.restore
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { created, ok } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as owstService from '../../../modules/one-word-synonym-translations/one-word-synonym-translations.service';
import {
  createOneWordSynonymTranslationBodySchema,
  updateOneWordSynonymTranslationBodySchema,
  type CreateOneWordSynonymTranslationBody,
  type UpdateOneWordSynonymTranslationBody
} from '../../../modules/one-word-synonym-translations/one-word-synonym-translations.schemas';

const router = Router();

router.use(authenticate);

// ─── CREATE ────────────────────────────────────────────────────

router.post(
  '/',
  authorize('one_word_synonym_translation.create'),
  validate({ body: createOneWordSynonymTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateOneWordSynonymTranslationBody;
    const result = await owstService.createOneWordSynonymTranslation(body, req.user?.id ?? null);
    return created(res, { id: result.id }, 'One-word synonym translation created');
  })
);

// ─── UPDATE ────────────────────────────────────────────────────

router.patch(
  '/:id',
  authorize('one_word_synonym_translation.update'),
  validate({ params: idParamSchema, body: updateOneWordSynonymTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateOneWordSynonymTranslationBody;
    await owstService.updateOneWordSynonymTranslation(id, body, req.user?.id ?? null);
    return ok(res, { id }, 'One-word synonym translation updated');
  })
);

// ─── DELETE ────────────────────────────────────────────────────

router.delete(
  '/:id',
  authorize('one_word_synonym_translation.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await owstService.deleteOneWordSynonymTranslation(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'One-word synonym translation deleted');
  })
);

// ─── RESTORE ──────────────────────────────────────────────────

router.post(
  '/:id/restore',
  authorize('one_word_synonym_translation.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await owstService.restoreOneWordSynonymTranslation(id, req.user?.id ?? null);
    return ok(res, { id, restored: true }, 'One-word synonym translation restored');
  })
);

export default router;
