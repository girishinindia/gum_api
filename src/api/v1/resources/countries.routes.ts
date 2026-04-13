// ═══════════════════════════════════════════════════════════════
// /api/v1/countries router — reference data CRUD.
//
// Authorization model:
//   GET    /            country.read
//   GET    /:id         country.read
//   POST   /            country.create  (JSON or multipart/form-data)
//   PATCH  /:id         country.update   (JSON or multipart/form-data)
//   DELETE /:id         country.delete
//   POST   /:id/restore country.restore
//
// Unified PATCH accepts BOTH text field updates and an optional flag
// image upload in a single request:
//   • JSON body: plain text-field patch as before.
//   • multipart/form-data: text fields + optional `flag` file slot
//     (aliases: `flagImage`, `file`). Behind the scenes the service
//     still enforces the locked pipeline — WebP conversion, 90×90,
//     ≤25 KB raw, ISO3-based key, delete-then-upload — so callers
//     cannot bypass the invariants even though the endpoint moved.
//
// The old `POST /:id/flag` route was removed in phase-02 Stage 4.
// There is no `flagAction=delete`: countries always have a flag image.
//
// All routes require an authenticated user (req.user.id is forwarded
// to the UDFs as p_created_by / p_updated_by for the audit trail).
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize, authorizeRole} from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import {
  patchCountryFiles,
  getSlotFile
} from '../../../core/middlewares/upload';
import { coerceMultipartBody } from '../../../core/middlewares/multipart-body-coerce';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as countriesService from '../../../modules/resources/countries.service';
import {
  createCountryBodySchema,
  listCountriesQuerySchema,
  updateCountryBodySchema,
  type CreateCountryBody,
  type ListCountriesQuery,
  type UpdateCountryBody
} from '../../../modules/resources/countries.schemas';

const router = Router();

// Every route below requires authentication.
router.use(authenticate);

// ─── GET /  list ─────────────────────────────────────────────────

router.get(
  '/',
  authorize('country.read'),
  validate({ query: listCountriesQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListCountriesQuery;
    const { rows, meta } = await countriesService.listCountries(q);
    return paginated(res, rows, meta, 'OK');
  })
);

// ─── GET /:id  read one ──────────────────────────────────────────

router.get(
  '/:id',
  authorize('country.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const country = await countriesService.getCountryById(id);
    if (!country) throw AppError.notFound(`Country ${id} not found`);
    return ok(res, country, 'OK');
  })
);

// ─── POST /  create (JSON or multipart/form-data with optional flag) ─

router.post(
  '/',
  authorize('country.create'),
  patchCountryFiles,
  coerceMultipartBody,
  validate({ body: createCountryBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateCountryBody;
    const flagFile = getSlotFile(req, 'flag');
    const result = await countriesService.createCountry(body, req.user?.id ?? null);
    if (flagFile) {
      await countriesService.processCountryFlagUpload(result.id, flagFile, req.user?.id ?? null);
    }
    const country = await countriesService.getCountryById(result.id);
    return created(res, country, 'Country created');
  })
);

// ─── PATCH /:id  update ──────────────────────────────────────────
//
// Unified text + flag update. The flag file (if any) flows through
// exactly the same `processCountryFlagUpload` pipeline that the old
// POST /:id/flag endpoint used — WebP / 90×90 / ISO3 key / delete-then-
// upload — so the on-disk guarantees are unchanged.
router.patch(
  '/:id',
  authorize('country.update'),
  patchCountryFiles,
  coerceMultipartBody,
  validate({ params: idParamSchema, body: updateCountryBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateCountryBody;
    const flagFile = getSlotFile(req, 'flag');

    const hasTextChange = Object.keys(body).length > 0;
    const hasFlag = Boolean(flagFile);
    if (!hasTextChange && !hasFlag) {
      throw AppError.badRequest('Provide at least one field to update');
    }

    if (hasTextChange) {
      await countriesService.updateCountry(id, body, req.user?.id ?? null);
    }
    if (flagFile) {
      await countriesService.processCountryFlagUpload(
        id,
        flagFile,
        req.user?.id ?? null
      );
    }

    const country = await countriesService.getCountryById(id);
    return ok(res, country, 'Country updated');
  })
);

// ─── DELETE /:id  soft delete ────────────────────────────────────

router.delete(
  '/:id',
  authorizeRole('super_admin'),
  authorize('country.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await countriesService.deleteCountry(id);
    return ok(res, { id, deleted: true }, 'Country deleted');
  })
);

// ─── PATCH /:id/flag  flag-only upload (convenience alias) ───────
//
// Accepts multipart/form-data with a single file field (flag / flagImage / file).
// Equivalent to sending PATCH /:id with only the flag file and no text fields.

router.patch(
  '/:id/flag',
  authorize('country.update'),
  patchCountryFiles,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const flagFile = getSlotFile(req, 'flag');
    if (!flagFile) {
      throw AppError.badRequest(
        'No flag file provided. Send multipart/form-data with field "flag", "flagImage", or "file".'
      );
    }
    await countriesService.processCountryFlagUpload(
      id,
      flagFile,
      req.user?.id ?? null
    );
    const country = await countriesService.getCountryById(id);
    return ok(res, country, 'Country flag updated');
  })
);

// ─── POST /:id/restore  restore ──────────────────────────────────

router.post(
  '/:id/restore',
  authorizeRole('super_admin'),
  authorize('country.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await countriesService.restoreCountry(id);
    const country = await countriesService.getCountryById(id);
    return ok(res, country, 'Country restored');
  })
);

export default router;
