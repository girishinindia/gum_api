// ═══════════════════════════════════════════════════════════════
// /api/v1/instructor-promotions router — phase 14 instructor promotions CRUD.
//
// Authorization model:
//   Instructor Promotion CRUD:
//     GET    /                        instructor_promotion.read
//     GET    /:id                     instructor_promotion.read
//     POST   /                        instructor_promotion.create
//     PATCH  /:id                     instructor_promotion.update
//     DELETE /:id                     instructor_promotion.delete
//     POST   /:id/restore             instructor_promotion.restore
//
//   Promotion Translation sub-resource (nested under /:id/translations):
//     GET    /:id/translations                       instructor_promotion_translation.read
//     GET    /:id/translations/:tid                  instructor_promotion_translation.read
//     POST   /:id/translations                       instructor_promotion_translation.create
//     PATCH  /:id/translations/:tid                  instructor_promotion_translation.update
//     DELETE /:id/translations/:tid                  instructor_promotion_translation.delete
//     POST   /:id/translations/:tid/restore          instructor_promotion_translation.restore
//
//   Promotion Course sub-resource (nested under /:id/courses):
//     GET    /:id/courses                           instructor_promotion_course.read
//     GET    /:id/courses/:courseMapId               instructor_promotion_course.read
//     POST   /:id/courses                           instructor_promotion_course.create
//     PATCH  /:id/courses/:courseMapId               instructor_promotion_course.update
//     DELETE /:id/courses/:courseMapId               instructor_promotion_course.delete
//     POST   /:id/courses/:courseMapId/restore       instructor_promotion_course.restore
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
import * as instructorPromotionService from '../../../modules/instructor-promotions/instructor-promotions.service';
import {
  createInstructorPromotionBodySchema,
  listInstructorPromotionsQuerySchema,
  updateInstructorPromotionBodySchema,
  createPromotionTranslationBodySchema,
  listPromotionTranslationsQuerySchema,
  updatePromotionTranslationBodySchema,
  createPromotionCourseBodySchema,
  listPromotionCoursesQuerySchema,
  updatePromotionCourseBodySchema,
  type CreateInstructorPromotionBody,
  type ListInstructorPromotionsQuery,
  type UpdateInstructorPromotionBody,
  type CreatePromotionTranslationBody,
  type ListPromotionTranslationsQuery,
  type UpdatePromotionTranslationBody,
  type CreatePromotionCourseBody,
  type ListPromotionCoursesQuery,
  type UpdatePromotionCourseBody
} from '../../../modules/instructor-promotions/instructor-promotions.schemas';

const router = Router();

router.use(authenticate);

// ─── Instructor Promotion CRUD ──────────────────────────────────

