// ═══════════════════════════════════════════════════════════════
// /api/v1/departments router — phase 03 branch management CRUD.
//
// Authorization model:
//   GET    /            department.read
//   GET    /:id         department.read
//   POST   /            department.create
//   PATCH  /:id         department.update
//   DELETE /:id         department.delete
//   POST   /:id/restore department.restore
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { gateSoftDeleteFilters } from '../../../core/middlewares/gate-soft-delete-filters';
import { authorize, authorizeRole } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { assertVisibleToCaller } from '../../../core/utils/visibility';
import { idParamSchema } from '../../../shared/validation/common';
import * as departmentsService from '../../../modules/resources/departments.service';
import {
  createDepartmentBodySchema,
  listDepartmentsQuerySchema,
  updateDepartmentBodySchema,
  type CreateDepartmentBody,
  type ListDepartmentsQuery,
  type UpdateDepartmentBody
} from '../../../modules/resources/departments.schemas';

const router = Router();

router.use(authenticate);
router.use(gateSoftDeleteFilters);

// ─── GET /  list ─────────────────────────────────────────────────

router.get(
  '/',
  authorize('department.read'),
  validate({ query: listDepartmentsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListDepartmentsQuery;
    const { rows, meta } = await departmentsService.listDepartments(q);
    return paginated(res, rows, meta, 'OK');
  })
);

// ─── GET /:id  read one ──────────────────────────────────────────

router.get(
  '/:id',
  authorize('department.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const department = await departmentsService.getDepartmentById(id);
    assertVisibleToCaller(department, req.user, 'Department', id);
    return ok(res, department, 'OK');
  })
);

// ─── POST /  create ──────────────────────────────────────────────

router.post(
  '/',
  authorize('department.create'),
  validate({ body: createDepartmentBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateDepartmentBody;
    const result = await departmentsService.createDepartment(
      body,
      req.user?.id ?? null
    );
    const department = await departmentsService.getDepartmentById(result.id);
    return created(res, department, 'Department created');
  })
);

// ─── PATCH /:id  update ──────────────────────────────────────────

router.patch(
  '/:id',
  authorize('department.update'),
  validate({ params: idParamSchema, body: updateDepartmentBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateDepartmentBody;
    await departmentsService.updateDepartment(id, body, req.user?.id ?? null);
    const department = await departmentsService.getDepartmentById(id);
    return ok(res, department, 'Department updated');
  })
);

// ─── DELETE /:id  soft delete ────────────────────────────────────

router.delete(
  '/:id',
  authorizeRole('super_admin'),
  authorize('department.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await departmentsService.deleteDepartment(id);
    return ok(res, { id, deleted: true }, 'Department deleted');
  })
);

// ─── POST /:id/restore  restore ──────────────────────────────────

router.post(
  '/:id/restore',
  authorizeRole('super_admin'),
  authorize('department.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await departmentsService.restoreDepartment(id);
    const department = await departmentsService.getDepartmentById(id);
    return ok(res, department, 'Department restored');
  })
);

export default router;
