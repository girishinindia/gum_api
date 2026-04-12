// ═══════════════════════════════════════════════════════════════
// /api/v1/course-instructors router — phase 09 junction CRUD.
//
// Authorization model:
//   GET    /              course_instructor.read
//   GET    /:id           course_instructor.read
//   POST   /              course_instructor.create
//   PATCH  /:id           course_instructor.update
//   DELETE /:id           course_instructor.delete
//   POST   /:id/restore   course_instructor.restore
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
import * as ciService from '../../../modules/course-instructors/course-instructors.service';
import {
  createCourseInstructorBodySchema,
  listCourseInstructorsQuerySchema,
  updateCourseInstructorBodySchema,
  type CreateCourseInstructorBody,
  type ListCourseInstructorsQuery,
  type UpdateCourseInstructorBody
} from '../../../modules/course-instructors/course-instructors.schemas';

const router = Router();

router.use(authenticate);

// ─── CRUD ───────────────────────────────────────────────────────

router.get(
  '/',
  authorize('course_instructor.read'),
  validate({ query: listCourseInstructorsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListCourseInstructorsQuery;
    const { rows, meta } = await ciService.listCourseInstructors(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('course_instructor.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await ciService.getCourseInstructorById(id);
    if (!row) throw AppError.notFound(`Course-instructor mapping ${id} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/',
  authorize('course_instructor.create'),
  validate({ body: createCourseInstructorBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateCourseInstructorBody;
    const result = await ciService.createCourseInstructor(body, req.user?.id ?? null);
    const row = await ciService.getCourseInstructorById(result.id);
    return created(res, row, 'Course-instructor mapping created');
  })
);

router.patch(
  '/:id',
  authorize('course_instructor.update'),
  validate({ params: idParamSchema, body: updateCourseInstructorBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateCourseInstructorBody;
    await ciService.updateCourseInstructor(id, body, req.user?.id ?? null);
    const row = await ciService.getCourseInstructorById(id);
    return ok(res, row, 'Course-instructor mapping updated');
  })
);

router.delete(
  '/:id',
  authorize('course_instructor.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await ciService.deleteCourseInstructor(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Course-instructor mapping deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('course_instructor.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await ciService.restoreCourseInstructor(id, req.user?.id ?? null);
    const row = await ciService.getCourseInstructorById(id);
    return ok(res, row, 'Course-instructor mapping restored');
  })
);

export default router;
