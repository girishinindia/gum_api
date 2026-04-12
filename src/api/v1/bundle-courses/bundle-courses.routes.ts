// ═══════════════════════════════════════════════════════════════
// /api/v1/bundle-courses router — phase 09 junction CRUD.
//
// Authorization model:
//   GET    /              bundle_course.read
//   GET    /:id           bundle_course.read
//   POST   /              bundle_course.create
//   PATCH  /:id           bundle_course.update
//   DELETE /:id           bundle_course.delete
//   POST   /:id/restore   bundle_course.restore
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
import * as bcService from '../../../modules/bundle-courses/bundle-courses.service';
import {
  createBundleCourseBodySchema,
  listBundleCoursesQuerySchema,
  updateBundleCourseBodySchema,
  type CreateBundleCourseBody,
  type ListBundleCoursesQuery,
  type UpdateBundleCourseBody
} from '../../../modules/bundle-courses/bundle-courses.schemas';

const router = Router();

router.use(authenticate);

// ─── CRUD ───────────────────────────────────────────────────────

router.get(
  '/',
  authorize('bundle_course.read'),
  validate({ query: listBundleCoursesQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListBundleCoursesQuery;
    const { rows, meta } = await bcService.listBundleCourses(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('bundle_course.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await bcService.getBundleCourseById(id);
    if (!row) throw AppError.notFound(`Bundle-course mapping ${id} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/',
  authorize('bundle_course.create'),
  validate({ body: createBundleCourseBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateBundleCourseBody;
    const result = await bcService.createBundleCourse(body, req.user?.id ?? null);
    const row = await bcService.getBundleCourseById(result.id);
    return created(res, row, 'Bundle-course mapping created');
  })
);

router.patch(
  '/:id',
  authorize('bundle_course.update'),
  validate({ params: idParamSchema, body: updateBundleCourseBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateBundleCourseBody;
    await bcService.updateBundleCourse(id, body, req.user?.id ?? null);
    const row = await bcService.getBundleCourseById(id);
    return ok(res, row, 'Bundle-course mapping updated');
  })
);

router.delete(
  '/:id',
  authorize('bundle_course.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await bcService.deleteBundleCourse(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Bundle-course mapping deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('bundle_course.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await bcService.restoreBundleCourse(id, req.user?.id ?? null);
    const row = await bcService.getBundleCourseById(id);
    return ok(res, row, 'Bundle-course mapping restored');
  })
);

export default router;
