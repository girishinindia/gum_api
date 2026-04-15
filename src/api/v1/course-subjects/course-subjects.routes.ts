// ═══════════════════════════════════════════════════════════════
// /api/v1/course-subjects router — phase 09 junction CRUD.
//
// Authorization model:
//   GET    /              course_subject.read
//   GET    /:id           course_subject.read
//   POST   /              course_subject.create
//   PATCH  /:id           course_subject.update
//   DELETE /:id           course_subject.delete
//   POST   /:id/restore   course_subject.restore
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
import * as csService from '../../../modules/course-subjects/course-subjects.service';
import {
  createCourseSubjectBodySchema,
  listCourseSubjectsQuerySchema,
  updateCourseSubjectBodySchema,
  type CreateCourseSubjectBody,
  type ListCourseSubjectsQuery,
  type UpdateCourseSubjectBody
} from '../../../modules/course-subjects/course-subjects.schemas';

const router = Router();

router.use(authenticate);

// ─── CRUD ───────────────────────────────────────────────────────

router.get(
  '/',
  authorize('course_subject.read'),
  validate({ query: listCourseSubjectsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListCourseSubjectsQuery;
    const { rows, meta } = await csService.listCourseSubjects(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('course_subject.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await csService.getCourseSubjectById(id);
    if (!row) throw AppError.notFound(`Course-subject mapping ${id} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/',
  authorize('course_subject.create'),
  validate({ body: createCourseSubjectBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateCourseSubjectBody;
    const result = await csService.createCourseSubject(body, req.user?.id ?? null);
    const row = await csService.getCourseSubjectById(result.id);
    return created(res, row, 'Course-subject mapping created');
  })
);

router.patch(
  '/:id',
  authorize('course_subject.update'),
  validate({ params: idParamSchema, body: updateCourseSubjectBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateCourseSubjectBody;
    await csService.updateCourseSubject(id, body, req.user?.id ?? null);
    const row = await csService.getCourseSubjectById(id);
    return ok(res, row, 'Course-subject mapping updated');
  })
);

router.delete(
  '/:id',
  authorize('course_subject.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await csService.deleteCourseSubject(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Course-subject mapping deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('course_subject.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await csService.restoreCourseSubject(id, req.user?.id ?? null);
    const row = await csService.getCourseSubjectById(id);
    return ok(res, row, 'Course-subject mapping restored');
  })
);

export default router;
