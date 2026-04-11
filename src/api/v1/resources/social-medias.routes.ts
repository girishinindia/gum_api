// ═══════════════════════════════════════════════════════════════
// /api/v1/social-medias router — phase 02 master data CRUD.
//
// Authorization model:
//   GET    /              social_media.read
//   GET    /:id           social_media.read
//   POST   /              social_media.create
//   PATCH  /:id           social_media.update
//   DELETE /:id           social_media.delete
//   POST   /:id/restore   social_media.restore
//   POST   /:id/icon      social_media.update   (multipart, field `file`)
//   DELETE /:id/icon      social_media.update
//
// All routes require an authenticated user.
//
// Icons:
//   • Input MIME:   PNG / JPEG / WebP / SVG (enforced by multer)
//   • Max raw size: 100 KB (enforced by multer)
//   • Output:       always WebP, resized to fit 256×256 box
//   • Byte cap:     ≤ 100 KB on the final WebP (sharp quality loop)
//   • Storage key:  social-medias/icons/<id>.webp  (deterministic)
//   • On replace:   prior Bunny object(s) are deleted BEFORE new PUT,
//                   so there are no orphans left behind.
//   • DELETE /icon: clears icon_url and best-effort removes the
//                   prior Bunny object.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { uploadSocialMediaIcon } from '../../../core/middlewares/upload';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as socialMediasService from '../../../modules/resources/social-medias.service';
import {
  createSocialMediaBodySchema,
  listSocialMediasQuerySchema,
  updateSocialMediaBodySchema,
  type CreateSocialMediaBody,
  type ListSocialMediasQuery,
  type UpdateSocialMediaBody
} from '../../../modules/resources/social-medias.schemas';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  authorize('social_media.read'),
  validate({ query: listSocialMediasQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListSocialMediasQuery;
    const { rows, meta } = await socialMediasService.listSocialMedias(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('social_media.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const sm = await socialMediasService.getSocialMediaById(id);
    if (!sm) throw AppError.notFound(`Social media ${id} not found`);
    return ok(res, sm, 'OK');
  })
);

router.post(
  '/',
  authorize('social_media.create'),
  validate({ body: createSocialMediaBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateSocialMediaBody;
    const result = await socialMediasService.createSocialMedia(body, req.user?.id ?? null);
    const sm = await socialMediasService.getSocialMediaById(result.id);
    return created(res, sm, 'Social media created');
  })
);

router.patch(
  '/:id',
  authorize('social_media.update'),
  validate({ params: idParamSchema, body: updateSocialMediaBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateSocialMediaBody;
    await socialMediasService.updateSocialMedia(id, body, req.user?.id ?? null);
    const sm = await socialMediasService.getSocialMediaById(id);
    return ok(res, sm, 'Social media updated');
  })
);

router.delete(
  '/:id',
  authorize('social_media.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await socialMediasService.deleteSocialMedia(id);
    return ok(res, { id, deleted: true }, 'Social media deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('social_media.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await socialMediasService.restoreSocialMedia(id);
    const sm = await socialMediasService.getSocialMediaById(id);
    return ok(res, sm, 'Social media restored');
  })
);

// ─── Icon upload ────────────────────────────────────────────────

router.post(
  '/:id/icon',
  authorize('social_media.update'),
  validate({ params: idParamSchema }),
  uploadSocialMediaIcon,
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    if (!req.file) {
      throw AppError.badRequest('file field is required (multipart/form-data)');
    }
    const sm = await socialMediasService.processSocialMediaIconUpload(
      id,
      req.file,
      req.user?.id ?? null
    );
    return ok(res, sm, 'Social media icon uploaded');
  })
);

router.delete(
  '/:id/icon',
  authorize('social_media.update'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const sm = await socialMediasService.deleteSocialMediaIcon(id, req.user?.id ?? null);
    return ok(res, sm, 'Social media icon deleted');
  })
);

export default router;
