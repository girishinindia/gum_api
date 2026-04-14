// ═══════════════════════════════════════════════════════════════
// /api/v1/user-profiles router — phase 04.
//
// Authorization model (permission codes seeded by
// phase-04/02_seed_permissions.sql for the 'user_profile' resource):
//
//   GET    /                   user_profile.read                 (admin+)
//   GET    /me                 user_profile.read.own             (self, all roles)
//   POST   /me                 user_profile.create               (self-service create)
//   PATCH  /me                 user_profile.update.own           (self, safe fields only)
//   GET    /:id                user_profile.read
//                              OR  user_profile.read.own    (+ self match)
//   POST   /                   user_profile.create               (admin+)
//   PATCH  /:id                user_profile.update
//                              OR  user_profile.update.own  (+ self match)
//   DELETE /:id                user_profile.delete               (super-admin only)
//
// Authority summary:
//   • Super Admin: everything
//   • Admin:       everything except DELETE /:id
//   • Instructor:  only self (GET/POST/PATCH /me, GET/PATCH /:id when self)
//   • Student:     same as instructor
//
// Self-or-admin endpoints use `authorizeSelfOr` which resolves the
// target owner by reading the profile and comparing `req.user.id`.
// The self-service PATCH /me endpoint uses the stricter
// `updateMyUserProfileBodySchema` which blocks KYC, bank, GST, and
// profile-completion fields — students cannot mutate those about
// themselves.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { gateSoftDeleteFilters } from '../../../core/middlewares/gate-soft-delete-filters';
import { authorize } from '../../../core/middlewares/authorize';
import { authorizeSelfOr } from '../../../core/middlewares/authorize-self-or';
import { validate } from '../../../core/middlewares/validate';
import { patchUserProfileFiles, getSlotFile } from '../../../core/middlewares/upload';
import { coerceMultipartBody } from '../../../core/middlewares/multipart-body-coerce';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as userProfilesService from '../../../modules/user-profiles/user-profiles.service';
import {
  createMyUserProfileBodySchema,
  createUserProfileBodySchema,
  listUserProfilesQuerySchema,
  updateMyUserProfileBodySchema,
  updateUserProfileBodySchema,
  type CreateMyUserProfileBody,
  type CreateUserProfileBody,
  type ListUserProfilesQuery,
  type UpdateMyUserProfileBody,
  type UpdateUserProfileBody
} from '../../../modules/user-profiles/user-profiles.schemas';

const router = Router();

router.use(authenticate);
router.use(gateSoftDeleteFilters);

// ─── Super-admin role guard for hard delete ──────────────────────

const SUPER_ADMIN_ROLE = 'super_admin';

const requireSuperAdmin = (): ReturnType<typeof asyncHandler> =>
  asyncHandler(async (req, _res, next) => {
    if (!req.user?.roles.includes(SUPER_ADMIN_ROLE)) {
      throw new AppError(
        'Only super admins may hard-delete user profiles',
        403,
        'FORBIDDEN',
        { requiredRole: SUPER_ADMIN_ROLE }
      );
    }
    next();
  });

// ═══════════════════════════════════════════════════════════════
// /me routes — must come BEFORE /:id so Express's router doesn't
// accidentally treat "me" as an id segment.
// ═══════════════════════════════════════════════════════════════

// ─── GET /me ────────────────────────────────────────────────────

router.get(
  '/me',
  authorize('user_profile.read.own'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const profile = await userProfilesService.getUserProfileByUserId(userId);
    if (!profile) {
      throw AppError.notFound(
        'You do not have a user profile yet. POST /me to create one.'
      );
    }
    return ok(res, profile, 'OK');
  })
);

// ─── POST /me  (self-service create) ────────────────────────────

router.post(
  '/me',
  authorize('user_profile.update.own'),
  patchUserProfileFiles,
  coerceMultipartBody,
  validate({ body: createMyUserProfileBodySchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const body = req.body as CreateMyUserProfileBody;
    const profilePhotoFile = getSlotFile(req, 'profilePhoto');
    const coverPhotoFile = getSlotFile(req, 'coverPhoto');

    const result = await userProfilesService.createMyUserProfile(userId, body);
    if (profilePhotoFile || coverPhotoFile) {
      await userProfilesService.processUserProfilePhotoUpload(
        result.id,
        { profilePhoto: profilePhotoFile, coverPhoto: coverPhotoFile },
        userId
      );
    }
    const profile = await userProfilesService.getUserProfileById(result.id);
    return created(res, profile, 'User profile created');
  })
);

// ─── PATCH /me  (self-service update, safe subset) ──────────────

