// ═══════════════════════════════════════════════════════════════
// /api/v1/user-social-medias router — phase 04.
//
// Authorization model (permission codes seeded by
// phase-04/02_seed_permissions.sql for the 'user_social_media'
// resource — note singular):
//
//   GET    /                   user_social_media.read                 (admin+)
//   GET    /me                 user_social_media.read.own             (self, all roles)
//   POST   /me                 user_social_media.update.own           (self, creates own row)
//   PATCH  /me/:id             user_social_media.update.own           (self-match enforced)
//   DELETE /me/:id             user_social_media.delete.own           (self-match enforced)
//   GET    /:id                user_social_media.read
//                              OR  user_social_media.read.own     (+ self match)
//   POST   /                   user_social_media.create               (admin+, targets any userId)
//   PATCH  /:id                user_social_media.update
//                              OR  user_social_media.update.own   (+ self match)
//   DELETE /:id                user_social_media.delete
//                              OR  user_social_media.delete.own   (+ self match)
//   POST   /:id/restore        user_social_media.restore              (admin+)
//
// Deletion is SOFT — the row is hidden from default GETs but still
// present in the table. Admin+ can un-delete via POST /:id/restore.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { gateSoftDeleteFilters } from '../../../core/middlewares/gate-soft-delete-filters';
import { authorize, authorizeRole } from '../../../core/middlewares/authorize';
import { authorizeSelfOr } from '../../../core/middlewares/authorize-self-or';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as userSocialMediasService from '../../../modules/user-social-medias/user-social-medias.service';
import {
  createMyUserSocialMediaBodySchema,
  createUserSocialMediaBodySchema,
  listUserSocialMediasQuerySchema,
  updateUserSocialMediaBodySchema,
  type CreateMyUserSocialMediaBody,
  type CreateUserSocialMediaBody,
  type ListUserSocialMediasQuery,
  type UpdateUserSocialMediaBody
} from '../../../modules/user-social-medias/user-social-medias.schemas';

const router = Router();

router.use(authenticate);
router.use(gateSoftDeleteFilters);

// ═══════════════════════════════════════════════════════════════
// /me routes — must come BEFORE /:id so Express doesn't treat
// "me" as an id segment.
// ═══════════════════════════════════════════════════════════════

router.get(
  '/me',
  authorize('user_social_media.read.own'),
  validate({ query: listUserSocialMediasQuerySchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const q = req.query as unknown as ListUserSocialMediasQuery;
    const { rows, meta } = await userSocialMediasService.listUserSocialMedias({
      ...q,
      userId
    });
    return paginated(res, rows, meta, 'OK');
  })
);

router.post(
  '/me',
  authorize('user_social_media.update.own'),
  validate({ body: createMyUserSocialMediaBodySchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const body = req.body as CreateMyUserSocialMediaBody;
    const result = await userSocialMediasService.createMyUserSocialMedia(userId, body);
    const row = await userSocialMediasService.getUserSocialMediaById(result.id);
    return created(res, row, 'Social media link created');
  })
);

router.patch(
  '/me/:id',
  validate({ params: idParamSchema, body: updateUserSocialMediaBodySchema }),
  authorize('user_social_media.update.own'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = Number((req.params as unknown as { id: number }).id);
    const existing = await userSocialMediasService.getUserSocialMediaById(id);

    if (!existing) throw AppError.notFound(`Social media record ${id} not found`);
    if (existing.userId !== userId) {
      throw new AppError(
        'You can only edit your own social media links.',
        403,
        'FORBIDDEN'
      );
    }

    const body = req.body as UpdateUserSocialMediaBody;
    await userSocialMediasService.updateUserSocialMedia(id, body, userId);
    const row = await userSocialMediasService.getUserSocialMediaById(id);
    return ok(res, row, 'Social media link updated');
  })
);

router.delete(
  '/me/:id',
  validate({ params: idParamSchema }),
  authorize('user_social_media.delete.own'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const id = Number((req.params as unknown as { id: number }).id);
    const existing = await userSocialMediasService.getUserSocialMediaById(id);

    if (!existing) throw AppError.notFound(`Social media record ${id} not found`);
    if (existing.userId !== userId) {
      throw new AppError(
        'You can only delete your own social media links.',
        403,
        'FORBIDDEN'
      );
    }

    await userSocialMediasService.deleteUserSocialMedia(id, userId);
    return ok(res, { id, deleted: true }, 'Social media link deleted');
  })
);

// ═══════════════════════════════════════════════════════════════
// Admin + shared endpoints
// ═══════════════════════════════════════════════════════════════

router.get(
  '/',
  authorize('user_social_media.read'),
  validate({ query: listUserSocialMediasQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListUserSocialMediasQuery;
    const { rows, meta } = await userSocialMediasService.listUserSocialMedias(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.post(
  '/',
  authorize('user_social_media.create'),
  validate({ body: createUserSocialMediaBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateUserSocialMediaBody;
    const result = await userSocialMediasService.createUserSocialMedia(
      body,
      req.user?.id ?? null
    );
    const row = await userSocialMediasService.getUserSocialMediaById(result.id);
    return created(res, row, 'Social media link created');
  })
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  authorizeSelfOr({
    globalPermission: 'user_social_media.read',
    ownPermission: 'user_social_media.read.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const row = await userSocialMediasService.getUserSocialMediaById(id);
      return row ? row.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await userSocialMediasService.getUserSocialMediaById(id);
    if (!row) throw AppError.notFound(`Social media record ${id} not found`);
    return ok(res, row, 'OK');
  })
);

router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateUserSocialMediaBodySchema }),
  authorizeSelfOr({
    globalPermission: 'user_social_media.update',
    ownPermission: 'user_social_media.update.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const row = await userSocialMediasService.getUserSocialMediaById(id);
      return row ? row.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateUserSocialMediaBody;
    await userSocialMediasService.updateUserSocialMedia(id, body, req.user?.id ?? null);
    const row = await userSocialMediasService.getUserSocialMediaById(id);
    return ok(res, row, 'Social media link updated');
  })
);

router.delete(
  '/:id',
  validate({ params: idParamSchema }),
  authorizeSelfOr({
    globalPermission: 'user_social_media.delete',
    ownPermission: 'user_social_media.delete.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const row = await userSocialMediasService.getUserSocialMediaById(id);
      return row ? row.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await userSocialMediasService.deleteUserSocialMedia(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Social media link deleted');
  })
);

router.post(
  '/:id/restore',
  authorizeRole('super_admin'),
  validate({ params: idParamSchema }),
  authorize('user_social_media.restore'),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const existing = await userSocialMediasService.getUserSocialMediaByIdIncludingDeleted(id);
    if (!existing) {
      throw AppError.notFound(`Social media record ${id} not found`);
    }
    if (!existing.isDeleted) {
      throw new AppError(
        `Social media record ${id} is not deleted; nothing to restore`,
        400,
        'BAD_REQUEST'
      );
    }

    await userSocialMediasService.restoreUserSocialMedia(id, req.user?.id ?? null);
    const row = await userSocialMediasService.getUserSocialMediaById(id);
    return ok(res, row, 'Social media link restored');
  })
);

export default router;
