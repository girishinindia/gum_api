// ═══════════════════════════════════════════════════════════════
// /api/v1/cities router — phase 02 master data CRUD.
//
// Authorization model:
//   GET    /            city.read
//   GET    /:id         city.read
//   POST   /            city.create
//   PATCH  /:id         city.update
//   DELETE /:id         city.delete
//   POST   /:id/restore city.restore
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { gateSoftDeleteFilters } from '../../../core/middlewares/gate-soft-delete-filters';
import { authorize, authorizeRole} from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { assertVisibleToCaller } from '../../../core/utils/visibility';
import { idParamSchema } from '../../../shared/validation/common';
import * as citiesService from '../../../modules/resources/cities.service';
import {
  createCityBodySchema,
  listCitiesQuerySchema,
  updateCityBodySchema,
  type CreateCityBody,
  type ListCitiesQuery,
  type UpdateCityBody
} from '../../../modules/resources/cities.schemas';

const router = Router();

router.use(authenticate);
router.use(gateSoftDeleteFilters);

// ─── GET /  list ─────────────────────────────────────────────────

router.get(
  '/',
  authorize('city.read'),
  validate({ query: listCitiesQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListCitiesQuery;
    const { rows, meta } = await citiesService.listCities(q);
    return paginated(res, rows, meta, 'OK');
  })
);

// ─── GET /:id  read one ──────────────────────────────────────────

router.get(
  '/:id',
  authorize('city.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const city = await citiesService.getCityById(id);
    assertVisibleToCaller(city, req.user, 'City', id);
    return ok(res, city, 'OK');
  })
);

// ─── POST /  create ──────────────────────────────────────────────

router.post(
  '/',
  authorize('city.create'),
  validate({ body: createCityBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateCityBody;
    const result = await citiesService.createCity(body, req.user?.id ?? null);
    const city = await citiesService.getCityById(result.id);
    return created(res, city, 'City created');
  })
);

// ─── PATCH /:id  update ──────────────────────────────────────────

router.patch(
  '/:id',
  authorize('city.update'),
  validate({ params: idParamSchema, body: updateCityBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateCityBody;
    await citiesService.updateCity(id, body, req.user?.id ?? null);
    const city = await citiesService.getCityById(id);
    return ok(res, city, 'City updated');
  })
);

// ─── DELETE /:id  soft delete ────────────────────────────────────

router.delete(
  '/:id',
  authorizeRole('super_admin'),
  authorize('city.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await citiesService.deleteCity(id);
    return ok(res, { id, deleted: true }, 'City deleted');
  })
);

// ─── POST /:id/restore  restore ──────────────────────────────────

router.post(
  '/:id/restore',
  authorizeRole('super_admin'),
  authorize('city.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await citiesService.restoreCity(id);
    const city = await citiesService.getCityById(id);
    return ok(res, city, 'City restored');
  })
);

export default router;
