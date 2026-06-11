import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';
import {
  resolveShare,
  DEFAULT_SLABS,
  type PayableItemType,
} from '../../services/revenueShare.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const TABLE = 'revenue_share_tiers';
const FK_SELECT = '*, instructor:users!revenue_share_tiers_instructor_id_fkey(id, first_name, last_name, full_name, email)';
const PAYABLE_TYPES: PayableItemType[] = ['course', 'bundle', 'batch', 'webinar'];
const SORTABLE = new Set(['id', 'min_students', 'instructor_share_pct', 'item_type', 'created_at']);

function parseBody(req: Request): any {
  const b: any = { ...req.body };
  for (const k of ['instructor_id', 'min_students', 'max_students']) {
    if (typeof b[k] === 'string') b[k] = toIntOrNull(b[k]);
  }
  if (typeof b.instructor_share_pct === 'string') b.instructor_share_pct = toNumOrNull(b.instructor_share_pct);
  if (typeof b.is_active === 'string') b.is_active = b.is_active === 'true';
  for (const k of Object.keys(b)) { if (b[k] === '') b[k] = null; }
  // whitelist
  const ALLOWED = new Set(['instructor_id', 'item_type', 'min_students', 'max_students', 'instructor_share_pct', 'notes', 'is_active']);
  for (const k of Object.keys(b)) { if (!ALLOWED.has(k)) delete b[k]; }
  return b;
}

export async function list(req: Request, res: Response) {
  try {
    const { page, limit, offset, sort, ascending } = parseListParams(req, { sort: 'min_students' });
    const sortCol = SORTABLE.has(sort) ? sort : 'min_students';

    let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });
    if (req.query.item_type) q = q.eq('item_type', req.query.item_type as string);
    if (req.query.instructor_id) q = q.eq('instructor_id', parseInt(req.query.instructor_id as string));
    if (req.query.scope === 'global') q = q.is('instructor_id', null);
    if (req.query.show_deleted === 'true') q = q.not('deleted_at', 'is', null);
    else q = q.is('deleted_at', null);

    q = q.order(sortCol, { ascending }).range(offset, offset + limit - 1);
    const { data, count, error: e } = await q;
    if (e) return err(res, e.message, 500);
    return paginated(res, data || [], count || 0, page, limit);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function create(req: Request, res: Response) {
  try {
    const body = parseBody(req);
    if (body.instructor_share_pct == null) return err(res, 'instructor_share_pct is required', 400);
    if (body.instructor_share_pct < 0 || body.instructor_share_pct > 100) return err(res, 'instructor_share_pct must be 0–100', 400);
    if (body.item_type && !PAYABLE_TYPES.includes(body.item_type)) return err(res, `item_type must be one of ${PAYABLE_TYPES.join(', ')}`, 400);
    body.min_students = body.min_students ?? 0;
    body.created_by = req.user!.id;

    const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);
    logAdmin({ actorId: req.user!.id, action: 'data_created', targetType: 'revenue_share_tier', targetId: data.id, targetName: `${data.item_type || 'all'} ${data.min_students}-${data.max_students ?? '∞'} @${data.instructor_share_pct}%`, ip: getClientIp(req) });
    return ok(res, data, 'Tier created', 201);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const updates = parseBody(req);
    if (updates.instructor_share_pct != null && (updates.instructor_share_pct < 0 || updates.instructor_share_pct > 100)) {
      return err(res, 'instructor_share_pct must be 0–100', 400);
    }
    updates.updated_by = req.user!.id;
    updates.updated_at = new Date().toISOString();

    const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);
    return ok(res, data, 'Tier updated');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function softDelete(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data, error: e } = await supabase.from(TABLE)
      .update({ deleted_at: new Date().toISOString(), is_active: false, updated_by: req.user!.id })
      .eq('id', id).select('id').single();
    if (e) return err(res, e.message, 500);
    return ok(res, data, 'Tier deleted');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function restore(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data, error: e } = await supabase.from(TABLE)
      .update({ deleted_at: null, is_active: true, updated_by: req.user!.id })
      .eq('id', id).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);
    return ok(res, data, 'Tier restored');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

/**
 * GET /revenue-share-tiers/my-rates — the signed-in INSTRUCTOR's resolved
 * rates ("all conditions mentioned to the instructor"): per content type the
 * current student count, active slab, full slab table, plus the discount
 * protection rules. Any authenticated user (returns their own numbers).
 */
export async function myRates(req: Request, res: Response) {
  try {
    const instructorId = req.user!.id;
    const types = await Promise.all(
      PAYABLE_TYPES.map(async (t) => {
        const r = await resolveShare(instructorId, t);
        return {
          item_type: t,
          students: r.students,
          instructor_share_pct: r.instructorSharePct,
          system_share_pct: r.systemSharePct,
          scope: r.scope,
          active_slab: r.slab,
          slabs: r.slabs,
        };
      }),
    );

    return ok(res, {
      types,
      defaults: DEFAULT_SLABS,
      rules: [
        'Your share is decided by how many distinct students have bought your content, counted separately per content type.',
        'Default slabs: 0–100 students → 60/40 · 101–500 → 70/30 · 501–5000 → 75/25 · 5000+ → 80/20 (instructor/system). Custom rates may be set for specific content types or instructors.',
        'Your promotions can never discount more than YOUR share of the price — the platform share of the full amount is protected.',
        'If you give a discount (promo code), the platform still earns its full share of the undiscounted amount; the discount comes out of your share.',
        'If the platform gives a discount (coupon), you still earn your full share of the undiscounted amount; the discount comes out of the platform share.',
        'Earnings are calculated per item, net of GST, and confirm after the standard cooling period before payout.',
      ],
    });
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}
