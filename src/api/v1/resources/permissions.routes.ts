// ═══════════════════════════════════════════════════════════════
// /api/v1/permissions router — RBAC permission catalog CRUD.
//
//   GET    /            permission.read
//   GET    /:id         permission.read
//   POST   /            permission.create
//   PATCH  /:id         permission.update
//   DELETE /:id         permission.delete
//   POST   /:id/restore permission.restore
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize, authorizeRole} from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as permissionsService from '../../../modules/resources/permissions.service';
import {
  createPermissionBodySchema,
  listPermissionsQuerySchema,
  updatePermissionBodySchema,
  type CreatePermissionBody,
  type ListPermissionsQuery,
  type UpdatePermissionBody
} from '../../../modules/resources/permissions.schemas';

const router = Router();

router.use(authenticate);

// ─── GET /  list ─────────────────────────────────────────────────

router.get(
  '/',
  authorize('permission.read'),
  validate({ query: listPermissionsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListPermissionsQuery;
    const { rows, meta } = await permissionsService.listPermissions(q);
    return paginated(res, rows, meta, 'OK');
  })
);

// ─── GET /:id ────────────────────────────────────────────────────

router.get(
  '/:id',
  authorize('permission.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const perm = await permissionsService.getPermissionById(id);
    if (!perm) throw AppError.notFound(`Permission ${id} not found`);
    return ok(res, perm, 'OK');
  })
);

// ─── POST /  create ──────────────────────────────────────────────

router.post(
  '/',
  authorize('permission.create'),
  validate({ body: createPermissionBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreatePermissionBody;
    const result = await permissionsService.createPermission(
      body,
      req.user?.id ?? null
    );
    const perm = await permissionsService.getPermissionById(result.id);
    return created(res, perm, 'Permission created');
  })
);

// ─── PATCH /:id ──────────────────────────────────────────────────

router.patch(
  '/:id',
  authorize('permission.update'),
  validate({ params: idParamSchema, body: updatePermissionBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdatePermissionBody;
    await permissionsService.updatePermission(id, body, req.user?.id ?? null);
    const perm = await permissionsService.getPermissionById(id);
    return ok(res, perm, 'Permission updated');
  })
);

// ─── DELETE /:id ─────────────────────────────────────────────────

router.delete(
  '/:id',
  authorizeRole('super_admin'),
  authorize('permission.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await permissionsService.deletePermission(id);
    return ok(res, { id, deleted: true }, 'Permission deleted');
  })
);

// ─── POST /:id/restore ───────────────────────────────────────────

router.post(
  '/:id/restore',
  authorizeRole('super_admin'),
  authorize('permission.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await permissionsService.restorePermission(id);
    const perm = await permissionsService.getPermissionById(id);
    return ok(res, perm, 'Permission restored');
  })
);

export default router;
