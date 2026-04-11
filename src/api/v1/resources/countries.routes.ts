// ═══════════════════════════════════════════════════════════════
// /api/v1/countries router — reference data CRUD.
//
// Authorization model:
//   GET    /            country.read
//   GET    /:id         country.read
//   POST   /            country.create
//   PATCH  /:id         country.update
//   DELETE /:id         country.delete
//   POST   /:id/restore country.restore
//   POST   /:id/flag    country.update    (multipart, single file `file`)
//
// All routes require an authenticated user (req.user.id is forwarded
// to the UDFs as p_created_by / p_updated_by for the audit trail).
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { uploadCountryFlag } from '../../../core/middlewares/upload';
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

// ─── POST /  create ──────────────────────────────────────────────

router.post(
  '/',
  authorize('country.create'),
  validate({ body: createCountryBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateCountryBody;
    const result = await countriesService.createCountry(body, req.user?.id ?? null);
    const country = await countriesService.getCountryById(result.id);
    return created(res, country, 'Country created');
  })
);

// ─── PATCH /:id  update ──────────────────────────────────────────

router.patch(
  '/:id',
  authorize('country.update'),
  validate({ params: idParamSchema, body: updateCountryBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateCountryBody;
    await countriesService.updateCountry(id, body, req.user?.id ?? null);
    const country = await countriesService.getCountryById(id);
    return ok(res, country, 'Country updated');
  })
);

// ─── DELETE /:id  soft delete ────────────────────────────────────

router.delete(
  '/:id',
  authorize('country.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await countriesService.deleteCountry(id);
    return ok(res, { id, deleted: true }, 'Country deleted');
  })
);

// ─── POST /:id/flag  upload flag image ───────────────────────────
//
// Multipart contract:
//   field name : `file`
//   max size   : 25 KB        (enforced by multer)
//   MIME       : image/png|jpeg|webp|svg+xml  (enforced by multer)
//   dimensions : exactly 90×90 px              (enforced by sharp in service)
//
// Server-side pipeline (see `countries.service.ts`):
//   1. validate dimensions → 2. re-encode to WebP → 3. delete any prior
//   flag object(s) on Bunny (new ISO3 key, legacy ISO2 key, and whatever
//   path is currently stored in `flag_image`) → 4. upload the new WebP
//   at `countries/flags/<iso3>.webp` (e.g. `countries/flags/ind.webp`)
//   → 5. persist the CDN URL on the country row via an internal-only
//      flag-image setter.
//
// This is the ONLY supported path for changing a flag. PATCH /:id does
// not accept `flagImage` in its body — the schema rejects it — so the
// WebP + ISO3 + delete-first invariants cannot be bypassed.

router.post(
  '/:id/flag',
  authorize('country.update'),
  validate({ params: idParamSchema }),
  uploadCountryFlag,
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    if (!req.file) {
      throw AppError.badRequest('file field is required (multipart/form-data)');
    }
    const country = await countriesService.processCountryFlagUpload(
      id,
      req.file,
      req.user?.id ?? null
    );
    return ok(res, country, 'Country flag uploaded');
  })
);

// ─── POST /:id/restore  restore ──────────────────────────────────

router.post(
  '/:id/restore',
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
