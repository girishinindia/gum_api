// ═══════════════════════════════════════════════════════════════
// /api/v1/mcq-options router — phase 10.
//
// Authorization model:
//   POST   /              mcq_option.create
//   PATCH  /:id           mcq_option.update
//   DELETE /:id           mcq_option.delete       (cascade translations)
//   POST   /:id/restore   mcq_option.restore      (cascade translations)
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { created, ok } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as moService from '../../../modules/mcq-options/mcq-options.service';
import {
  createMcqOptionBodySchema,
  updateMcqOptionBodySchema,
  type CreateMcqOptionBody,
  type UpdateMcqOptionBody
} from '../../../modules/mcq-options/mcq-options.schemas';

const router = Router();

router.use(authenticate);

// ─── CREATE ────────────────────────────────────────────────────

router.post(
  '/',
  authorize('mcq_option.create'),
  validate({ body: createMcqOptionBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateMcqOptionBody;
    const result = await moService.createMcqOption(body, req.user?.id ?? null);
    return created(res, { id: result.id }, 'MCQ option created');
  })
);

// ─── UPDATE ────────────────────────────────────────────────────

router.patch(
  '/:id',
  authorize('mcq_option.update'),
  validate({ params: idParamSchema, body: updateMcqOptionBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateMcqOptionBody;
    await moService.updateMcqOption(id, body, req.user?.id ?? null);
    return ok(res, { id }, 'MCQ option updated');
  })
);

// ─── DELETE (cascade translations) ─────────────────────────────

router.delete(
  '/:id',
  authorize('mcq_option.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await moService.deleteMcqOption(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'MCQ option and translations deleted');
  })
);

// ─── RESTORE (cascade translations) ───────────────────────────

router.post(
  '/:id/restore',
  authorize('mcq_option.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await moService.restoreMcqOption(id, req.user?.id ?? null);
    return ok(res, { id, restored: true }, 'MCQ option and translations restored');
  })
);

export default router;
