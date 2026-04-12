// ═══════════════════════════════════════════════════════════════
// /api/v1/ordering-item-translations router — phase 10.
//
// Authorization model:
//   POST   /              ordering_item_translation.create
//   PATCH  /:id           ordering_item_translation.update
//   DELETE /:id           ordering_item_translation.delete
//   POST   /:id/restore   ordering_item_translation.restore
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { created, ok } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as oitService from '../../../modules/ordering-item-translations/ordering-item-translations.service';
import {
  createOrderingItemTranslationBodySchema,
  updateOrderingItemTranslationBodySchema,
  type CreateOrderingItemTranslationBody,
  type UpdateOrderingItemTranslationBody
} from '../../../modules/ordering-item-translations/ordering-item-translations.schemas';

const router = Router();

router.use(authenticate);

// ─── CREATE ────────────────────────────────────────────────────

router.post(
  '/',
  authorize('ordering_item_translation.create'),
  validate({ body: createOrderingItemTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateOrderingItemTranslationBody;
    const result = await oitService.createOrderingItemTranslation(body, req.user?.id ?? null);
    return created(res, { id: result.id }, 'Ordering item translation created');
  })
);

// ─── UPDATE ────────────────────────────────────────────────────

router.patch(
  '/:id',
  authorize('ordering_item_translation.update'),
  validate({ params: idParamSchema, body: updateOrderingItemTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateOrderingItemTranslationBody;
    await oitService.updateOrderingItemTranslation(id, body, req.user?.id ?? null);
    return ok(res, { id }, 'Ordering item translation updated');
  })
);

// ─── DELETE ────────────────────────────────────────────────────

router.delete(
  '/:id',
  authorize('ordering_item_translation.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await oitService.deleteOrderingItemTranslation(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Ordering item translation deleted');
  })
);

// ─── RESTORE ──────────────────────────────────────────────────

router.post(
  '/:id/restore',
  authorize('ordering_item_translation.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await oitService.restoreOrderingItemTranslation(id, req.user?.id ?? null);
    return ok(res, { id, restored: true }, 'Ordering item translation restored');
  })
);

export default router;
