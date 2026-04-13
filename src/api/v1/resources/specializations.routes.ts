// ═══════════════════════════════════════════════════════════════
// /api/v1/specializations router — phase 02 master data CRUD.
//
// Authorization model:
//   GET    /              specialization.read
//   GET    /:id           specialization.read
//   POST   /              specialization.create  (JSON or multipart/form-data)
//   PATCH  /:id           specialization.update   (JSON or multipart/form-data)
//   DELETE /:id           specialization.delete
//   POST   /:id/restore   specialization.restore
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
//   • Storage key:  specializations/icons/<id>.webp  (deterministic)
//   • On replace:   prior Bunny object(s) deleted BEFORE new PUT
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize, authorizeRole} from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import {
  patchSpecializationFiles,
  getSlotFile
} from '../../../core/middlewares/upload';
import { coerceMultipartBody } from '../../../core/middlewares/multipart-body-coerce';
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

// POST / — create (JSON or multipart/form-data with optional icon).
router.post(
  '/',
  authorize('specialization.create'),
  patchSpecializationFiles,
  coerceMultipartBody,
  validate({ body: createSpecializationBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateSpecializationBody;
    const iconFile = getSlotFile(req, 'icon');
    const result = await specializationsService.createSpecialization(body, req.user?.id ?? null);
    if (iconFile) {
      await specializationsService.processSpecializationIconUpload(result.id, iconFile, req.user?.id ?? null);
    }
    const s = await specializationsService.getSpecializationById(result.id);
    return created(res, s, 'Specialization created');
  })
);

// PATCH /:id — unified text + icon update.
router.patch(
  '/:id',
  authorize('specialization.update'),
  patchSpecializationFiles,
  coerceMultipartBody,
  validate({ params: idParamSchema, body: updateSpecializationBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateSpecializationBody;

    const { iconAction, ...textFields } = body;
    const iconFile = getSlotFile(req, 'icon');

    if (iconFile && iconAction === 'delete') {
      throw AppError.badRequest(
        "Cannot upload a new specialization icon AND iconAction=delete in the same request — pick one."
      );
    }

    const hasTextChange = Object.keys(textFields).length > 0;
    const hasFileChange = Boolean(iconFile);
    const hasDelete = iconAction === 'delete';
    if (!hasTextChange && !hasFileChange && !hasDelete) {
      throw AppError.badRequest('Provide at least one field to update');
    }

    if (hasTextChange) {
      await specializationsService.updateSpecialization(
        id,
        textFields as UpdateSpecializationBody,
        req.user?.id ?? null
      );
    }

    if (iconFile) {
      await specializationsService.processSpecializationIconUpload(
        id,
        iconFile,
        req.user?.id ?? null
      );
    } else if (iconAction === 'delete') {
      await specializationsService.deleteSpecializationIcon(
        id,
        req.user?.id ?? null
      );
    }

    const s = await specializationsService.getSpecializationById(id);
    return ok(res, s, 'Specialization updated');
  })
);

router.delete(
  '/:id',
  authorizeRole('super_admin'),
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
  authorizeRole('super_admin'),
  authorize('specialization.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await specializationsService.restoreSpecialization(id);
    const s = await specializationsService.getSpecializationById(id);
    return ok(res, s, 'Specialization restored');
  })
);

// Dedicated POST+DELETE /:id/icon endpoints were removed in phase-02
// Stage 4 — use PATCH /:id with multipart/form-data (field `icon`)
// or `iconAction=delete` instead.

export default router;
