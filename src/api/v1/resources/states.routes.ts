// ═══════════════════════════════════════════════════════════════
// /api/v1/states router — phase 02 master data CRUD.
//
// Authorization model:
//   GET    /            state.read
//   GET    /:id         state.read
//   POST   /            state.create
//   PATCH  /:id         state.update
//   DELETE /:id         state.delete
//   POST   /:id/restore state.restore
//
// All routes require an authenticated user (req.user.id is forwarded
// to the UDFs as p_created_by / p_updated_by for the audit trail).
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as statesService from '../../../modules/resources/states.service';
import {
  createStateBodySchema,
  listStatesQuerySchema,
  updateStateBodySchema,
  type CreateStateBody,
  type ListStatesQuery,
  type UpdateStateBody
} from '../../../modules/resources/states.schemas';

const router = Router();

// Every route below requires authentication.
router.use(authenticate);

// ─── GET /  list ─────────────────────────────────────────────────

router.get(
  '/',
  authorize('state.read'),
  validate({ query: listStatesQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListStatesQuery;
    const { rows, meta } = await statesService.listStates(q);
    return paginated(res, rows, meta, 'OK');
  })
);

// ─── GET /:id  read one ──────────────────────────────────────────

router.get(
  '/:id',
  authorize('state.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const state = await statesService.getStateById(id);
    if (!state) throw AppError.notFound(`State ${id} not found`);
    return ok(res, state, 'OK');
  })
);

// ─── POST /  create ──────────────────────────────────────────────

router.post(
  '/',
  authorize('state.create'),
  validate({ body: createStateBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateStateBody;
    const result = await statesService.createState(body, req.user?.id ?? null);
    const state = await statesService.getStateById(result.id);
    return created(res, state, 'State created');
  })
);

// ─── PATCH /:id  update ──────────────────────────────────────────

router.patch(
  '/:id',
  authorize('state.update'),
  validate({ params: idParamSchema, body: updateStateBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateStateBody;
    await statesService.updateState(id, body, req.user?.id ?? null);
    const state = await statesService.getStateById(id);
    return ok(res, state, 'State updated');
  })
);

// ─── DELETE /:id  soft delete ────────────────────────────────────

router.delete(
  '/:id',
  authorize('state.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await statesService.deleteState(id);
    return ok(res, { id, deleted: true }, 'State deleted');
  })
);

// ─── POST /:id/restore  restore ──────────────────────────────────

router.post(
  '/:id/restore',
  authorize('state.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await statesService.restoreState(id);
    const state = await statesService.getStateById(id);
    return ok(res, state, 'State restored');
  })
);

export default router;
