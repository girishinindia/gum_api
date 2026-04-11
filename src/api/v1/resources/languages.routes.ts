// ═══════════════════════════════════════════════════════════════
// /api/v1/languages router — phase 02 master data CRUD.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as languagesService from '../../../modules/resources/languages.service';
import {
  createLanguageBodySchema,
  listLanguagesQuerySchema,
  updateLanguageBodySchema,
  type CreateLanguageBody,
  type ListLanguagesQuery,
  type UpdateLanguageBody
} from '../../../modules/resources/languages.schemas';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  authorize('language.read'),
  validate({ query: listLanguagesQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListLanguagesQuery;
    const { rows, meta } = await languagesService.listLanguages(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('language.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const language = await languagesService.getLanguageById(id);
    if (!language) throw AppError.notFound(`Language ${id} not found`);
    return ok(res, language, 'OK');
  })
);

router.post(
  '/',
  authorize('language.create'),
  validate({ body: createLanguageBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateLanguageBody;
    const result = await languagesService.createLanguage(body, req.user?.id ?? null);
    const language = await languagesService.getLanguageById(result.id);
    return created(res, language, 'Language created');
  })
);

router.patch(
  '/:id',
  authorize('language.update'),
  validate({ params: idParamSchema, body: updateLanguageBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateLanguageBody;
    await languagesService.updateLanguage(id, body, req.user?.id ?? null);
    const language = await languagesService.getLanguageById(id);
    return ok(res, language, 'Language updated');
  })
);

router.delete(
  '/:id',
  authorize('language.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await languagesService.deleteLanguage(id);
    return ok(res, { id, deleted: true }, 'Language deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('language.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    await languagesService.restoreLanguage(id);
    const language = await languagesService.getLanguageById(id);
    return ok(res, language, 'Language restored');
  })
);

export default router;
