import { Router } from 'express';
import { authenticate } from '../../../core/middlewares/authenticate';
import { gateSoftDeleteFilters } from '../../../core/middlewares/gate-soft-delete-filters';
import { authorize } from '../../../core/middlewares/authorize';
import { authorizeSelfOr } from '../../../core/middlewares/authorize-self-or';
import { validate } from '../../../core/middlewares/validate';
import { patchStudentProfileFiles, getSlotFile } from '../../../core/middlewares/upload';
import { coerceMultipartBody } from '../../../core/middlewares/multipart-body-coerce';
import { AppError } from '../../../core/errors/app-error';
import { ok, created, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as studentProfilesService from '../../../modules/student-profiles/student-profiles.service';
import {
  listStudentProfilesQuerySchema,
  createStudentProfileBodySchema,
  updateStudentProfileBodySchema,
} from '../../../modules/student-profiles/student-profiles.schemas';
import type {
  ListStudentProfilesQuery,
  CreateStudentProfileBody,
  UpdateStudentProfileBody,
} from '../../../modules/student-profiles/student-profiles.schemas';

const router = Router();

// All routes require authentication
router.use(authenticate);
router.use(gateSoftDeleteFilters);

// ═══════════════════════════════════════════════════════════════
// /me  — self-service (own student profile)
// Must be registered BEFORE /:id to avoid route collision.
// ═══════════════════════════════════════════════════════════════

router.get(
  '/me',
  authorize('student_profile.read.own'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const profile = await studentProfilesService.getStudentProfileByUserId(userId);
    if (!profile) {
      throw AppError.notFound('You do not have a student profile.');
    }
    return ok(res, profile, 'OK');
  }),
);

router.patch(
  '/me',
  authorize('student_profile.update.own'),
  patchStudentProfileFiles,
  coerceMultipartBody,
  validate({ body: updateStudentProfileBodySchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const resume = getSlotFile(req, 'resume');
    const body = req.body as UpdateStudentProfileBody;

    const existing = await studentProfilesService.getStudentProfileByUserId(userId);
    if (!existing) {
      throw AppError.notFound('You do not have a student profile.');
    }

    const hasTextChange = Object.keys(body).length > 0;
    const hasFile = Boolean(resume);
    if (!hasTextChange && !hasFile) {
      throw AppError.badRequest('Provide at least one field to update');
    }

    if (hasTextChange) {
      await studentProfilesService.updateStudentProfile(existing.id, body, userId);
    }
    if (hasFile) {
      await studentProfilesService.processStudentResumeUpload(
        existing.id,
        resume as Express.Multer.File,
        userId
      );
    }

    const updated = await studentProfilesService.getStudentProfileById(existing.id);
    return ok(res, updated, 'Student profile updated');
  }),
);

// ═══════════════════════════════════════════════════════════════
// Admin / global endpoints
// ═══════════════════════════════════════════════════════════════

// ── GET /  (list + pagination + filters + search) ───────────
router.get(
  '/',
  authorize('student_profile.read'),
  validate({ query: listStudentProfilesQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListStudentProfilesQuery;
    const { rows, meta } = await studentProfilesService.listStudentProfiles(q);
    return paginated(res, rows, meta, 'OK');
  }),
);

// ── POST /  (create) ────────────────────────────────────────
router.post(
  '/',
  authorize('student_profile.create'),
  patchStudentProfileFiles,
  coerceMultipartBody,
  validate({ body: createStudentProfileBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateStudentProfileBody;
    const resume = getSlotFile(req, 'resume');

    const result = await studentProfilesService.createStudentProfile(
      body,
      req.user?.id ?? null,
    );
    if (resume) {
      await studentProfilesService.processStudentResumeUpload(
        result.id,
        resume as Express.Multer.File,
        req.user?.id ?? null
      );
    }
    const profile = await studentProfilesService.getStudentProfileById(result.id);
    return created(res, profile, 'Student profile created');
  }),
);

// ── GET /:id  (single) ──────────────────────────────────────
router.get(
  '/:id',
  validate({ params: idParamSchema }),
  authorizeSelfOr({
    globalPermission: 'student_profile.read',
    ownPermission: 'student_profile.read.own',
    resolveTargetUserId: async (req) => {
      const id = Number(req.params.id);
      const profile = await studentProfilesService.getStudentProfileById(id);
      return profile?.userId ?? null;
    },
  }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const profile = await studentProfilesService.getStudentProfileById(id);
    if (!profile) {
      throw AppError.notFound(`Student profile ${id} not found`);
    }
    return ok(res, profile, 'OK');
  }),
);

// ── PATCH /:id  (update) ────────────────────────────────────
router.patch(
  '/:id',
  patchStudentProfileFiles,
  coerceMultipartBody,
  validate({ params: idParamSchema, body: updateStudentProfileBodySchema }),
  authorizeSelfOr({
    globalPermission: 'student_profile.update',
    ownPermission: 'student_profile.update.own',
    resolveTargetUserId: async (req) => {
      const profile = await studentProfilesService.getStudentProfileById(
        Number(req.params.id),
      );
      return profile?.userId ?? null;
    },
  }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body as UpdateStudentProfileBody;
    const resume = getSlotFile(req, 'resume');

    const hasTextChange = Object.keys(body).length > 0;
    const hasFile = Boolean(resume);
    if (!hasTextChange && !hasFile) {
      throw AppError.badRequest('Provide at least one field to update');
    }

    if (hasTextChange) {
      await studentProfilesService.updateStudentProfile(
        id,
        body,
        req.user?.id ?? null,
      );
    }
    if (hasFile) {
      await studentProfilesService.processStudentResumeUpload(
        id,
        resume as Express.Multer.File,
        req.user?.id ?? null
      );
    }

    const profile = await studentProfilesService.getStudentProfileById(id);
    return ok(res, profile, 'Student profile updated');
  }),
);

// ── DELETE /:id  (soft delete — admin only) ────────────────────
router.delete(
  '/:id',
  authorize('student_profile.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await studentProfilesService.getStudentProfileById(id);
    if (!existing) {
      throw AppError.notFound(`Student profile ${id} not found`);
    }
    await studentProfilesService.deleteStudentProfile(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Student profile deleted');
  }),
);

// ── RESTORE /:id  (soft-delete undo — admin only) ───────────
router.post(
  '/:id/restore',
  authorize('student_profile.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await studentProfilesService.restoreStudentProfile(id, req.user?.id ?? null);
    return ok(res, { id, restored: true }, 'Student profile restored');
  }),
);

export default router;
