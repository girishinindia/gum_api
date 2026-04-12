import { Router } from 'express';
import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { authorizeSelfOr } from '../../../core/middlewares/authorize-self-or';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { ok, created, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as instructorProfilesService from '../../../modules/instructor-profiles/instructor-profiles.service';
import {
  listInstructorProfilesQuerySchema,
  createInstructorProfileBodySchema,
  updateInstructorProfileBodySchema,
} from '../../../modules/instructor-profiles/instructor-profiles.schemas';
import type {
  ListInstructorProfilesQuery,
  CreateInstructorProfileBody,
  UpdateInstructorProfileBody,
} from '../../../modules/instructor-profiles/instructor-profiles.schemas';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ═══════════════════════════════════════════════════════════════
// /me  — self-service (own instructor profile)
// Must be registered BEFORE /:id to avoid route collision.
// ═══════════════════════════════════════════════════════════════

router.get(
  '/me',
  authorize('instructor_profile.read.own'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const profile = await instructorProfilesService.getInstructorProfileByUserId(userId);
    if (!profile) {
      throw AppError.notFound('You do not have an instructor profile.');
    }
    return ok(res, profile, 'OK');
  }),
);

router.patch(
  '/me',
  authorize('instructor_profile.update.own'),
  validate({ body: updateInstructorProfileBodySchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const existing = await instructorProfilesService.getInstructorProfileByUserId(userId);
    if (!existing) {
      throw AppError.notFound('You do not have an instructor profile.');
    }
    const body = req.body as UpdateInstructorProfileBody;
    await instructorProfilesService.updateInstructorProfile(existing.id, body, userId);
    const updated = await instructorProfilesService.getInstructorProfileById(existing.id);
    return ok(res, updated, 'Instructor profile updated');
  }),
);

// ═══════════════════════════════════════════════════════════════
// Admin / global endpoints
// ═══════════════════════════════════════════════════════════════

// ── GET /  (list + pagination + filters + search) ───────────
router.get(
  '/',
  authorize('instructor_profile.read'),
  validate({ query: listInstructorProfilesQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListInstructorProfilesQuery;
    const { rows, meta } = await instructorProfilesService.listInstructorProfiles(q);
    return paginated(res, rows, meta, 'OK');
  }),
);

// ── POST /  (create) ────────────────────────────────────────
router.post(
  '/',
  authorize('instructor_profile.create'),
  validate({ body: createInstructorProfileBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateInstructorProfileBody;
    const result = await instructorProfilesService.createInstructorProfile(
      body,
      req.user?.id ?? null,
    );
    const profile = await instructorProfilesService.getInstructorProfileById(result.id);
    return created(res, profile, 'Instructor profile created');
  }),
);

// ── GET /:id  (single) ──────────────────────────────────────
router.get(
  '/:id',
  validate({ params: idParamSchema }),
  authorizeSelfOr({
    globalPermission: 'instructor_profile.read',
    ownPermission: 'instructor_profile.read.own',
    resolveTargetUserId: async (req) => {
      const id = Number(req.params.id);
      const profile = await instructorProfilesService.getInstructorProfileById(id);
      return profile?.userId ?? null;
    },
  }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const profile = await instructorProfilesService.getInstructorProfileById(id);
    if (!profile) {
      throw AppError.notFound(`Instructor profile ${id} not found`);
    }
    return ok(res, profile, 'OK');
  }),
);

// ── PATCH /:id  (update) ────────────────────────────────────
router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateInstructorProfileBodySchema }),
  authorizeSelfOr({
    globalPermission: 'instructor_profile.update',
    ownPermission: 'instructor_profile.update.own',
    resolveTargetUserId: async (req) => {
      const profile = await instructorProfilesService.getInstructorProfileById(
        Number(req.params.id),
      );
      return profile?.userId ?? null;
    },
  }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body as UpdateInstructorProfileBody;
    await instructorProfilesService.updateInstructorProfile(
      id,
      body,
      req.user?.id ?? null,
    );
    const profile = await instructorProfilesService.getInstructorProfileById(id);
    return ok(res, profile, 'Instructor profile updated');
  }),
);

// ── DELETE /:id  (hard delete — SA only) ────────────────────
router.delete(
  '/:id',
  authorize('instructor_profile.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await instructorProfilesService.getInstructorProfileById(id);
    if (!existing) {
      throw AppError.notFound(`Instructor profile ${id} not found`);
    }
    await instructorProfilesService.deleteInstructorProfile(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Instructor profile deleted');
  }),
);

export default router;
