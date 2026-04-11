// ═══════════════════════════════════════════════════════════════
// /api/v1/specializations router — phase 02 master data CRUD.
//
// Authorization model:
//   GET    /              specialization.read
//   GET    /:id           specialization.read
//   POST   /              specialization.create
//   PATCH  /:id           specialization.update
//   DELETE /:id           specialization.delete
//   POST   /:id/restore   specialization.restore
//   POST   /:id/icon      specialization.update   (multipart, field `file`)
//   DELETE /:id/icon      specialization.update
//
// All routes require an authenticated user.
//
// Icons:
//   • Input MIME:   PNG / JPEG / WebP / SVG (enforced by multer)
//   • Max raw size: 100 KB (enforced by multer)
//   • Output:       always WebP, resized to fit 256×256 box
//   • Byte cap:     ≤ 100 KB on the final WebP (sharp quality loop)
//   • Storage key:  specializations/icons/<id>.webp  (deterministic)
//   • On replace:   prior Bunny object(s) are deleted BEFORE new PUT,
//                   so there are no orphans left behind.
//   • DELETE /icon: clears icon_url and best-effort removes the
//                   prior Bunny object.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { uploadSpecializationIcon } from '../../../core/middlewares/upload';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as specializationsService from '../../../modules/resources/specializations.service';
import {
  createSpecializationBodySchema,
  listSpecializationsQuerySchema,
  updateSpecializationBodySchema,
  type CreateSpecializationBody,
  type ListSpecializationsQuery,
  type UpdateSpecializationBody
} from '../../../modules/resources/specializations.schemas';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  authorize('specialization.read'),
  validate({ query: listSpecializationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListSpecializationsQuery;
    const { rows, meta } = await specializationsService.listSpecializations(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('specialization.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const s = await specializationsService.getSpecializationById(id);
    if (!s) throw AppError.notFound(`Specialization ${id} not found`);
    return ok(res, s, 'OK');
  })
);

router.post(
  '/',
  authorize('specialization.create'),
  validate({ body: createSpecializationBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateSpecializationBody;
    const result = await specializationsService.createSpecialization(body, req.user?.id ?? null);
    const s = await specializationsService.getSpecializationById(result.id);
    return created(res, s, 'Specialization created');
  })
);

router.patch(
  '/:id',
  authorize('specialization.update'),
  validate({ params: idParamSchema, body: updateSpecializationBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateSpecializationBody;
    await specializationsService.updateSpecialization(id, body, req.user?.id ?? null);
    const s = await specializationsService.getSpecializationById(id);
    return ok(res, s, 'Specialization updated');
  })
);

router.delete(
  '/:id',
  authorize('specialization.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await specializationsService.deleteSpecialization(id);
    return ok(res, { id, deleted: true }, 'Specialization deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('specialization.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await specializationsService.restoreSpecialization(id);
    const s = await specializationsService.getSpecializationById(id);
    return ok(res, s, 'Specialization restored');
  })
);

// ─── Icon upload ────────────────────────────────────────────────

router.post(
  '/:id/icon',
  authorize('specialization.update'),
  validate({ params: idParamSchema }),
  uploadSpecializationIcon,
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    if (!req.file) {
      throw AppError.badRequest('file field is required (multipart/form-data)');
    }
    const s = await specializationsService.processSpecializationIconUpload(
      id,
      req.file,
      req.user?.id ?? null
    );
    return ok(res, s, 'Specialization icon uploaded');
  })
);

router.delete(
  '/:id/icon',
  authorize('specialization.update'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const s = await specializationsService.deleteSpecializationIcon(id, req.user?.id ?? null);
    return ok(res, s, 'Specialization icon deleted');
  })
);

export default router;
