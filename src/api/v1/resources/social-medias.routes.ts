// ═══════════════════════════════════════════════════════════════
// /api/v1/social-medias router — phase 02 master data CRUD.
//
// Authorization model:
//   GET    /              social_media.read
//   GET    /:id           social_media.read
//   POST   /              social_media.create
//   PATCH  /:id           social_media.update   (JSON or multipart/form-data)
//   DELETE /:id           social_media.delete
//   POST   /:id/restore   social_media.restore
//
// All routes require an authenticated user.
//
// Unified PATCH accepts BOTH text field updates and optional icon
// uploads in a single request:
//   • JSON body: plain text-field patch
//   • multipart/form-data: text fields + optional `icon` slot (100 KB
//     WebP pipeline). Aliases: `iconImage`, `file`.
//   • To clear the icon, set `iconAction=delete` in the same body.
//     Uploading + deleting the same slot in one request is rejected.
//
// Icons (pipeline spec, enforced downstream):
//   • Input MIME:   PNG / JPEG / WebP / SVG
//   • Max raw size: 100 KB
//   • Output:       always WebP, resized to fit 256×256 box
//   • Storage key:  social-medias/icons/<id>.webp  (deterministic)
//   • On replace:   prior Bunny object(s) deleted BEFORE new PUT
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize, authorizeRole} from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import {
  patchSocialMediaFiles,
  getSlotFile
} from '../../../core/middlewares/upload';
import { coerceMultipartBody } from '../../../core/middlewares/multipart-body-coerce';
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

// PATCH /:id — unified text + icon update.
router.patch(
  '/:id',
  authorize('social_media.update'),
  patchSocialMediaFiles,
  coerceMultipartBody,
  validate({ params: idParamSchema, body: updateSocialMediaBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateSocialMediaBody;

    const { iconAction, ...textFields } = body;
    const iconFile = getSlotFile(req, 'icon');

    if (iconFile && iconAction === 'delete') {
      throw AppError.badRequest(
        "Cannot upload a new social media icon AND iconAction=delete in the same request — pick one."
      );
    }

    const hasTextChange = Object.keys(textFields).length > 0;
    const hasFileChange = Boolean(iconFile);
    const hasDelete = iconAction === 'delete';
    if (!hasTextChange && !hasFileChange && !hasDelete) {
      throw AppError.badRequest('Provide at least one field to update');
    }

    if (hasTextChange) {
      await socialMediasService.updateSocialMedia(
        id,
        textFields as UpdateSocialMediaBody,
        req.user?.id ?? null
      );
    }

    if (iconFile) {
      await socialMediasService.processSocialMediaIconUpload(
        id,
        iconFile,
        req.user?.id ?? null
      );
    } else if (iconAction === 'delete') {
      await socialMediasService.deleteSocialMediaIcon(
        id,
        req.user?.id ?? null
      );
    }

    const sm = await socialMediasService.getSocialMediaById(id);
    return ok(res, sm, 'Social media updated');
  })
);

router.delete(
  '/:id',
  authorizeRole('super_admin'),
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
  authorizeRole('super_admin'),
  authorize('social_media.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await socialMediasService.restoreSocialMedia(id);
    const sm = await socialMediasService.getSocialMediaById(id);
    return ok(res, sm, 'Social media restored');
  })
);

export default router;
