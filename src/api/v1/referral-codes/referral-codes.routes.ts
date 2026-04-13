// ═══════════════════════════════════════════════════════════════
// /api/v1/referral-codes router — phase 15 referral codes CRUD.
//
// Authorization model:
//   Referral Code CRUD:
//     GET    /                        referral_code.read
//     GET    /:id                     referral_code.read
//     POST   /                        referral_code.create
//     PATCH  /:id                     referral_code.update
//     DELETE /:id                     referral_code.delete
//     POST   /:id/restore             referral_code.restore
//
// All routes require an authenticated user.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';

import { authenticate } from '../../../core/middlewares/authenticate';
import { authorize } from '../../../core/middlewares/authorize';
import { validate } from '../../../core/middlewares/validate';
import { AppError } from '../../../core/errors/app-error';
import { created, ok, paginated } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { idParamSchema } from '../../../shared/validation/common';
import * as referralCodeService from '../../../modules/referral-codes/referral-codes.service';
import {
  createReferralCodeBodySchema,
  listReferralCodesQuerySchema,
  updateReferralCodeBodySchema,
  type CreateReferralCodeBody,
  type ListReferralCodesQuery,
  type UpdateReferralCodeBody
} from '../../../modules/referral-codes/referral-codes.schemas';

const router = Router();

router.use(authenticate);

// ─── Referral Code CRUD ──────────────────────────────────────────

router.get(
  '/',
  authorize('referral_code.read'),
  validate({ query: listReferralCodesQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListReferralCodesQuery;
    const { rows, meta } = await referralCodeService.listReferralCodes(q);
    return paginated(res, rows, meta, 'OK');
  })
);

router.get(
  '/:id',
  authorize('referral_code.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const row = await referralCodeService.getReferralCodeById(id);
    if (!row) throw AppError.notFound(`Referral code ${id} not found`);
    return ok(res, row, 'OK');
  })
);

router.post(
  '/',
  authorize('referral_code.create'),
  validate({ body: createReferralCodeBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as CreateReferralCodeBody;
    const callerId = (req as any).user?.id ?? null;
    const { id } = await referralCodeService.createReferralCode(body, callerId);
    const row = await referralCodeService.getReferralCodeById(id);
    return created(res, row, 'Referral code created');
  })
);

router.patch(
  '/:id',
  authorize('referral_code.update'),
  validate({ params: idParamSchema, body: updateReferralCodeBodySchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const body = req.body as UpdateReferralCodeBody;
    const callerId = (req as any).user?.id ?? null;
    await referralCodeService.updateReferralCode(id, body, callerId);
    const row = await referralCodeService.getReferralCodeById(id);
    if (!row) throw AppError.notFound(`Referral code ${id} not found`);
    return ok(res, row, 'Referral code updated');
  })
);

router.delete(
  '/:id',
  authorize('referral_code.delete'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const callerId = (req as any).user?.id ?? null;
    await referralCodeService.deleteReferralCode(id, callerId);
    return ok(res, { id, deleted: true }, 'Referral code deleted');
  })
);

router.post(
  '/:id/restore',
  authorize('referral_code.restore'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const id = Number((req.params as unknown as { id: number }).id);
    const callerId = (req as any).user?.id ?? null;
    await referralCodeService.restoreReferralCode(id, callerId);
    const row = await referralCodeService.getReferralCodeById(id);
    return ok(res, row, 'Referral code restored');
  })
);

export default router;
