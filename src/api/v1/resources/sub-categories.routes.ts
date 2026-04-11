// ═══════════════════════════════════════════════════════════════
// /api/v1/sub-categories router — phase 02 master data CRUD.
//
// Authorization model:
//   Sub-Category CRUD:
//     GET    /              sub_category.read
//     GET    /:id           sub_category.read
//     POST   /              sub_category.create
//     PATCH  /:id           sub_category.update
//     DELETE /:id           sub_category.delete
//     POST   /:id/restore   sub_category.restore
//     POST   /:id/icon      sub_category.update   (multipart, field `file`)
//     DELETE /:id/icon      sub_category.update
//     POST   /:id/image     sub_category.update   (multipart, field `file`)
//     DELETE /:id/image     sub_category.update
//
//   Translation sub-resource (nested under /:id/translations):
//     GET    /:id/translations              sub_category.read
//     GET    /:id/translations/:tid         sub_category.read
//     POST   /:id/translations              sub_category.update
//     PATCH  /:id/translations/:tid         sub_category.update
//     DELETE /:id/translations/:tid         sub_category.update
//     POST   /:id/translations/:tid/restore sub_category.update
//
// All routes require an authenticated user.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import {
  uploadSubCategoryIcon,
  uploadSubCategoryImage
} from '../../../core/middlewares/upload';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as subCategoriesService from '../../../modules/resources/sub-categories.service';
import {
  createSubCategoryBodySchema,
  listSubCategoriesQuerySchema,
  updateSubCategoryBodySchema,
  createSubCategoryTranslationBodySchema,
  listSubCategoryTranslationsQuerySchema,
  updateSubCategoryTranslationBodySchema,
  type CreateSubCategoryBody,
  type ListSubCategoriesQuery,
  type UpdateSubCategoryBody,
  type CreateSubCategoryTranslationBody,
  type ListSubCategoryTranslationsQuery,
  type UpdateSubCategoryTranslationBody
} from '../../../modules/resources/sub-categories.schemas';

const router = Router();

router.use(authenticate);

// ─── Sub-Category CRUD ───────────────────────────────────────────

router.get(
  '/',
  authorize('sub_category.read'),
  validate({ query: listSubCategoriesQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListSubCategoriesQuery;
    const { rows, meta } = await subCategoriesService.listSubCategories(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('sub_category.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const sc = await subCategoriesService.getSubCategoryById(id);
    if (!sc) throw AppError.notFound(`Sub-category ${id} not found`);
    return ok(res, sc, 'OK');
  })
);

router.post(
  '/',
  authorize('sub_category.create'),
  validate({ body: createSubCategoryBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateSubCategoryBody;
    const result = await subCategoriesService.createSubCategory(body, req.user?.id ?? null);
    const sc = await subCategoriesService.getSubCategoryById(result.id);
    return created(res, sc, 'Sub-category created');
  })
);

router.patch(
  '/:id',
  authorize('sub_category.update'),
  validate({ params: idParamSchema, body: updateSubCategoryBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateSubCategoryBody;
    await subCategoriesService.updateSubCategory(id, body, req.user?.id ?? null);
    const sc = await subCategoriesService.getSubCategoryById(id);
    return ok(res, sc, 'Sub-category updated');
  })
);

router.delete(
  '/:id',
  authorize('sub_category.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await subCategoriesService.deleteSubCategory(id);
    return ok(res, { id, deleted: true }, 'Sub-category deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('sub_category.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await subCategoriesService.restoreSubCategory(id);
    const sc = await subCategoriesService.getSubCategoryById(id);
    return ok(res, sc, 'Sub-category restored');
  })
);

// ─── Icon upload ────────────────────────────────────────────────

router.post(
  '/:id/icon',
  authorize('sub_category.update'),
  validate({ params: idParamSchema }),
  uploadSubCategoryIcon,
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    if (!req.file) {
      throw AppError.badRequest('file field is required (multipart/form-data)');
    }
    const sc = await subCategoriesService.processSubCategoryIconUpload(
      id,
      req.file,
      req.user?.id ?? null
    );
    return ok(res, sc, 'Sub-category icon uploaded');
  })
);

router.delete(
  '/:id/icon',
  authorize('sub_category.update'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const sc = await subCategoriesService.deleteSubCategoryIcon(id, req.user?.id ?? null);
    return ok(res, sc, 'Sub-category icon deleted');
  })
);

// ─── Image upload ───────────────────────────────────────────────

router.post(
  '/:id/image',
  authorize('sub_category.update'),
  validate({ params: idParamSchema }),
  uploadSubCategoryImage,
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    if (!req.file) {
      throw AppError.badRequest('file field is required (multipart/form-data)');
    }
    const sc = await subCategoriesService.processSubCategoryImageUpload(
      id,
      req.file,
      req.user?.id ?? null
    );
    return ok(res, sc, 'Sub-category image uploaded');
  })
);

router.delete(
  '/:id/image',
  authorize('sub_category.update'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const sc = await subCategoriesService.deleteSubCategoryImage(id, req.user?.id ?? null);
    return ok(res, sc, 'Sub-category image deleted');
  })
);

// ─── Translation sub-resource ───────────────────────────────────

router.get(
  '/:id/translations',
  authorize('sub_category.read'),
  validate({ params: idParamSchema, query: listSubCategoryTranslationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const subCategoryId = Number((req.params as unknown as { id: number }).id);
    const q = req.query as unknown as ListSubCategoryTranslationsQuery;
    const { rows, meta } = await subCategoriesService.listSubCategoryTranslations(
      subCategoryId,
      q
    );
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id/translations/:tid',
  authorize('sub_category.read'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    const sct = await subCategoriesService.getSubCategoryTranslationById(tid);
    if (!sct) throw AppError.notFound(`Sub-category translation ${tid} not found`);
    return ok(res, sct, 'OK');
  })
);

router.post(
  '/:id/translations',
  authorize('sub_category.update'),
  validate({ params: idParamSchema, body: createSubCategoryTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const subCategoryId = Number((req.params as unknown as { id: number }).id);
    const body = req.body as CreateSubCategoryTranslationBody;
    const result = await subCategoriesService.createSubCategoryTranslation(
      subCategoryId,
      body,
      req.user?.id ?? null
    );
    const sct = await subCategoriesService.getSubCategoryTranslationById(result.id);
    return created(res, sct, 'Sub-category translation created');
  })
);

router.patch(
  '/:id/translations/:tid',
  authorize('sub_category.update'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    }),
    body: updateSubCategoryTranslationBodySchema
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    const body = req.body as UpdateSubCategoryTranslationBody;
    await subCategoriesService.updateSubCategoryTranslation(tid, body, req.user?.id ?? null);
    const sct = await subCategoriesService.getSubCategoryTranslationById(tid);
    return ok(res, sct, 'Sub-category translation updated');
  })
);

router.delete(
  '/:id/translations/:tid',
  authorize('sub_category.update'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    await subCategoriesService.deleteSubCategoryTranslation(tid);
    return ok(res, { id: tid, deleted: true }, 'Sub-category translation deleted');
  })
);

router.post(
  '/:id/translations/:tid/restore',
  authorize('sub_category.update'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    await subCategoriesService.restoreSubCategoryTranslation(tid);
    const sct = await subCategoriesService.getSubCategoryTranslationById(tid);
    return ok(res, sct, 'Sub-category translation restored');
  })
);

export default router;
