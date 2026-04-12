// ═══════════════════════════════════════════════════════════════
// /api/v1/course-chapters router — phase 09 junction CRUD.
//
// Authorization model:
//   GET    /              course_chapter.read
//   GET    /:id           course_chapter.read
//   POST   /              course_chapter.create
//   PATCH  /:id           course_chapter.update
//   DELETE /:id           course_chapter.delete
//   POST   /:id/restore   course_chapter.restore
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
import * as ccService from '../../../modules/course-chapters/course-chapters.service';
import {
  createCourseChapterBodySchema,
  listCourseChaptersQuerySchema,
  updateCourseChapterBodySchema,
  type CreateCourseChapterBody,
  type ListCourseChaptersQuery,
  type UpdateCourseChapterBody
} from '../../../modules/course-chapters/course-chapters.schemas';

const router = Router();

router.use(authenticate);

// ─── CRUD ───────────────────────────────────────────────────────

router.get(
  '/',
  authorize('course_chapter.read'),
  validate({ query: listCourseChaptersQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListCourseChaptersQuery;
    const { rows, meta } = await ccService.listCourseChapters(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('course_chapter.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await ccService.getCourseChapterById(id);
    if (!row) throw AppError.notFound(`Course-chapter mapping ${id} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/',
  authorize('course_chapter.create'),
  validate({ body: createCourseChapterBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateCourseChapterBody;
    const result = await ccService.createCourseChapter(body, req.user?.id ?? null);
    const row = await ccService.getCourseChapterById(result.id);
    return created(res, row, 'Course-chapter mapping created');
  })
);

router.patch(
  '/:id',
  authorize('course_chapter.update'),
  validate({ params: idParamSchema, body: updateCourseChapterBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateCourseChapterBody;
    await ccService.updateCourseChapter(id, body, req.user?.id ?? null);
    const row = await ccService.getCourseChapterById(id);
    return ok(res, row, 'Course-chapter mapping updated');
  })
);

router.delete(
  '/:id',
  authorize('course_chapter.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await ccService.deleteCourseChapter(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Course-chapter mapping deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('course_chapter.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await ccService.restoreCourseChapter(id, req.user?.id ?? null);
    const row = await ccService.getCourseChapterById(id);
    return ok(res, row, 'Course-chapter mapping restored');
  })
);

export default router;