router.get(
  '/',
  authorize('instructor_promotion.read'),
  validate({ query: listInstructorPromotionsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListInstructorPromotionsQuery;
    const { rows, meta } = await instructorPromotionService.listInstructorPromotions(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('instructor_promotion.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await instructorPromotionService.getInstructorPromotionById(id);
    if (!row) throw AppError.notFound(`Instructor promotion ${id} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/',
  authorize('instructor_promotion.create'),
  validate({ body: createInstructorPromotionBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateInstructorPromotionBody;
    const callerId = (req as any).user?.id ?? null;
    const { id } = await instructorPromotionService.createInstructorPromotion(body, callerId);
    const row = await instructorPromotionService.getInstructorPromotionById(id);
    return created(res, row, 'Instructor promotion created');
  })
);

router.patch(
  '/:id',
  authorize('instructor_promotion.update'),
  validate({ params: idParamSchema, body: updateInstructorPromotionBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateInstructorPromotionBody;
    const callerId = (req as any).user?.id ?? null;
    await instructorPromotionService.updateInstructorPromotion(id, body, callerId);
    const row = await instructorPromotionService.getInstructorPromotionById(id);
    if (!row) throw AppError.notFound(`Instructor promotion ${id} not found`);
    return ok(res, row, 'Instructor promotion updated');
  })
);

router.delete(
  '/:id',
  authorize('instructor_promotion.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await instructorPromotionService.deleteInstructorPromotion(id);
    return ok(res, { id, deleted: true }, 'Instructor promotion deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('instructor_promotion.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await instructorPromotionService.restoreInstructorPromotion(id);
    const row = await instructorPromotionService.getInstructorPromotionById(id);
    return ok(res, row, 'Instructor promotion restored');
  })
);

// ─── Promotion Translation sub-resource ─────────────────────────

router.get(
  '/:id/translations',
  authorize('instructor_promotion_translation.read'),
  validate({ params: idParamSchema, query: listPromotionTranslationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const promotionId = Number((req.params as unknown as { id: number }).id);
    const q = req.query as unknown as ListPromotionTranslationsQuery;
    const { rows, meta } = await instructorPromotionService.listPromotionTranslations(promotionId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id/translations/:tid',
  authorize('instructor_promotion_translation.read'),
  asyncHandler(async (req, res) => {
    const tid = Number((req.params as any).tid);
    const row = await instructorPromotionService.getPromotionTranslationById(tid);
    if (!row) throw AppError.notFound(`Promotion translation ${tid} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/:id/translations',
  authorize('instructor_promotion_translation.create'),
  validate({ params: idParamSchema, body: createPromotionTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const promotionId = Number((req.params as unknown as { id: number }).id);
    const body = req.body as CreatePromotionTranslationBody;
    const callerId = (req as any).user?.id ?? null;
    const { id } = await instructorPromotionService.createPromotionTranslation(promotionId, body, callerId);
    const row = await instructorPromotionService.getPromotionTranslationById(id);
    return created(res, row, 'Promotion translation created');
  })
);

router.patch(
  '/:id/translations/:tid',
  authorize('instructor_promotion_translation.update'),
  validate({ body: updatePromotionTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const tid = Number((req.params as any).tid);
    const body = req.body as UpdatePromotionTranslationBody;
    await instructorPromotionService.updatePromotionTranslation(tid, body);
    const row = await instructorPromotionService.getPromotionTranslationById(tid);
    if (!row) throw AppError.notFound(`Promotion translation ${tid} not found`);
    return ok(res, row, 'Promotion translation updated');
  })
);

router.delete(
  '/:id/translations/:tid',
  authorize('instructor_promotion_translation.delete'),
  asyncHandler(async (req, res) => {
    const tid = Number((req.params as any).tid);
    await instructorPromotionService.deletePromotionTranslation(tid);
    return ok(res, { id: tid, deleted: true }, 'Promotion translation deleted');
  })
);

router.post(
  '/:id/translations/:tid/restore',
  authorize('instructor_promotion_translation.restore'),
  asyncHandler(async (req, res) => {
    const tid = Number((req.params as any).tid);
    await instructorPromotionService.restorePromotionTranslation(tid);
    const row = await instructorPromotionService.getPromotionTranslationById(tid);
    return ok(res, row, 'Promotion translation restored');
  })
);

// ─── Promotion Course sub-resource ──────────────────────────────

router.get(
  '/:id/courses',
  authorize('instructor_promotion_course.read'),
  validate({ params: idParamSchema, query: listPromotionCoursesQuerySchema }),
  asyncHandler(async (req, res) => {
    const promotionId = Number((req.params as unknown as { id: number }).id);
    const q = req.query as unknown as ListPromotionCoursesQuery;
    const { rows, meta } = await instructorPromotionService.listPromotionCourses(promotionId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id/courses/:courseMapId',
  authorize('instructor_promotion_course.read'),
  asyncHandler(async (req, res) => {
    const courseMapId = Number((req.params as any).courseMapId);
    const row = await instructorPromotionService.getPromotionCourseById(courseMapId);
    if (!row) throw AppError.notFound(`Promotion course mapping ${courseMapId} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/:id/courses',
  authorize('instructor_promotion_course.create'),
  validate({ params: idParamSchema, body: createPromotionCourseBodySchema }),
  asyncHandler(async (req, res) => {
    const promotionId = Number((req.params as unknown as { id: number }).id);
    const body = req.body as CreatePromotionCourseBody;
    const callerId = (req as any).user?.id ?? null;
    const { id } = await instructorPromotionService.createPromotionCourse(promotionId, body, callerId);
    const row = await instructorPromotionService.getPromotionCourseById(id);
    return created(res, row, 'Promotion course mapping created');
  })
);

router.patch(
  '/:id/courses/:courseMapId',
  authorize('instructor_promotion_course.update'),
  validate({ body: updatePromotionCourseBodySchema }),
  asyncHandler(async (req, res) => {
    const courseMapId = Number((req.params as any).courseMapId);
    const body = req.body as UpdatePromotionCourseBody;
    const callerId = (req as any).user?.id ?? null;
    await instructorPromotionService.updatePromotionCourse(courseMapId, body, callerId);
    const row = await instructorPromotionService.getPromotionCourseById(courseMapId);
    if (!row) throw AppError.notFound(`Promotion course mapping ${courseMapId} not found`);
    return ok(res, row, 'Promotion course mapping updated');
  })
);

router.delete(
  '/:id/courses/:courseMapId',
  authorize('instructor_promotion_course.delete'),
  asyncHandler(async (req, res) => {
    const courseMapId = Number((req.params as any).courseMapId);
    const callerId = (req as any).user?.id ?? null;
    await instructorPromotionService.deletePromotionCourse(courseMapId, callerId);
    return ok(res, { id: courseMapId, deleted: true }, 'Promotion course mapping deleted');
  })
);

router.post(
  '/:id/courses/:courseMapId/restore',
  authorize('instructor_promotion_course.restore'),
  asyncHandler(async (req, res) => {
    const courseMapId = Number((req.params as any).courseMapId);
    const callerId = (req as any).user?.id ?? null;
    await instructorPromotionService.restorePromotionCourse(courseMapId, callerId);
    const row = await instructorPromotionService.getPromotionCourseById(courseMapId);
    return ok(res, row, 'Promotion course mapping restored');
  })
);

export default router;
