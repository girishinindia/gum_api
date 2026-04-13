// ═══════════════════════════════════════════════════════════════
// /api/v1/coupons router — phase 16 coupons CRUD.
//
// Authorization model:
//   Coupon CRUD:
//     GET    /                        coupon.read
//     GET    /:id                     coupon.read
//     POST   /                        coupon.create
//     PATCH  /:id                     coupon.update
//     DELETE /:id                     coupon.delete
//     POST   /:id/restore             coupon.restore
//
//   Coupon Translation sub-resource (nested under /:id/translations):
//     GET    /:id/translations                       coupon_translation.read
//     GET    /:id/translations/:tid                  coupon_translation.read
//     POST   /:id/translations                       coupon_translation.create
//     PATCH  /:id/translations/:tid                  coupon_translation.update
//     DELETE /:id/translations/:tid                  coupon_translation.delete
//     POST   /:id/translations/:tid/restore          coupon_translation.restore
//
//   Coupon Course sub-resource (nested under /:id/courses):
//     GET    /:id/courses                           coupon_course.read
//     GET    /:id/courses/:mapId                    coupon_course.read
//     POST   /:id/courses                           coupon_course.create
//     PATCH  /:id/courses/:mapId                    coupon_course.update
//     DELETE /:id/courses/:mapId                    coupon_course.delete
//     POST   /:id/courses/:mapId/restore            coupon_course.restore
//
//   Coupon Bundle sub-resource (nested under /:id/bundles):
//     GET    /:id/bundles                           coupon_bundle.read
//     GET    /:id/bundles/:mapId                    coupon_bundle.read
//     POST   /:id/bundles                           coupon_bundle.create
//     PATCH  /:id/bundles/:mapId                    coupon_bundle.update
//     DELETE /:id/bundles/:mapId                    coupon_bundle.delete
//     POST   /:id/bundles/:mapId/restore            coupon_bundle.restore
//
//   Coupon Batch sub-resource (nested under /:id/batches):
//     GET    /:id/batches                           coupon_batch.read
//     GET    /:id/batches/:mapId                    coupon_batch.read
//     POST   /:id/batches                           coupon_batch.create
//     PATCH  /:id/batches/:mapId                    coupon_batch.update
//     DELETE /:id/batches/:mapId                    coupon_batch.delete
//     POST   /:id/batches/:mapId/restore            coupon_batch.restore
//
//   Coupon Webinar sub-resource (nested under /:id/webinars):
//     GET    /:id/webinars                          coupon_webinar.read
//     GET    /:id/webinars/:mapId                   coupon_webinar.read
//     POST   /:id/webinars                          coupon_webinar.create
//     PATCH  /:id/webinars/:mapId                   coupon_webinar.update
//     DELETE /:id/webinars/:mapId                   coupon_webinar.delete
//     POST   /:id/webinars/:mapId/restore           coupon_webinar.restore
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
import * as couponService from '../../../modules/coupons/coupons.service';
import {
  createCouponBodySchema,
  listCouponsQuerySchema,
  updateCouponBodySchema,
  createCouponTranslationBodySchema,
  listCouponTranslationsQuerySchema,
  updateCouponTranslationBodySchema,
  createCouponCourseBodySchema,
  listCouponCoursesQuerySchema,
  updateCouponCourseBodySchema,
  createCouponBundleBodySchema,
  listCouponBundlesQuerySchema,
  updateCouponBundleBodySchema,
  createCouponBatchBodySchema,
  listCouponBatchesQuerySchema,
  updateCouponBatchBodySchema,
  createCouponWebinarBodySchema,
  listCouponWebinarsQuerySchema,
  updateCouponWebinarBodySchema,
  type CreateCouponBody,
  type ListCouponsQuery,
  type UpdateCouponBody,
  type CreateCouponTranslationBody,
  type ListCouponTranslationsQuery,
  type UpdateCouponTranslationBody,
  type CreateCouponCourseBody,
  type ListCouponCoursesQuery,
  type UpdateCouponCourseBody,
  type CreateCouponBundleBody,
  type ListCouponBundlesQuery,
  type UpdateCouponBundleBody,
  type CreateCouponBatchBody,
  type ListCouponBatchesQuery,
  type UpdateCouponBatchBody,
  type CreateCouponWebinarBody,
  type ListCouponWebinarsQuery,
  type UpdateCouponWebinarBody
} from '../../../modules/coupons/coupons.schemas';

