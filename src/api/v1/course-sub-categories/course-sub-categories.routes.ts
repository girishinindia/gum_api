// ═══════════════════════════════════════════════════════════════
// /api/v1/course-sub-categories router — phase 09 junction CRUD.
//
// Authorization model:
//   GET    /              course_sub_category.read
//   GET    /:id           course_sub_category.read
//   POST   /              course_sub_category.create
//   PATCH  /:id           course_sub_category.update
//   DELETE /:id           course_sub_category.delete
//   POST   /:id/restore   course_sub_category.restore
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
import * as cscService from '../../../modules/course-sub-categories/course-sub-categories.service';
import {
  createCourseSubCategoryBodySchema,
  listCourseSubCategoriesQuerySchema,
  updateCourseSubCategoryBodySchema,
  type CreateCourseSubCategoryBody,
  type ListCourseSubCategoriesQuery,
  type UpdateCourseSubCategoryBody
} from '../../../modules/course-sub-categories/course-sub-categories.schemas';

const router = Router();

router.use(authenticate);

// ─── CRUD ───────────────────────────────────────────────────────

router.get(
  '/',
  authorize('course_sub_category.read'),
  validate({ query: listCourseSubCategoriesQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListCourseSubCategoriesQuery;
    const { rows, meta } = await cscService.listCourseSubCategories(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('course_sub_category.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await cscService.getCourseSubCategoryById(id);
    if (!row) throw AppError.notFound(`Course-sub-category mapping ${id} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/',
  authorize('course_sub_category.create'),
  validate({ body: createCourseSubCategoryBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateCourseSubCategoryBody;
    const result = await cscService.createCourseSubCategory(body, req.user?.id ?? null);
    const row = await cscService.getCourseSubCategoryById(result.id);
    return created(res, row, 'Course-sub-category mapping created');
  })
);

router.patch(
  '/:id',
  authorize('course_sub_category.update'),
  validate({ params: idParamSchema, body: updateCourseSubCategoryBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateCourseSubCategoryBody;
    await cscService.updateCourseSubCategory(id, body, req.user?.id ?? null);
    const row = await cscService.getCourseSubCategoryById(id);
    return ok(res, row, 'Course-sub-category mapping updated');
  })
);

router.delete(
  '/:id',
  authorize('course_sub_category.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await cscService.deleteCourseSubCategory(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Course-sub-category mapping deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('course_sub_category.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await cscService.restoreCourseSubCategory(id, req.user?.id ?? null);
    const row = await cscService.getCourseSubCategoryById(id);
    return ok(res, row, 'Course-sub-category mapping restored');
  })
);

export default router;
