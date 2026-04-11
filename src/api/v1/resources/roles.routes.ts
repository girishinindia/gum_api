// ═══════════════════════════════════════════════════════════════
// /api/v1/roles router — RBAC role catalog CRUD.
//
//   GET    /            role.read
//   GET    /:id         role.read
//   POST   /            role.create
//   PATCH  /:id         role.update
//   DELETE /:id         role.delete   (system roles are blocked by UDF)
//   POST   /:id/restore role.restore
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as rolesService from '../../../modules/resources/roles.service';
import {
  createRoleBodySchema,
  listRolesQuerySchema,
  updateRoleBodySchema,
  type CreateRoleBody,
  type ListRolesQuery,
  type UpdateRoleBody
} from '../../../modules/resources/roles.schemas';

const router = Router();

router.use(authenticate);

// ─── GET /  list ─────────────────────────────────────────────────

router.get(
  '/',
  authorize('role.read'),
  validate({ query: listRolesQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListRolesQuery;
    const { rows, meta } = await rolesService.listRoles(q);
    return paginated(res, rows, meta, 'OK');
  })
);

// ─── GET /:id ────────────────────────────────────────────────────

router.get(
  '/:id',
  authorize('role.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const role = await rolesService.getRoleById(id);
    if (!role) throw AppError.notFound(`Role ${id} not found`);
    return ok(res, role, 'OK');
  })
);

// ─── POST /  create ──────────────────────────────────────────────

router.post(
  '/',
  authorize('role.create'),
  validate({ body: createRoleBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateRoleBody;
    const result = await rolesService.createRole(body, req.user?.id ?? null);
    const role = await rolesService.getRoleById(result.id);
    return created(res, role, 'Role created');
  })
);

// ─── PATCH /:id  update ──────────────────────────────────────────

router.patch(
  '/:id',
  authorize('role.update'),
  validate({ params: idParamSchema, body: updateRoleBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateRoleBody;
    await rolesService.updateRole(id, body, req.user?.id ?? null);
    const role = await rolesService.getRoleById(id);
    return ok(res, role, 'Role updated');
  })
);

// ─── DELETE /:id  soft delete ────────────────────────────────────

router.delete(
  '/:id',
  authorize('role.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await rolesService.deleteRole(id);
    return ok(res, { id, deleted: true }, 'Role deleted');
  })
);

// ─── POST /:id/restore ───────────────────────────────────────────

router.post(
  '/:id/restore',
  authorize('role.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await rolesService.restoreRole(id);
    const role = await rolesService.getRoleById(id);
    return ok(res, role, 'Role restored');
  })
);

export default router;
