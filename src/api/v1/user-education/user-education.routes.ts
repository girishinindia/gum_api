// ═══════════════════════════════════════════════════════════════
// /api/v1/user-education router — phase 04.
//
// Authorization model (permission codes seeded by
// phase-04/02_seed_permissions.sql for the 'user_education' resource):
//
//   GET    /                   user_education.read                 (admin+)
//   GET    /me                 user_education.read.own             (self, all roles)
//   POST   /me                 user_education.update.own           (self, creates own row)
//   PATCH  /me/:id             user_education.update.own           (self-match enforced)
//   DELETE /me/:id             user_education.delete.own           (self-match enforced)
//   GET    /:id                user_education.read
//                              OR  user_education.read.own     (+ self match)
//   POST   /                   user_education.create               (admin+, targets any userId)
//   PATCH  /:id                user_education.update
//                              OR  user_education.update.own   (+ self match)
//   DELETE /:id                user_education.delete
//                              OR  user_education.delete.own   (+ self match)
//   POST   /:id/restore        user_education.restore              (admin+)
//
// Authority summary:
//   • Super Admin: everything
//   • Admin:       everything EXCEPT the global user_education.delete
//                  (admin keeps delete.own to manage their own rows,
//                   AND user_education.restore to un-soft-delete rows)
//   • Instructor:  only self — read.own + update.own + delete.own
//   • Student:     same as instructor
//
// Deletion is SOFT-DELETE — the row is hidden from default GETs but
// still present in the table. Admin+ can un-delete via POST /:id/restore.
// Instructor/student have no restore path (they never see their own
// deleted rows) and must ask an admin to recover accidental deletes.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { gateSoftDeleteFilters } from '../../../core/middlewares/gate-soft-delete-filters';
import { authorize } from '../../../core/middlewares/authorize';
import { authorizeSelfOr } from '../../../core/middlewares/authorize-self-or';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as userEducationService from '../../../modules/user-education/user-education.service';
import {
  createMyUserEducationBodySchema,
  createUserEducationBodySchema,
  listUserEducationQuerySchema,
  updateUserEducationBodySchema,
  type CreateMyUserEducationBody,
  type CreateUserEducationBody,
  type ListUserEducationQuery,
  type UpdateUserEducationBody
} from '../../../modules/user-education/user-education.schemas';

const router = Router();

router.use(authenticate);
router.use(gateSoftDeleteFilters);

// ═══════════════════════════════════════════════════════════════
// /me routes — must come BEFORE /:id so Express doesn't treat
// "me" as an id segment.
// ═══════════════════════════════════════════════════════════════

// ─── GET /me  (list own education history) ─────────────────────

router.get(
  '/me',
  authorize('user_education.read.own'),
  validate({ query: listUserEducationQuerySchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const q = req.query as unknown as ListUserEducationQuery;
    // Force the ownership filter server-side so a student can't list
    // someone else's rows by omitting userId.
    const { rows, meta } = await userEducationService.listUserEducation({
      ...q,
      userId
    });
    return paginated(res, rows, meta, 'OK');
  })
);

// ─── POST /me  (self-service create) ────────────────────────────

router.post(
  '/me',
  authorize('user_education.update.own'),
  validate({ body: createMyUserEducationBodySchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const body = req.body as CreateMyUserEducationBody;
    const result = await userEducationService.createMyUserEducation(userId, body);
    const row = await userEducationService.getUserEducationById(result.id);
    return created(res, row, 'Education record created');
  })
);

// ─── PATCH /me/:id  (self-service update) ───────────────────────

router.patch(
  '/me/:id',
  validate({ params: idParamSchema, body: updateUserEducationBodySchema }),
  authorize('user_education.update.own'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = Number((req.params as unknown as { id: number }).id);
    const existing = await userEducationService.getUserEducationById(id);

    if (!existing) throw AppError.notFound(`Education record ${id} not found`);
    if (existing.userId !== userId) {
      throw new AppError(
        'You can only edit your own education records.',
        403,
        'FORBIDDEN'
      );
    }

    const body = req.body as UpdateUserEducationBody;
    await userEducationService.updateUserEducation(id, body, userId);
    const row = await userEducationService.getUserEducationById(id);
    return ok(res, row, 'Education record updated');
  })
);

