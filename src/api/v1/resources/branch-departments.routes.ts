// ═══════════════════════════════════════════════════════════════
// /api/v1/branch-departments router — phase 03 junction CRUD.
//
// Authorization model:
//   GET    /            branch_department.read
//   GET    /:id         branch_department.read
//   POST   /            branch_department.create
//   PATCH  /:id         branch_department.update
//   DELETE /:id         branch_department.delete
//   POST   /:id/restore branch_department.restore
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as bdService from '../../../modules/resources/branch-departments.service';
import {
  createBranchDepartmentBodySchema,
  listBranchDepartmentsQuerySchema,
  updateBranchDepartmentBodySchema,
  type CreateBranchDepartmentBody,
  type ListBranchDepartmentsQuery,
  type UpdateBranchDepartmentBody
} from '../../../modules/resources/branch-departments.schemas';

const router = Router();

router.use(authenticate);

// ─── GET /  list ─────────────────────────────────────────────────

router.get(
  '/',
  authorize('branch_department.read'),
  validate({ query: listBranchDepartmentsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListBranchDepartmentsQuery;
    const { rows, meta } = await bdService.listBranchDepartments(q);
    return paginated(res, rows, meta, 'OK');
  })
);

// ─── GET /:id  read one ──────────────────────────────────────────

router.get(
  '/:id',
  authorize('branch_department.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const bd = await bdService.getBranchDepartmentById(id);
    if (!bd) throw AppError.notFound(`Branch-department ${id} not found`);
    return ok(res, bd, 'OK');
  })
);

// ─── POST /  create ──────────────────────────────────────────────

router.post(
  '/',
  authorize('branch_department.create'),
  validate({ body: createBranchDepartmentBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateBranchDepartmentBody;
    const result = await bdService.createBranchDepartment(
      body,
      req.user?.id ?? null
    );
    const bd = await bdService.getBranchDepartmentById(result.id);
    return created(res, bd, 'Branch-department created');
  })
);

// ─── PATCH /:id  update ──────────────────────────────────────────

router.patch(
  '/:id',
  authorize('branch_department.update'),
  validate({ params: idParamSchema, body: updateBranchDepartmentBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateBranchDepartmentBody;
    await bdService.updateBranchDepartment(id, body, req.user?.id ?? null);
    const bd = await bdService.getBranchDepartmentById(id);
    return ok(res, bd, 'Branch-department updated');
  })
);

// ─── DELETE /:id  soft delete ────────────────────────────────────

router.delete(
  '/:id',
  authorize('branch_department.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await bdService.deleteBranchDepartment(id);
    return ok(res, { id, deleted: true }, 'Branch-department deleted');
  })
);

// ─── POST /:id/restore  restore ──────────────────────────────────

router.post(
  '/:id/restore',
  authorize('branch_department.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await bdService.restoreBranchDepartment(id);
    const bd = await bdService.getBranchDepartmentById(id);
    return ok(res, bd, 'Branch-department restored');
  })
);

export default router;
