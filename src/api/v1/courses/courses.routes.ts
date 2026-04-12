// ═══════════════════════════════════════════════════════════════
// /api/v1/courses router — phase 09 course management CRUD.
//
// Authorization model:
//   Course CRUD:
//     GET    /              course.read
//     GET    /:id           course.read
//     POST   /              course.create
//     PATCH  /:id           course.update
//     DELETE /:id           course.delete
//     POST   /:id/restore   course.restore
//
//   Translation sub-resource (nested under /:id/translations):
//     GET    /:id/translations              course.read
//     GET    /:id/translations/:tid         course.read
//     POST   /:id/translations              course.create
//     PATCH  /:id/translations/:tid         course.update
//     DELETE /:id/translations/:tid         course.delete
//     POST   /:id/translations/:tid/restore course.restore
//
// All routes require an authenticated user.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as coursesService from '../../../modules/courses/courses.service';
import {
  createCourseBodySchema,
  listCoursesQuerySchema,
  updateCourseBodySchema,
  createCourseTranslationBodySchema,
  listCourseTranslationsQuerySchema,
  updateCourseTranslationBodySchema,
  type CreateCourseBody,
  type ListCoursesQuery,
  type UpdateCourseBody,
  type CreateCourseTranslationBody,
  type ListCourseTranslationsQuery,
  type UpdateCourseTranslationBody
} from '../../../modules/courses/courses.schemas';

const router = Router();

router.use(authenticate);

// ─── Course CRUD ────────────────────────────────────────────────

router.get(
  '/',
  authorize('course.read'),
  validate({ query: listCoursesQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListCoursesQuery;
    const { rows, meta } = await coursesService.listCourses(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('course.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const c = await coursesService.getCourseById(id);
    if (!c) throw AppError.notFound(`Course ${id} not found`);
    return ok(res, c, 'OK');
  })
);

router.post(
  '/',
  authorize('course.create'),
  validate({ body: createCourseBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateCourseBody;
    const result = await coursesService.createCourse(body, req.user?.id ?? null);
    const c = await coursesService.getCourseById(result.id);
    return created(res, c, 'Course created');
  })
);

router.patch(
  '/:id',
  authorize('course.update'),
  validate({ params: idParamSchema, body: updateCourseBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateCourseBody;
    await coursesService.updateCourse(id, body, req.user?.id ?? null);
    const c = await coursesService.getCourseById(id);
    return ok(res, c, 'Course updated');
  })
);

router.delete(
  '/:id',
  authorize('course.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await coursesService.deleteCourse(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Course deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('course.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await coursesService.restoreCourse(id, req.user?.id ?? null);
    const c = await coursesService.getCourseById(id);
    return ok(res, c, 'Course restored');
  })
);

// ─── Translation sub-resource ───────────────────────────────────

router.get(
  '/:id/translations',
  authorize('course.read'),
  validate({ params: idParamSchema, query: listCourseTranslationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const courseId = Number((req.params as unknown as { id: number }).id);
    const q = req.query as unknown as ListCourseTranslationsQuery;
    const { rows, meta } = await coursesService.listCourseTranslations(courseId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id/translations/:tid',
  authorize('course.read'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    const ct = await coursesService.getCourseTranslationById(tid);
    if (!ct) throw AppError.notFound(`Course translation ${tid} not found`);
    return ok(res, ct, 'OK');
  })
);

router.post(
  '/:id/translations',
  authorize('course.create'),
  validate({ params: idParamSchema, body: createCourseTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const courseId = Number((req.params as unknown as { id: number }).id);
    const body = req.body as CreateCourseTranslationBody;
    const result = await coursesService.createCourseTranslation(
      courseId,
      body,
      req.user?.id ?? null
    );
    const ct = await coursesService.getCourseTranslationById(result.id);
    return created(res, ct, 'Course translation created');
  })
);

router.patch(
  '/:id/translations/:tid',
  authorize('course.update'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    }),
    body: updateCourseTranslationBodySchema
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    const body = req.body as UpdateCourseTranslationBody;
    await coursesService.updateCourseTranslation(tid, body, req.user?.id ?? null);
    const ct = await coursesService.getCourseTranslationById(tid);
    return ok(res, ct, 'Course translation updated');
  })
);

router.delete(
  '/:id/translations/:tid',
  authorize('course.delete'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    await coursesService.deleteCourseTranslation(tid, req.user?.id ?? null);
    return ok(res, { id: tid, deleted: true }, 'Course translation deleted');
  })
);

router.post(
  '/:id/translations/:tid/restore',
  authorize('course.restore'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    await coursesService.restoreCourseTranslation(tid, req.user?.id ?? null);
    const ct = await coursesService.getCourseTranslationById(tid);
    return ok(res, ct, 'Course translation restored');
  })
);

export default router;
