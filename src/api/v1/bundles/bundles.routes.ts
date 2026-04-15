// ═══════════════════════════════════════════════════════════════
// /api/v1/bundles router — phase 09 bundles + translations CRUD.
//
// Bundle endpoints:
//   GET    /                 bundle.read
//   GET    /:id              bundle.read
//   POST   /                 bundle.create
//   PATCH  /:id              bundle.update
//   DELETE /:id              bundle.delete   (cascade)
//   POST   /:id/restore      bundle.restore  (cascade)
//
// Translation endpoints (multipart-aware — accept up to 4 image slots):
//   POST   /translations              bundle_translation.create
//   PATCH  /translations/:id          bundle_translation.update
//
// Image slots: thumbnail, banner, ogImage, twitterImage
// All routes require an authenticated user.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import type { Request } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import {
  patchBundleTranslationFiles,
  getSlotFile
} from '../../../core/middlewares/upload';
import { coerceMultipartBody } from '../../../core/middlewares/multipart-body-coerce';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as bundleService from '../../../modules/bundles/bundles.service';
import type { BundleTranslationImageFiles } from '../../../modules/bundles/bundles.service';
import {
  createBundleBodySchema,
  createBundleTranslationBodySchema,
  listBundlesQuerySchema,
  updateBundleBodySchema,
  updateBundleTranslationBodySchema,
  type CreateBundleBody,
  type CreateBundleTranslationBody,
  type ListBundlesQuery,
  type UpdateBundleBody,
  type UpdateBundleTranslationBody
} from '../../../modules/bundles/bundles.schemas';

const collectBundleTranslationFiles = (req: Request): BundleTranslationImageFiles => {
  const files: BundleTranslationImageFiles = {};
  const slots: Array<keyof BundleTranslationImageFiles> = [
    'thumbnail',
    'banner',
    'ogImage',
    'twitterImage'
  ];
  for (const slot of slots) {
    const f = getSlotFile(req, slot);
    if (f) files[slot] = f;
  }
  return files;
};

const router = Router();

router.use(authenticate);

// ─── Bundle CRUD ────────────────────────────────────────────────

router.get(
  '/',
  authorize('bundle.read'),
  validate({ query: listBundlesQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListBundlesQuery;
    const { rows, meta } = await bundleService.listBundles(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('bundle.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const languageId = req.query.languageId
      ? Number(req.query.languageId)
      : undefined;
    const row = await bundleService.getBundleById(id, languageId);
    if (!row) throw AppError.notFound(`Bundle ${id} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/',
  authorize('bundle.create'),
  validate({ body: createBundleBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateBundleBody;
    const result = await bundleService.createBundle(body, req.user?.id ?? null);
    const row = await bundleService.getBundleById(result.id);
    return created(res, row ?? { id: result.id }, 'Bundle created');
  })
);

router.patch(
  '/:id',
  authorize('bundle.update'),
  validate({ params: idParamSchema, body: updateBundleBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateBundleBody;
    await bundleService.updateBundle(id, body, req.user?.id ?? null);
    const row = await bundleService.getBundleById(id);
    return ok(res, row, 'Bundle updated');
  })
);

router.delete(
  '/:id',
  authorize('bundle.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await bundleService.deleteBundle(id, req.user?.id ?? null);
    return ok(res, { id, deleted: true }, 'Bundle deleted (cascade)');
  })
);

router.post(
  '/:id/restore',
  authorize('bundle.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await bundleService.restoreBundle(id, req.user?.id ?? null);
    const row = await bundleService.getBundleById(id);
    return ok(res, row, 'Bundle restored (cascade)');
  })
);

// ─── Translation CRUD (multipart-aware) ─────────────────────────

router.post(
  '/translations',
  authorize('bundle_translation.create'),
  patchBundleTranslationFiles,
  coerceMultipartBody,
  validate({ body: createBundleTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateBundleTranslationBody;
    const files = collectBundleTranslationFiles(req);
    const result = await bundleService.createBundleTranslation(
      body,
      req.user?.id ?? null
    );
    if (Object.keys(files).length > 0) {
      await bundleService.processBundleTranslationImageUploads(
        result.id,
        files,
        req.user?.id ?? null
      );
    }
    return created(res, { id: result.id }, 'Bundle translation created');
  })
);

router.patch(
  '/translations/:id',
  authorize('bundle_translation.update'),
  patchBundleTranslationFiles,
  coerceMultipartBody,
  validate({ params: idParamSchema, body: updateBundleTranslationBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateBundleTranslationBody;
    const files = collectBundleTranslationFiles(req);

    const hasTextChange = Object.keys(body).length > 0;
    const hasFile = Object.keys(files).length > 0;
    if (!hasTextChange && !hasFile) {
      throw AppError.badRequest('Provide at least one field to update');
    }

    if (hasTextChange) {
      await bundleService.updateBundleTranslation(
        id,
        body,
        req.user?.id ?? null
      );
    }
    if (hasFile) {
      await bundleService.processBundleTranslationImageUploads(
        id,
        files,
        req.user?.id ?? null
      );
    }
    return ok(res, { id }, 'Bundle translation updated');
  })
);

export default router;