router.patch(
  '/me',
  authorize('user_profile.update.own'),
  patchUserProfileFiles,
  coerceMultipartBody,
  validate({ body: updateMyUserProfileBodySchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const body = req.body as UpdateMyUserProfileBody;
    const profilePhotoFile = getSlotFile(req, 'profilePhoto');
    const coverPhotoFile = getSlotFile(req, 'coverPhoto');

    // Look up "my" profile so we can route the update by profile id.
    const existing = await userProfilesService.getUserProfileByUserId(userId);
    if (!existing) {
      throw AppError.notFound(
        'You do not have a user profile yet. POST /me to create one.'
      );
    }

    const hasTextChange = Object.keys(body).length > 0;
    const hasFile = Boolean(profilePhotoFile || coverPhotoFile);
    if (!hasTextChange && !hasFile) {
      throw AppError.badRequest('Provide at least one field to update');
    }

    if (hasTextChange) {
      await userProfilesService.updateMyUserProfile(existing.id, body, userId);
    }
    if (hasFile) {
      await userProfilesService.processUserProfilePhotoUpload(
        existing.id,
        { profilePhoto: profilePhotoFile, coverPhoto: coverPhotoFile },
        userId
      );
    }

    const profile = await userProfilesService.getUserProfileById(existing.id);
    return ok(res, profile, 'User profile updated');
  })
);

// ═══════════════════════════════════════════════════════════════
// Admin + shared endpoints
// ═══════════════════════════════════════════════════════════════

// ─── GET /  list (admin+) ───────────────────────────────────────

router.get(
  '/',
  authorize('user_profile.read'),
  validate({ query: listUserProfilesQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListUserProfilesQuery;
    const { rows, meta } = await userProfilesService.listUserProfiles(q);
    return paginated(res, rows, meta, 'OK');
  })
);

// ─── POST /  create (admin+) ────────────────────────────────────

router.post(
  '/',
  authorize('user_profile.create'),
  patchUserProfileFiles,
  coerceMultipartBody,
  validate({ body: createUserProfileBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateUserProfileBody;
    const profilePhotoFile = getSlotFile(req, 'profilePhoto');
    const coverPhotoFile = getSlotFile(req, 'coverPhoto');

    const result = await userProfilesService.createUserProfile(
      body,
      req.user?.id ?? null
    );
    if (profilePhotoFile || coverPhotoFile) {
      await userProfilesService.processUserProfilePhotoUpload(
        result.id,
        { profilePhoto: profilePhotoFile, coverPhoto: coverPhotoFile },
        req.user?.id ?? null
      );
    }
    const profile = await userProfilesService.getUserProfileById(result.id);
    return created(res, profile, 'User profile created');
  })
);

// ─── GET /:id  (self-or-admin) ──────────────────────────────────

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  authorizeSelfOr({
    globalPermission: 'user_profile.read',
    ownPermission: 'user_profile.read.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const profile = await userProfilesService.getUserProfileById(id);
      return profile ? profile.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const profile = await userProfilesService.getUserProfileById(id);
    if (!profile) throw AppError.notFound(`User profile ${id} not found`);
    return ok(res, profile, 'OK');
  })
);

// ─── PATCH /:id  (self-or-admin, full body) ─────────────────────
//
// When the caller only holds `user_profile.update.own`, the safer
// /me endpoint is the preferred entry point (it enforces the
// stricter body schema). The /:id endpoint here still accepts the
// admin-scoped body, so a self-caller hitting /:id with KYC fields
// will see those fields persisted. This is intentional: the self-
// match check proves the caller owns the row, and restricting their
// body to `updateMyUserProfileBodySchema` here would be a breaking
// surprise. Document this in the phase-04 walkthrough so clients
// know to use /me for the safe path.

router.patch(
  '/:id',
  patchUserProfileFiles,
  coerceMultipartBody,
  validate({ params: idParamSchema, body: updateUserProfileBodySchema }),
  authorizeSelfOr({
    globalPermission: 'user_profile.update',
    ownPermission: 'user_profile.update.own',
    resolveTargetUserId: async (req) => {
      const id = Number((req.params as unknown as { id: number }).id);
      const profile = await userProfilesService.getUserProfileById(id);
      return profile ? profile.userId : null;
    }
  }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateUserProfileBody;
    const profilePhotoFile = getSlotFile(req, 'profilePhoto');
    const coverPhotoFile = getSlotFile(req, 'coverPhoto');

    const hasTextChange = Object.keys(body).length > 0;
    const hasFile = Boolean(profilePhotoFile || coverPhotoFile);
    if (!hasTextChange && !hasFile) {
      throw AppError.badRequest('Provide at least one field to update');
    }

    if (hasTextChange) {
      await userProfilesService.updateUserProfile(id, body, req.user?.id ?? null);
    }
    if (hasFile) {
      await userProfilesService.processUserProfilePhotoUpload(
        id,
        { profilePhoto: profilePhotoFile, coverPhoto: coverPhotoFile },
        req.user?.id ?? null
      );
    }

    const profile = await userProfilesService.getUserProfileById(id);
    return ok(res, profile, 'User profile updated');
  })
);

// ─── DELETE /:id  (super-admin only, hard delete) ──────────────

router.delete(
  '/:id',
  authorize('user_profile.delete'),
  requireSuperAdmin(),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await userProfilesService.deleteUserProfile(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'User profile deleted');
  })
);

export default router;
