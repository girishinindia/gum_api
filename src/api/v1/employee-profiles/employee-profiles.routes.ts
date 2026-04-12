import { Router } from 'express';
import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { authorizeSelfOr } from '../../../core/middlewares/authorize-self-or';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { ok, created, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as employeeProfilesService from '../../../modules/employee-profiles/employee-profiles.service';
import {
  listEmployeeProfilesQuerySchema,
  createEmployeeProfileBodySchema,
  updateEmployeeProfileBodySchema,
} from '../../../modules/employee-profiles/employee-profiles.schemas';
import type {
  ListEmployeeProfilesQuery,
  CreateEmployeeProfileBody,
  UpdateEmployeeProfileBody,
} from '../../../modules/employee-profiles/employee-profiles.schemas';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ═══════════════════════════════════════════════════════════════
// /me  — self-service (own employee profile)
// Must be registered BEFORE /:id to avoid route collision.
// ═══════════════════════════════════════════════════════════════

router.get(
  '/me',
  authorize('employee_profile.read.own'),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const profile = await employeeProfilesService.getEmployeeProfileByUserId(userId);
    if (!profile) {
      throw AppError.notFound('You do not have an employee profile.');
    }
    return ok(res, profile, 'OK');
  }),
);

router.patch(
  '/me',
  authorize('employee_profile.update.own'),
  validate({ body: updateEmployeeProfileBodySchema }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const existing = await employeeProfilesService.getEmployeeProfileByUserId(userId);
    if (!existing) {
      throw AppError.notFound('You do not have an employee profile.');
    }
    const body = req.body as UpdateEmployeeProfileBody;
    await employeeProfilesService.updateEmployeeProfile(existing.id, body, userId);
    const updated = await employeeProfilesService.getEmployeeProfileById(existing.id);
    return ok(res, updated, 'Employee profile updated');
  }),
);

// ═══════════════════════════════════════════════════════════════
// Admin / global endpoints
// ═══════════════════════════════════════════════════════════════

// ── GET /  (list + pagination + filters + search) ───────────
router.get(
  '/',
  authorize('employee_profile.read'),
  validate({ query: listEmployeeProfilesQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListEmployeeProfilesQuery;
    const { rows, meta } = await employeeProfilesService.listEmployeeProfiles(q);
    return paginated(res, rows, meta, 'OK');
  }),
);

// ── POST /  (create) ────────────────────────────────────────
router.post(
  '/',
  authorize('employee_profile.create'),
  validate({ body: createEmployeeProfileBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateEmployeeProfileBody;
    const result = await employeeProfilesService.createEmployeeProfile(
      body,
      req.user?.id ?? null,
    );
    const profile = await employeeProfilesService.getEmployeeProfileById(result.id);
    return created(res, profile, 'Employee profile created');
  }),
);

// ── GET /:id  (single) ──────────────────────────────────────
router.get(
  '/:id',
  validate({ params: idParamSchema }),
  authorizeSelfOr({
    globalPermission: 'employee_profile.read',
    ownPermission: 'employee_profile.read.own',
    resolveTargetUserId: async (req) => {
      const id = Number(req.params.id);
      const profile = await employeeProfilesService.getEmployeeProfileById(id);
      return profile?.userId ?? null;
    },
  }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const profile = await employeeProfilesService.getEmployeeProfileById(id);
    if (!profile) {
      throw AppError.notFound(`Employee profile ${id} not found`);
    }
    return ok(res, profile, 'OK');
  }),
);

// ── PATCH /:id  (update) ────────────────────────────────────
router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateEmployeeProfileBodySchema }),
  authorizeSelfOr({
    globalPermission: 'employee_profile.update',
    ownPermission: 'employee_profile.update.own',
    resolveTargetUserId: async (req) => {
      const profile = await employeeProfilesService.getEmployeeProfileById(
        Number(req.params.id),
      );
      return profile?.userId ?? null;
    },
  }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body as UpdateEmployeeProfileBody;
    await employeeProfilesService.updateEmployeeProfile(
      id,
      body,
      req.user?.id ?? null,
    );
    const profile = await employeeProfilesService.getEmployeeProfileById(id);
    return ok(res, profile, 'Employee profile updated');
  }),
);

// ── DELETE /:id  (hard delete — SA only) ────────────────────
router.delete(
  '/:id',
  authorize('employee_profile.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await employeeProfilesService.getEmployeeProfileById(id);
    if (!existing) {
      throw AppError.notFound(`Employee profile ${id} not found`);
    }
    await employeeProfilesService.deleteEmployeeProfile(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Employee profile deleted');
  }),
);

export default router;
