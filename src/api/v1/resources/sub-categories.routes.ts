// ═══════════════════════════════════════════════════════════════
// /api/v1/sub-categories router — phase 02 master data CRUD.
//
// Authorization model:
//   Sub-Category CRUD:
//     GET    /              sub_category.read
//     GET    /:id           sub_category.read
//     POST   /              sub_category.create
//     PATCH  /:id           sub_category.update   (JSON or multipart/form-data)
//     DELETE /:id           sub_category.delete
//     POST   /:id/restore   sub_category.restore
//
//   Unified PATCH accepts BOTH text field updates and optional icon/
//   image uploads in a single request — see categories.routes.ts for
//   the detailed contract. Slot field names:
//     `icon`  (alias: `iconImage`)
//     `image` (alias: `subCategoryImage`)
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
import { authorize, authorizeRole} from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import {
  patchSubCategoryFiles,
  getSlotFile
} from '../../../core/middlewares/upload';
import { coerceMultipartBody } from '../../../core/middlewares/multipart-body-coerce';
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

// PATCH /:id — unified text + icon + image update.
// See categories.routes.ts for the full contract — the pattern is
// identical (icon slot + image slot + iconAction/imageAction fields).
router.patch(
  '/:id',
  authorize('sub_category.update'),
  patchSubCategoryFiles,
  coerceMultipartBody,
  validate({ params: idParamSchema, body: updateSubCategoryBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateSubCategoryBody;

    const { iconAction, imageAction, ...textFields } = body;
    const iconFile = getSlotFile(req, 'icon');
    const imageFile = getSlotFile(req, 'image');

    if (iconFile && iconAction === 'delete') {
      throw AppError.badRequest(
        "Cannot upload a new sub-category icon AND iconAction=delete in the same request — pick one."
      );
    }
    if (imageFile && imageAction === 'delete') {
      throw AppError.badRequest(
        "Cannot upload a new sub-category image AND imageAction=delete in the same request — pick one."
      );
    }

    const hasTextChange = Object.keys(textFields).length > 0;
    const hasFileChange = Boolean(iconFile) || Boolean(imageFile);
    const hasDelete = iconAction === 'delete' || imageAction === 'delete';
    if (!hasTextChange && !hasFileChange && !hasDelete) {
      throw AppError.badRequest('Provide at least one field to update');
    }

    if (hasTextChange) {
      await subCategoriesService.updateSubCategory(
        id,
        textFields as UpdateSubCategoryBody,
        req.user?.id ?? null
      );
    }

    if (iconFile) {
      await subCategoriesService.processSubCategoryIconUpload(
        id,
        iconFile,
        req.user?.id ?? null
      );
    } else if (iconAction === 'delete') {
      await subCategoriesService.deleteSubCategoryIcon(
        id,
        req.user?.id ?? null
      );
    }

    if (imageFile) {
      await subCategoriesService.processSubCategoryImageUpload(
        id,
        imageFile,
        req.user?.id ?? null
      );
    } else if (imageAction === 'delete') {
      await subCategoriesService.deleteSubCategoryImage(
        id,
        req.user?.id ?? null
      );
    }

    const sc = await subCategoriesService.getSubCategoryById(id);
    return ok(res, sc, 'Sub-category updated');
  })
);

router.delete(
  '/:id',
  authorizeRole('super_admin'),
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
  authorizeRole('super_admin'),
  authorize('sub_category.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await subCategoriesService.restoreSubCategory(id);
    const sc = await subCategoriesService.getSubCategoryById(id);
    return ok(res, sc, 'Sub-category restored');
  })
);

// Dedicated icon/image POST+DELETE endpoints were removed in phase-02
// Stage 4 — use PATCH /:id with multipart/form-data instead (field
// `icon` / `image`, or action `iconAction=delete` / `imageAction=delete`).

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
