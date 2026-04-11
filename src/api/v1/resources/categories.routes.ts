// ═══════════════════════════════════════════════════════════════
// /api/v1/categories router — phase 02 master data CRUD.
//
// Authorization model:
//   Category CRUD:
//     GET    /              category.read
//     GET    /:id           category.read
//     POST   /              category.create
//     PATCH  /:id           category.update
//     DELETE /:id           category.delete
//     POST   /:id/restore   category.restore
//     POST   /:id/icon      category.update   (multipart, field `file`)
//     DELETE /:id/icon      category.update
//     POST   /:id/image     category.update   (multipart, field `file`)
//     DELETE /:id/image     category.update
//
//   Translation sub-resource (nested under /:id/translations):
//     GET    /:id/translations              category.read
//     GET    /:id/translations/:tid         category.read
//     POST   /:id/translations              category.update
//     PATCH  /:id/translations/:tid         category.update
//     DELETE /:id/translations/:tid         category.update
//     POST   /:id/translations/:tid/restore category.update
//
// All routes require an authenticated user.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import {
  uploadCategoryIcon,
  uploadCategoryImage
} from '../../../core/middlewares/upload';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as categoriesService from '../../../modules/resources/categories.service';
import {
  createCategoryBodySchema,
  listCategoriesQuerySchema,
  updateCategoryBodySchema,
  createCategoryTranslationBodySchema,
  listCategoryTranslationsQuerySchema,
  updateCategoryTranslationBodySchema,
  type CreateCategoryBody,
  type ListCategoriesQuery,
  type UpdateCategoryBody,
  type CreateCategoryTranslationBody,
  type ListCategoryTranslationsQuery,
  type UpdateCategoryTranslationBody
} from '../../../modules/resources/categories.schemas';

const router = Router();

router.use(authenticate);

// ─── Category CRUD ───────────────────────────────────────────────

router.get(
  '/',
  authorize('category.read'),
  validate({ query: listCategoriesQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListCategoriesQuery;
    const { rows, meta } = await categoriesService.listCategories(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('category.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const c = await categoriesService.getCategoryById(id);
    if (!c) throw AppError.notFound(`Category ${id} not found`);
    return ok(res, c, 'OK');
  })
);

router.post(
  '/',
  authorize('category.create'),
  validate({ body: createCategoryBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateCategoryBody;
    const result = await categoriesService.createCategory(body, req.user?.id ?? null);
    const c = await categoriesService.getCategoryById(result.id);
    return created(res, c, 'Category created');
  })
);

router.patch(
  '/:id',
  authorize('category.update'),
  validate({ params: idParamSchema, body: updateCategoryBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateCategoryBody;
    await categoriesService.updateCategory(id, body, req.user?.id ?? null);
    const c = await categoriesService.getCategoryById(id);
    return ok(res, c, 'Category updated');
  })
);

router.delete(
  '/:id',
  authorize('category.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await categoriesService.deleteCategory(id);
    return ok(res, { id, deleted: true }, 'Category deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('category.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await categoriesService.restoreCategory(id);
    const c = await categoriesService.getCategoryById(id);
    return ok(res, c, 'Category restored');
  })
);

// ─── Icon upload ────────────────────────────────────────────────

router.post(
  '/:id/icon',
  authorize('category.update'),
  validate({ params: idParamSchema }),
  uploadCategoryIcon,
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    if (!req.file) {
      throw AppError.badRequest('file field is required (multipart/form-data)');
    }
    const c = await categoriesService.processCategoryIconUpload(
      id,
      req.file,
      req.user?.id ?? null
    );
    return ok(res, c, 'Category icon uploaded');
  })
);

router.delete(
  '/:id/icon',
  authorize('category.update'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const c = await categoriesService.deleteCategoryIcon(id, req.user?.id ?? null);
    return ok(res, c, 'Category icon deleted');
  })
);

// ─── Image upload ───────────────────────────────────────────────

router.post(
  '/:id/image',
  authorize('category.update'),
  validate({ params: idParamSchema }),
  uploadCategoryImage,
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    if (!req.file) {
      throw AppError.badRequest('file field is required (multipart/form-data)');
    }
    const c = await categoriesService.processCategoryImageUpload(
      id,
      req.file,
      req.user?.id ?? null
    );
    return ok(res, c, 'Category image uploaded');
  })
);

router.delete(
  '/:id/image',
  authorize('category.update'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const c = await categoriesService.deleteCategoryImage(id, req.user?.id ?? null);
    return ok(res, c, 'Category image deleted');
  })
);

// ─── Translation sub-resource ───────────────────────────────────

router.get(
  '/:id/translations',
  authorize('category.read'),
  validate({ params: idParamSchema, query: listCategoryTranslationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const categoryId = Number((req.params as unknown as { id: number }).id);
    const q = req.query as unknown as ListCategoryTranslationsQuery;
    const { rows, meta } = await categoriesService.listCategoryTranslations(categoryId, q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id/translations/:tid',
  authorize('category.read'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    const ct = await categoriesService.getCategoryTranslationById(tid);
    if (!ct) throw AppError.notFound(`Category translation ${tid} not found`);
    return ok(res, ct, 'OK');
  })
);

router.post(
  '/:id/translations',
  authorize('category.update'),
  validate({ params: idParamSchema, body: createCategoryTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const categoryId = Number((req.params as unknown as { id: number }).id);
    const body = req.body as CreateCategoryTranslationBody;
    const result = await categoriesService.createCategoryTranslation(
      categoryId,
      body,
      req.user?.id ?? null
    );
    const ct = await categoriesService.getCategoryTranslationById(result.id);
    return created(res, ct, 'Category translation created');
  })
);

router.patch(
  '/:id/translations/:tid',
  authorize('category.update'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    }),
    body: updateCategoryTranslationBodySchema
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    const body = req.body as UpdateCategoryTranslationBody;
    await categoriesService.updateCategoryTranslation(tid, body, req.user?.id ?? null);
    const ct = await categoriesService.getCategoryTranslationById(tid);
    return ok(res, ct, 'Category translation updated');
  })
);

router.delete(
  '/:id/translations/:tid',
  authorize('category.update'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    await categoriesService.deleteCategoryTranslation(tid);
    return ok(res, { id: tid, deleted: true }, 'Category translation deleted');
  })
);

router.post(
  '/:id/translations/:tid/restore',
  authorize('category.update'),
  validate({
    params: idParamSchema.extend({
      tid: idParamSchema.shape.id
    })
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { id: number; tid: number };
    const tid = Number(params.tid);
    await categoriesService.restoreCategoryTranslation(tid);
    const ct = await categoriesService.getCategoryTranslationById(tid);
    return ok(res, ct, 'Category translation restored');
  })
);

export default router;
