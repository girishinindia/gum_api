// ═══════════════════════════════════════════════════════════════
// /api/v1/role-permissions router — RBAC role↔permission junction.
//
//   GET    /                 permission.read    (list)
//   GET    /:id              permission.read    (get one)
//   POST   /                 permission.assign  (assign)
//   POST   /revoke           permission.assign  (revoke by pair)
//   DELETE /:id              permission.assign  (delete by junction id)
//   POST   /:id/restore      permission.assign  (restore by junction id)
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as rolePermissionsService from '../../../modules/junctions/role-permissions.service';
import {
  assignRolePermissionBodySchema,
  listRolePermissionsQuerySchema,
  revokeRolePermissionBodySchema,
  type AssignRolePermissionBody,
  type ListRolePermissionsQuery,
  type RevokeRolePermissionBody
} from '../../../modules/junctions/role-permissions.schemas';

const router = Router();

router.use(authenticate);

// ─── GET /  list ─────────────────────────────────────────────────

router.get(
  '/',
  authorize('permission.read'),
  validate({ query: listRolePermissionsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListRolePermissionsQuery;
    const { rows, meta } = await rolePermissionsService.listRolePermissions(q);
    return paginated(res, rows, meta, 'OK');
  })
);

// ─── POST /revoke (specific — must be before /:id) ──────────────

router.post(
  '/revoke',
  authorize('permission.assign'),
  validate({ body: revokeRolePermissionBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as RevokeRolePermissionBody;
    await rolePermissionsService.revokeRolePermission(body);
    return ok(
      res,
      { roleId: body.roleId, permissionId: body.permissionId, revoked: true },
      'Role-permission assignment revoked'
    );
  })
);

// ─── GET /:id ────────────────────────────────────────────────────

router.get(
  '/:id',
  authorize('permission.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const rp = await rolePermissionsService.getRolePermissionById(id);
    if (!rp) throw AppError.notFound(`Role-permission ${id} not found`);
    return ok(res, rp, 'OK');
  })
);

// ─── POST /  assign ──────────────────────────────────────────────

router.post(
  '/',
  authorize('permission.assign'),
  validate({ body: assignRolePermissionBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as AssignRolePermissionBody;
    const result = await rolePermissionsService.assignRolePermission(
      body,
      req.user?.id ?? null
    );
    const rp = await rolePermissionsService.getRolePermissionById(result.id);
    return created(res, rp, 'Permission assigned to role');
  })
);

// ─── DELETE /:id  (soft delete by junction id) ──────────────────

router.delete(
  '/:id',
  authorize('permission.assign'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await rolePermissionsService.deleteRolePermission(id);
    return ok(res, { id, deleted: true }, 'Role-permission assignment deleted');
  })
);

// ─── POST /:id/restore ───────────────────────────────────────────

router.post(
  '/:id/restore',
  authorize('permission.assign'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await rolePermissionsService.restoreRolePermission(id);
    const rp = await rolePermissionsService.getRolePermissionById(id);
    return ok(res, rp, 'Role-permission assignment restored');
  })
);

export default router;
