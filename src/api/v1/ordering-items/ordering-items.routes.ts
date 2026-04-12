// ═══════════════════════════════════════════════════════════════
// /api/v1/ordering-items router — phase 10.
//
// Authorization model:
//   POST   /              ordering_item.create
//   PATCH  /:id           ordering_item.update
//   DELETE /:id           ordering_item.delete       (cascade translations)
//   POST   /:id/restore   ordering_item.restore      (cascade translations)
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { created, ok } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as oiService from '../../../modules/ordering-items/ordering-items.service';
import {
  createOrderingItemBodySchema,
  updateOrderingItemBodySchema,
  type CreateOrderingItemBody,
  type UpdateOrderingItemBody
} from '../../../modules/ordering-items/ordering-items.schemas';

const router = Router();

router.use(authenticate);

// ─── CREATE ────────────────────────────────────────────────────

router.post(
  '/',
  authorize('ordering_item.create'),
  validate({ body: createOrderingItemBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateOrderingItemBody;
    const result = await oiService.createOrderingItem(body, req.user?.id ?? null);
    return created(res, { id: result.id }, 'Ordering item created');
  })
);

// ─── UPDATE ────────────────────────────────────────────────────

router.patch(
  '/:id',
  authorize('ordering_item.update'),
  validate({ params: idParamSchema, body: updateOrderingItemBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateOrderingItemBody;
    await oiService.updateOrderingItem(id, body, req.user?.id ?? null);
    return ok(res, { id }, 'Ordering item updated');
  })
);

// ─── DELETE (cascade translations) ─────────────────────────────

router.delete(
  '/:id',
  authorize('ordering_item.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await oiService.deleteOrderingItem(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Ordering item and translations deleted');
  })
);

// ─── RESTORE (cascade translations) ───────────────────────────

router.post(
  '/:id/restore',
  authorize('ordering_item.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await oiService.restoreOrderingItem(id, req.user?.id ?? null);
    return ok(res, { id, restored: true }, 'Ordering item and translations restored');
  })
);

export default router;
