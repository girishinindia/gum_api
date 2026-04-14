// ═══════════════════════════════════════════════════════════════
// /api/v1/branches router — phase 03 branch management CRUD.
//
// Authorization model:
//   GET    /            branch.read
//   GET    /:id         branch.read
//   POST   /            branch.create
//   PATCH  /:id         branch.update
//   DELETE /:id         branch.delete
//   POST   /:id/restore branch.restore
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { gateSoftDeleteFilters } from '../../../core/middlewares/gate-soft-delete-filters';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { assertVisibleToCaller } from '../../../core/utils/visibility';
import { idParamSchema } from '../../../shared/validation/common';
import * as branchesService from '../../../modules/resources/branches.service';
import {
  createBranchBodySchema,
  listBranchesQuerySchema,
  updateBranchBodySchema,
  type CreateBranchBody,
  type ListBranchesQuery,
  type UpdateBranchBody
} from '../../../modules/resources/branches.schemas';

const router = Router();

router.use(authenticate);
router.use(gateSoftDeleteFilters);

// ─── GET /  list ─────────────────────────────────────────────────

router.get(
  '/',
  authorize('branch.read'),
  validate({ query: listBranchesQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListBranchesQuery;
    const { rows, meta } = await branchesService.listBranches(q);
    return paginated(res, rows, meta, 'OK');
  })
);

// ─── GET /:id  read one ──────────────────────────────────────────

router.get(
  '/:id',
  authorize('branch.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const branch = await branchesService.getBranchById(id);
    assertVisibleToCaller(branch, req.user, 'Branch', id);
    return ok(res, branch, 'OK');
  })
);

// ─── POST /  create ──────────────────────────────────────────────

router.post(
  '/',
  authorize('branch.create'),
  validate({ body: createBranchBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateBranchBody;
    const result = await branchesService.createBranch(body, req.user?.id ?? null);
    const branch = await branchesService.getBranchById(result.id);
    return created(res, branch, 'Branch created');
  })
);

// ─── PATCH /:id  update ──────────────────────────────────────────

router.patch(
  '/:id',
  authorize('branch.update'),
  validate({ params: idParamSchema, body: updateBranchBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateBranchBody;
    await branchesService.updateBranch(id, body, req.user?.id ?? null);
    const branch = await branchesService.getBranchById(id);
    return ok(res, branch, 'Branch updated');
  })
);

// ─── DELETE /:id  soft delete ────────────────────────────────────

router.delete(
  '/:id',
  authorize('branch.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await branchesService.deleteBranch(id);
    return ok(res, { id, deleted: true }, 'Branch deleted');
  })
);

// ─── POST /:id/restore  restore ──────────────────────────────────

router.post(
  '/:id/restore',
  authorize('branch.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await branchesService.restoreBranch(id);
    const branch = await branchesService.getBranchById(id);
    return ok(res, branch, 'Branch restored');
  })
);

export default router;
