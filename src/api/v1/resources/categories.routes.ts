// ═══════════════════════════════════════════════════════════════
// /api/v1/categories router — phase 02 master data CRUD.
//
// Authorization model:
//   Category CRUD:
//     GET    /              category.read
//     GET    /:id           category.read
//     POST   /              category.create  (JSON or multipart/form-data)
//     PATCH  /:id           category.update   (JSON or multipart/form-data)
//     DELETE /:id           category.delete
//     POST   /:id/restore   category.restore
//
//   Unified PATCH accepts BOTH text field updates and optional icon/
//   image uploads in a single request:
//     • JSON body: plain text-field patch as before
//     • multipart/form-data: text fields + optional file slots
//         `icon`  (alias: `iconImage`)   — 100 KB WebP pipeline
//         `image` (alias: `categoryImage`) — 100 KB WebP pipeline
//     • To clear an image, set `iconAction=delete` / `imageAction=delete`
//       in the same body. Upload + delete for the SAME slot is rejected.
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
import { authorize, authorizeRole} from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import {
  patchCategoryFiles,
  getSlotFile
} from '../../../core/middlewares/upload';
import { coerceMultipartBody } from '../../../core/middlewares/multipart-body-coerce';
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

// POST / — create (JSON or multipart/form-data with optional icon + image).
router.post(
  '/',
  authorize('category.create'),
  patchCategoryFiles,
  coerceMultipartBody,
  validate({ body: createCategoryBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateCategoryBody;
    const iconFile = getSlotFile(req, 'icon');
    const imageFile = getSlotFile(req, 'image');
    const result = await categoriesService.createCategory(body, req.user?.id ?? null);
    if (iconFile) {
      await categoriesService.processCategoryIconUpload(result.id, iconFile, req.user?.id ?? null);
    }
    if (imageFile) {
      await categoriesService.processCategoryImageUpload(result.id, imageFile, req.user?.id ?? null);
    }
    const c = await categoriesService.getCategoryById(result.id);
    return created(res, c, 'Category created');
  })
);

// PATCH /:id — unified text + icon + image update.
//
// Middleware order is load-bearing:
//   1. patchCategoryFiles    parses multipart files into req.slotFiles
//                            (no-op on application/json).
//   2. coerceMultipartBody   converts stringy multipart values ("true",
//                            "5") into real bool/int so zod's schema
//                            still matches (no-op on application/json).
//   3. validate({params,body}) runs the zod schema with the coerced body.
//   4. asyncHandler           does the work.
router.patch(
  '/:id',
  authorize('category.update'),
  patchCategoryFiles,
  coerceMultipartBody,
  validate({ params: idParamSchema, body: updateCategoryBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateCategoryBody;

    // Split body into text-field patch vs image-action flags.
    const { iconAction, imageAction, ...textFields } = body;
    const iconFile = getSlotFile(req, 'icon');
    const imageFile = getSlotFile(req, 'image');

    // Mutual-exclusion: uploading + 'delete' for the same slot is a
    // contradiction — bail out before touching Bunny or the DB.
    if (iconFile && iconAction === 'delete') {
      throw AppError.badRequest(
        "Cannot upload a new category icon AND iconAction=delete in the same request — pick one."
      );
    }
    if (imageFile && imageAction === 'delete') {
      throw AppError.badRequest(
        "Cannot upload a new category image AND imageAction=delete in the same request — pick one."
      );
    }

    // At-least-one-change check (moved out of zod so multipart-only
    // icon/image uploads still pass). We consider the request "empty"
    // only if it has no text fields, no file uploads and no delete
    // actions.
    const hasTextChange = Object.keys(textFields).length > 0;
    const hasFileChange = Boolean(iconFile) || Boolean(imageFile);
    const hasDelete = iconAction === 'delete' || imageAction === 'delete';
    if (!hasTextChange && !hasFileChange && !hasDelete) {
      throw AppError.badRequest('Provide at least one field to update');
    }

    // 1. text-field patch first — fails loudly if the row is
    //    soft-deleted, which also stops the image pipeline below.
    if (hasTextChange) {
      await categoriesService.updateCategory(
        id,
        textFields as UpdateCategoryBody,
        req.user?.id ?? null
      );
    }

    // 2. icon slot — upload takes precedence over delete (already
    //    guarded above as mutually exclusive).
    if (iconFile) {
      await categoriesService.processCategoryIconUpload(
        id,
        iconFile,
        req.user?.id ?? null
      );
    } else if (iconAction === 'delete') {
      await categoriesService.deleteCategoryIcon(id, req.user?.id ?? null);
    }

    // 3. image slot.
    if (imageFile) {
      await categoriesService.processCategoryImageUpload(
        id,
        imageFile,
        req.user?.id ?? null
      );
    } else if (imageAction === 'delete') {
      await categoriesService.deleteCategoryImage(id, req.user?.id ?? null);
    }

    const c = await categoriesService.getCategoryById(id);
    return ok(res, c, 'Category updated');
  })
);

router.delete(
  '/:id',
  authorizeRole('super_admin'),
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
  authorizeRole('super_admin'),
  authorize('category.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await categoriesService.restoreCategory(id);
    const c = await categoriesService.getCategoryById(id);
    return ok(res, c, 'Category restored');
  })
);

// Icon / image routes used to live here as POST+DELETE /:id/icon and
// POST+DELETE /:id/image. As of phase-02 Stage 4 they were unified
// into the PATCH /:id handler above — there is now exactly ONE
// endpoint for mutating a category. Clients that still call the old
// URLs will get 404 (and the response will let them discover PATCH).

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
