/**
 * Instructor Payout Reporting (Phase 9.8)
 * ───────────────────────────────────────
 * FY-wise 26AS-style TDS statement endpoints.
 *
 * GET /instructor-payouts/me/tds-statement?fy=2526
 *    → Authenticated instructor sees their own per-month TDS breakdown.
 *
 * GET /instructor-payouts/:instructorId/tds-statement?fy=2526
 *    → Admin (with instructor_earning:read) can view any instructor's.
 */

import { Request, Response } from 'express';
import { ok, err } from '../../utils/response';
import { hasPermission } from '../../middleware/rbac';
import { currentFyLabel, getTdsStatement } from '../../services/tds.service';

function resolveFy(req: Request): string {
  const raw = String(req.query.fy || '').trim();
  if (/^\d{4}$/.test(raw)) return raw;
  return currentFyLabel();
}

export async function myTdsStatement(req: Request, res: Response) {
  const fy = resolveFy(req);
  const stmt = await getTdsStatement(req.user!.id, fy);
  return ok(res, {
    instructor_id: req.user!.id,
    fy_label: fy,
    ...stmt,
  });
}

export async function tdsStatementByInstructor(req: Request, res: Response) {
  const instructorId = parseInt(req.params.instructorId, 10);
  if (!Number.isFinite(instructorId)) return err(res, 'Invalid instructor id', 400);

  if (instructorId !== req.user!.id && !hasPermission(req, 'instructor_earning', 'read')) {
    return err(res, 'Forbidden', 403);
  }

  const fy = resolveFy(req);
  const stmt = await getTdsStatement(instructorId, fy);
  return ok(res, {
    instructor_id: instructorId,
    fy_label: fy,
    ...stmt,
  });
}