const router = Router();

router.use(authenticate);

// ─── Coupon CRUD ───────────────────────────────────────────────

router.get(
  '/',
  authorize('coupon.read'),
  validate({ query: listCouponsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListCouponsQuery;
    const { rows, meta } = await couponService.listCoupons(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('coupon.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await couponService.getCouponById(id);
    if (!row) throw AppError.notFound(`Coupon ${id} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/',
  authorize('coupon.create'),
  validate({ body: createCouponBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateCouponBody;
    const callerId = (req as any).user?.id ?? null;
    const { id } = await couponService.createCoupon(body, callerId);
    const row = await couponService.getCouponById(id);
    return created(res, row, 'Coupon created');
  })
);

router.patch(
  '/:id',
  authorize('coupon.update'),
  validate({ params: idParamSchema, body: updateCouponBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateCouponBody;
    const callerId = (req as any).user?.id ?? null;
    await couponService.updateCoupon(id, body, callerId);
    const row = await couponService.getCouponById(id);
    if (!row) throw AppError.notFound(`Coupon ${id} not found`);
    return ok(res, row, 'Coupon updated');
  })
);

router.delete(
  '/:id',
  authorize('coupon.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const callerId = (req as any).user?.id ?? null;
    await couponService.deleteCoupon(id, callerId);
    return ok(res, { id, deleted: true }, 'Coupon deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('coupon.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await couponService.restoreCoupon(id);
    const row = await couponService.getCouponById(id);
    return ok(res, row, 'Coupon restored');
  })
);

// ─── Coupon Translation sub-resource ────────────────────────────

router.get(
  '/:id/translations',
  authorize('coupon_translation.read'),
  validate({ params: idParamSchema, query: listCouponTranslationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const couponId = Number((req.params as unknown as { id: number }).id);
    const q = req.query as unknown as ListCouponTranslationsQuery;
    const { rows, meta } = await couponService.listCouponTranslations(couponId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id/translations/:tid',
  authorize('coupon_translation.read'),
  asyncHandler(async (req, res) => {
    const tid = Number((req.params as any).tid);
    const row = await couponService.getCouponTranslationById(tid);
    if (!row) throw AppError.notFound(`Coupon translation ${tid} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/:id/translations',
  authorize('coupon_translation.create'),
  validate({ params: idParamSchema, body: createCouponTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const couponId = Number((req.params as unknown as { id: number }).id);
    const body = req.body as CreateCouponTranslationBody;
    const callerId = (req as any).user?.id ?? null;
    const { id } = await couponService.createCouponTranslation(couponId, body, callerId);
    const row = await couponService.getCouponTranslationById(id);
    return created(res, row, 'Coupon translation created');
  })
);

router.patch(
  '/:id/translations/:tid',
  authorize('coupon_translation.update'),
  validate({ body: updateCouponTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const tid = Number((req.params as any).tid);
    const body = req.body as UpdateCouponTranslationBody;
    await couponService.updateCouponTranslation(tid, body);
    const row = await couponService.getCouponTranslationById(tid);
    if (!row) throw AppError.notFound(`Coupon translation ${tid} not found`);
    return ok(res, row, 'Coupon translation updated');
  })
);

router.delete(
  '/:id/translations/:tid',
  authorize('coupon_translation.delete'),
  asyncHandler(async (req, res) => {
    const tid = Number((req.params as any).tid);
    await couponService.deleteCouponTranslation(tid);
    return ok(res, { id: tid, deleted: true }, 'Coupon translation deleted');
  })
);

router.post(
  '/:id/translations/:tid/restore',
  authorize('coupon_translation.restore'),
  asyncHandler(async (req, res) => {
    const tid = Number((req.params as any).tid);
    await couponService.restoreCouponTranslation(tid);
    const row = await couponService.getCouponTranslationById(tid);
    return ok(res, row, 'Coupon translation restored');
  })
);

// ─── Coupon Course sub-resource ─────────────────────────────────

router.get(
  '/:id/courses',
  authorize('coupon_course.read'),
  validate({ params: idParamSchema, query: listCouponCoursesQuerySchema }),
  asyncHandler(async (req, res) => {
    const couponId = Number((req.params as unknown as { id: number }).id);
    const q = req.query as unknown as ListCouponCoursesQuery;
    const { rows, meta } = await couponService.listCouponCourses(couponId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id/courses/:mapId',
  authorize('coupon_course.read'),
  asyncHandler(async (req, res) => {
    const mapId = Number((req.params as any).mapId);
    const row = await couponService.getCouponCourseById(mapId);
    if (!row) throw AppError.notFound(`Coupon course mapping ${mapId} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/:id/courses',
  authorize('coupon_course.create'),
  validate({ params: idParamSchema, body: createCouponCourseBodySchema }),
  asyncHandler(async (req, res) => {
    const couponId = Number((req.params as unknown as { id: number }).id);
    const body = req.body as CreateCouponCourseBody;
    const callerId = (req as any).user?.id ?? null;
    const { id } = await couponService.createCouponCourse(couponId, body, callerId);
    const row = await couponService.getCouponCourseById(id);
    return created(res, row, 'Coupon course mapping created');
  })
);

router.patch(
  '/:id/courses/:mapId',
  authorize('coupon_course.update'),
  validate({ body: updateCouponCourseBodySchema }),
  asyncHandler(async (req, res) => {
    const mapId = Number((req.params as any).mapId);
    const body = req.body as UpdateCouponCourseBody;
    const callerId = (req as any).user?.id ?? null;
    await couponService.updateCouponCourse(mapId, body, callerId);
    const row = await couponService.getCouponCourseById(mapId);
    if (!row) throw AppError.notFound(`Coupon course mapping ${mapId} not found`);
    return ok(res, row, 'Coupon course mapping updated');
  })
);

router.delete(
  '/:id/courses/:mapId',
  authorize('coupon_course.delete'),
  asyncHandler(async (req, res) => {
    const mapId = Number((req.params as any).mapId);
    const callerId = (req as any).user?.id ?? null;
    await couponService.deleteCouponCourse(mapId, callerId);
    return ok(res, { id: mapId, deleted: true }, 'Coupon course mapping deleted');
  })
);

router.post(
  '/:id/courses/:mapId/restore',
  authorize('coupon_course.restore'),
  asyncHandler(async (req, res) => {
    const mapId = Number((req.params as any).mapId);
    const callerId = (req as any).user?.id ?? null;
    await couponService.restoreCouponCourse(mapId, callerId);
    const row = await couponService.getCouponCourseById(mapId);
    return ok(res, row, 'Coupon course mapping restored');
  })
);

// ─── Coupon Bundle sub-resource ─────────────────────────────────

router.get(
  '/:id/bundles',
  authorize('coupon_bundle.read'),
  validate({ params: idParamSchema, query: listCouponBundlesQuerySchema }),
  asyncHandler(async (req, res) => {
    const couponId = Number((req.params as unknown as { id: number }).id);
    const q = req.query as unknown as ListCouponBundlesQuery;
    const { rows, meta } = await couponService.listCouponBundles(couponId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id/bundles/:mapId',
  authorize('coupon_bundle.read'),
  asyncHandler(async (req, res) => {
    const mapId = Number((req.params as any).mapId);
    const row = await couponService.getCouponBundleById(mapId);
    if (!row) throw AppError.notFound(`Coupon bundle mapping ${mapId} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/:id/bundles',
  authorize('coupon_bundle.create'),
  validate({ params: idParamSchema, body: createCouponBundleBodySchema }),
  asyncHandler(async (req, res) => {
    const couponId = Number((req.params as unknown as { id: number }).id);
    const body = req.body as CreateCouponBundleBody;
    const callerId = (req as any).user?.id ?? null;
    const { id } = await couponService.createCouponBundle(couponId, body, callerId);
    const row = await couponService.getCouponBundleById(id);
    return created(res, row, 'Coupon bundle mapping created');
  })
);

router.patch(
  '/:id/bundles/:mapId',
  authorize('coupon_bundle.update'),
  validate({ body: updateCouponBundleBodySchema }),
  asyncHandler(async (req, res) => {
    const mapId = Number((req.params as any).mapId);
    const body = req.body as UpdateCouponBundleBody;
    const callerId = (req as any).user?.id ?? null;
    await couponService.updateCouponBundle(mapId, body, callerId);
    const row = await couponService.getCouponBundleById(mapId);
    if (!row) throw AppError.notFound(`Coupon bundle mapping ${mapId} not found`);
    return ok(res, row, 'Coupon bundle mapping updated');
  })
);

router.delete(
  '/:id/bundles/:mapId',
  authorize('coupon_bundle.delete'),
  asyncHandler(async (req, res) => {
    const mapId = Number((req.params as any).mapId);
    const callerId = (req as any).user?.id ?? null;
    await couponService.deleteCouponBundle(mapId, callerId);
    return ok(res, { id: mapId, deleted: true }, 'Coupon bundle mapping deleted');
  })
);

router.post(
  '/:id/bundles/:mapId/restore',
  authorize('coupon_bundle.restore'),
  asyncHandler(async (req, res) => {
    const mapId = Number((req.params as any).mapId);
    const callerId = (req as any).user?.id ?? null;
    await couponService.restoreCouponBundle(mapId, callerId);
    const row = await couponService.getCouponBundleById(mapId);
    return ok(res, row, 'Coupon bundle mapping restored');
  })
);

// ─── Coupon Batch sub-resource ──────────────────────────────────

router.get(
  '/:id/batches',
  authorize('coupon_batch.read'),
  validate({ params: idParamSchema, query: listCouponBatchesQuerySchema }),
  asyncHandler(async (req, res) => {
    const couponId = Number((req.params as unknown as { id: number }).id);
    const q = req.query as unknown as ListCouponBatchesQuery;
    const { rows, meta } = await couponService.listCouponBatches(couponId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id/batches/:mapId',
  authorize('coupon_batch.read'),
  asyncHandler(async (req, res) => {
    const mapId = Number((req.params as any).mapId);
    const row = await couponService.getCouponBatchById(mapId);
    if (!row) throw AppError.notFound(`Coupon batch mapping ${mapId} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/:id/batches',
  authorize('coupon_batch.create'),
  validate({ params: idParamSchema, body: createCouponBatchBodySchema }),
  asyncHandler(async (req, res) => {
    const couponId = Number((req.params as unknown as { id: number }).id);
    const body = req.body as CreateCouponBatchBody;
    const callerId = (req as any).user?.id ?? null;
    const { id } = await couponService.createCouponBatch(couponId, body, callerId);
    const row = await couponService.getCouponBatchById(id);
    return created(res, row, 'Coupon batch mapping created');
  })
);

router.patch(
  '/:id/batches/:mapId',
  authorize('coupon_batch.update'),
  validate({ body: updateCouponBatchBodySchema }),
  asyncHandler(async (req, res) => {
    const mapId = Number((req.params as any).mapId);
    const body = req.body as UpdateCouponBatchBody;
    const callerId = (req as any).user?.id ?? null;
    await couponService.updateCouponBatch(mapId, body, callerId);
    const row = await couponService.getCouponBatchById(mapId);
    if (!row) throw AppError.notFound(`Coupon batch mapping ${mapId} not found`);
    return ok(res, row, 'Coupon batch mapping updated');
  })
);

router.delete(
  '/:id/batches/:mapId',
  authorize('coupon_batch.delete'),
  asyncHandler(async (req, res) => {
    const mapId = Number((req.params as any).mapId);
    const callerId = (req as any).user?.id ?? null;
    await couponService.deleteCouponBatch(mapId, callerId);
    return ok(res, { id: mapId, deleted: true }, 'Coupon batch mapping deleted');
  })
);

router.post(
  '/:id/batches/:mapId/restore',
  authorize('coupon_batch.restore'),
  asyncHandler(async (req, res) => {
    const mapId = Number((req.params as any).mapId);
    const callerId = (req as any).user?.id ?? null;
    await couponService.restoreCouponBatch(mapId, callerId);
    const row = await couponService.getCouponBatchById(mapId);
    return ok(res, row, 'Coupon batch mapping restored');
  })
);

// ─── Coupon Webinar sub-resource ───────────────────────────────

router.get(
  '/:id/webinars',
  authorize('coupon_webinar.read'),
  validate({ params: idParamSchema, query: listCouponWebinarsQuerySchema }),
  asyncHandler(async (req, res) => {
    const couponId = Number((req.params as unknown as { id: number }).id);
    const q = req.query as unknown as ListCouponWebinarsQuery;
    const { rows, meta } = await couponService.listCouponWebinars(couponId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id/webinars/:mapId',
  authorize('coupon_webinar.read'),
  asyncHandler(async (req, res) => {
    const mapId = Number((req.params as any).mapId);
    const row = await couponService.getCouponWebinarById(mapId);
    if (!row) throw AppError.notFound(`Coupon webinar mapping ${mapId} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/:id/webinars',
  authorize('coupon_webinar.create'),
  validate({ params: idParamSchema, body: createCouponWebinarBodySchema }),
  asyncHandler(async (req, res) => {
    const couponId = Number((req.params as unknown as { id: number }).id);
    const body = req.body as CreateCouponWebinarBody;
    const callerId = (req as any).user?.id ?? null;
    const { id } = await couponService.createCouponWebinar(couponId, body, callerId);
    const row = await couponService.getCouponWebinarById(id);
    return created(res, row, 'Coupon webinar mapping created');
  })
);

router.patch(
  '/:id/webinars/:mapId',
  authorize('coupon_webinar.update'),
  validate({ body: updateCouponWebinarBodySchema }),
  asyncHandler(async (req, res) => {
    const mapId = Number((req.params as any).mapId);
    const body = req.body as UpdateCouponWebinarBody;
    const callerId = (req as any).user?.id ?? null;
    await couponService.updateCouponWebinar(mapId, body, callerId);
    const row = await couponService.getCouponWebinarById(mapId);
    if (!row) throw AppError.notFound(`Coupon webinar mapping ${mapId} not found`);
    return ok(res, row, 'Coupon webinar mapping updated');
  })
);

router.delete(
  '/:id/webinars/:mapId',
  authorize('coupon_webinar.delete'),
  asyncHandler(async (req, res) => {
    const mapId = Number((req.params as any).mapId);
    const callerId = (req as any).user?.id ?? null;
    await couponService.deleteCouponWebinar(mapId, callerId);
    return ok(res, { id: mapId, deleted: true }, 'Coupon webinar mapping deleted');
  })
);

router.post(
  '/:id/webinars/:mapId/restore',
  authorize('coupon_webinar.restore'),
  asyncHandler(async (req, res) => {
    const mapId = Number((req.params as any).mapId);
    const callerId = (req as any).user?.id ?? null;
    await couponService.restoreCouponWebinar(mapId, callerId);
    const row = await couponService.getCouponWebinarById(mapId);
    return ok(res, row, 'Coupon webinar mapping restored');
  })
);

export default router;