// ─── DELETE /me/:id  (self-service soft-delete) ─────────────────

router.delete(
  '/me/:id',
  validate({ params: idParamSchema }),
  authorize('user_education.delete.own'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = Number((req.params as unknown as { id: number }).id);
    const existing = await userEducationService.getUserEducationById(id);

    if (!existing) throw AppError.notFound(`Education record ${id} not found`);
    if (existing.userId !== userId) {
      throw new AppError(
        'You can only delete your own education records.',
        403,
        'FORBIDDEN'
      );
    }

    await userEducationService.deleteUserEducation(id, userId);
    return ok(res, { id, deleted: true }, 'Education record deleted');
  })
);

// ═══════════════════════════════════════════════════════════════
// Admin + shared endpoints
// ═══════════════════════════════════════════════════════════════

// ─── GET /  list (admin+) ───────────────────────────────────────

router.get(
  '/',
  authorize('user_education.read'),
  validate({ query: listUserEducationQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListUserEducationQuery;
    const { rows, meta } = await userEducationService.listUserEducation(q);
    return paginated(res, rows, meta, 'OK');
  })
);

// ─── POST /  create (admin+, targets any userId) ───────────────

router.post(
  '/',
  authorize('user_education.create'),
  validate({ body: createUserEducationBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateUserEducationBody;
    const result = await userEducationService.createUserEducation(
      body,
      req.user?.id ?? null
    );
    const row = await userEducationService.getUserEducationById(result.id);
    return created(res, row, 'Education record created');
  })
);

// ─── GET /:id  (self-or-admin) ──────────────────────────────────

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  authorizeSelfOr({
    globalPermission: 'user_education.read',
    ownPermission: 'user_education.read.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const row = await userEducationService.getUserEducationById(id);
      return row ? row.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await userEducationService.getUserEducationById(id);
    if (!row) throw AppError.notFound(`Education record ${id} not found`);
    return ok(res, row, 'OK');
  })
);

// ─── PATCH /:id  (self-or-admin) ────────────────────────────────

router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateUserEducationBodySchema }),
  authorizeSelfOr({
    globalPermission: 'user_education.update',
    ownPermission: 'user_education.update.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const row = await userEducationService.getUserEducationById(id);
      return row ? row.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateUserEducationBody;
    await userEducationService.updateUserEducation(id, body, req.user?.id ?? null);
    const row = await userEducationService.getUserEducationById(id);
    return ok(res, row, 'Education record updated');
  })
);

// ─── DELETE /:id  (self-or-admin, soft-delete) ─────────────────

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  authorizeSelfOr({
    globalPermission: 'user_education.delete',
    ownPermission: 'user_education.delete.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const row = await userEducationService.getUserEducationById(id);
      return row ? row.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await userEducationService.deleteUserEducation(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Education record deleted');
  })
);

// ─── POST /:id/restore  (admin+ only, un-soft-delete) ──────────

router.post(
  '/:id/restore',
  validate({ params: idParamSchema }),
  authorize('user_education.restore'),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    // The row is currently hidden from default GET (phase-04 policy).
    // Look it up with the include-deleted helper so we can surface a
    // clear 404 before the UDF raises a less helpful error.
    const existing = await userEducationService.getUserEducationByIdIncludingDeleted(id);
    if (!existing) {
      throw AppError.notFound(`Education record ${id} not found`);
    }
    if (!existing.isDeleted) {
      throw new AppError(
        `Education record ${id} is not deleted; nothing to restore`,
        400,
        'BAD_REQUEST'
      );
    }

    await userEducationService.restoreUserEducation(id, req.user?.id ?? null);
    const row = await userEducationService.getUserEducationById(id);
    return ok(res, row, 'Education record restored');
  })
);

export default router;
