// ═══════════════════════════════════════════════════════════════
// /api/v1/user-permissions router — user-level permission overrides.
//
//   GET    /                 permission.read    (list)
//   GET    /:id              permission.read    (get one)
//   POST   /                 permission.assign  (assign grant|deny)
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
import * as userPermissionsService from '../../../modules/junctions/user-permissions.service';
import {
  assignUserPermissionBodySchema,
  listUserPermissionsQuerySchema,
  revokeUserPermissionBodySchema,
  type AssignUserPermissionBody,
  type ListUserPermissionsQuery,
  type RevokeUserPermissionBody
} from '../../../modules/junctions/user-permissions.schemas';

const router = Router();

router.use(authenticate);

// ─── GET /  list ─────────────────────────────────────────────────

router.get(
  '/',
  authorize('permission.read'),
  validate({ query: listUserPermissionsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListUserPermissionsQuery;
    const { rows, meta } = await userPermissionsService.listUserPermissions(q);
    return paginated(res, rows, meta, 'OK');
  })
);

// ─── POST /revoke (specific — must be before /:id) ──────────────

router.post(
  '/revoke',
  authorize('permission.assign'),
  validate({ body: revokeUserPermissionBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as RevokeUserPermissionBody;
    await userPermissionsService.revokeUserPermission(body);
    return ok(
      res,
      { userId: body.userId, permissionId: body.permissionId, revoked: true },
      'User-permission override revoked'
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
    const up = await userPermissionsService.getUserPermissionById(id);
    if (!up) throw AppError.notFound(`User-permission ${id} not found`);
    return ok(res, up, 'OK');
  })
);

// ─── POST /  assign (grant | deny) ──────────────────────────────

router.post(
  '/',
  authorize('permission.assign'),
  validate({ body: assignUserPermissionBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as AssignUserPermissionBody;
    const result = await userPermissionsService.assignUserPermission(
      body,
      req.user?.id ?? null
    );
    const up = await userPermissionsService.getUserPermissionById(result.id);
    return created(res, up, 'Permission override assigned to user');
  })
);

// ─── DELETE /:id  (soft delete by junction id) ──────────────────

router.delete(
  '/:id',
  authorize('permission.assign'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await userPermissionsService.deleteUserPermission(id);
    return ok(res, { id, deleted: true }, 'User-permission override deleted');
  })
);

// ─── POST /:id/restore ───────────────────────────────────────────

router.post(
  '/:id/restore',
  authorize('permission.assign'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await userPermissionsService.restoreUserPermission(id);
    const up = await userPermissionsService.getUserPermissionById(id);
    return ok(res, up, 'User-permission override restored');
  })
);

export default router;
