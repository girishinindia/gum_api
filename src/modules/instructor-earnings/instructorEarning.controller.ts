import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const TABLE = 'instructor_earnings';
const CACHE_KEY = 'instructor_earnings:all';

const FK_SELECT = '*, users!instructor_earnings_instructor_id_fkey(id, first_name, last_name, email), users!instructor_earnings_student_id_fkey(id, first_name, last_name, email), orders(id, order_number)';

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integer fields
  for (const k of ['instructor_id', 'order_id', 'order_item_id', 'item_id', 'student_id', 'payout_request_id']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  // Float fields
  for (const k of ['order_amount', 'platform_fee', 'gst_amount', 'instructor_share', 'earning_amount']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseFloat(body[k]) || null : null;
  }
  // JSON fields
  if (typeof body.metadata === 'string') {
    try { body.metadata = JSON.parse(body.metadata); } catch { body.metadata = null; }
  }
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  try {
    const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

    let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

    if (search) q = q.or(`item_type.ilike.%${search}%,earning_status.ilike.%${search}%`);
    if (req.query.instructor_id) q = q.eq('instructor_id', parseInt(req.query.instructor_id as string));
    if (req.query.order_id) q = q.eq('order_id', parseInt(req.query.order_id as string));
    if (req.query.item_type) q = q.eq('item_type', req.query.item_type as string);
    if (req.query.earning_status) q = q.eq('earning_status', req.query.earning_status as string);
    if (req.query.student_id) q = q.eq('student_id', parseInt(req.query.student_id as string));

    if (req.query.show_deleted === 'true') {
      q = q.not('deleted_at', 'is', null);
    } else {
      q = q.is('deleted_at', null);
    }

    q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

    const { data, count, error: e } = await q;
    if (e) return err(res, e.message, 500);
    return paginated(res, data || [], count || 0, page, limit);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function getById(req: Request, res: Response) {
  try {
    const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
    if (e || !data) return err(res, 'Instructor earning not found', 404);
    return ok(res, data);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function create(req: Request, res: Response) {
  try {
    const body = parseBody(req);
    if (!body.instructor_id) return err(res, 'instructor_id is required', 400);
    if (!body.order_id) return err(res, 'order_id is required', 400);

    body.created_by = req.user!.id;

    const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'instructor_earning_created', targetType: 'instructor_earning', targetId: data.id, targetName: `#${data.id}`, ip: getClientIp(req) });
    return ok(res, data, 'Instructor earning created', 201);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (!old) return err(res, 'Instructor earning not found', 404);

    const updates = parseBody(req);
    updates.updated_by = req.user!.id;

    const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'instructor_earning_updated', targetType: 'instructor_earning', targetId: id, targetName: `#${id}`, ip: getClientIp(req) });
    return ok(res, data, 'Instructor earning updated');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function softDelete(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('id, deleted_at').eq('id', id).single();
    if (!old) return err(res, 'Instructor earning not found', 404);
    if (old.deleted_at) return err(res, 'Already in trash', 400);

    const now = new Date().toISOString();
    const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: now, is_active: false, updated_by: req.user!.id }).eq('id', id).select().single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'instructor_earning_soft_deleted', targetType: 'instructor_earning', targetId: id, targetName: `#${id}`, ip: getClientIp(req) });
    return ok(res, data, 'Instructor earning moved to trash');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function restore(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('id, deleted_at').eq('id', id).single();
    if (!old) return err(res, 'Instructor earning not found', 404);
    if (!old.deleted_at) return err(res, 'Not in trash', 400);

    const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, is_active: true, updated_by: req.user!.id }).eq('id', id).select().single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'instructor_earning_restored', targetType: 'instructor_earning', targetId: id, targetName: `#${id}`, ip: getClientIp(req) });
    return ok(res, data, 'Instructor earning restored');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('id').eq('id', id).single();
    if (!old) return err(res, 'Instructor earning not found', 404);

    const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'instructor_earning_deleted', targetType: 'instructor_earning', targetId: id, targetName: `#${id}`, ip: getClientIp(req) });
    return ok(res, null, 'Instructor earning permanently deleted');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function getSummary(req: Request, res: Response) {
  try {
    const instructorId = parseInt(req.params.instructorId);
    if (!instructorId) return err(res, 'instructorId is required', 400);

    // Get all non-deleted earnings for this instructor
    const { data: earnings, error: e } = await supabase
      .from(TABLE)
      .select('earning_amount, earning_status')
      .eq('instructor_id', instructorId)
      .is('deleted_at', null);

    if (e) return err(res, e.message, 500);

    const summary = {
      total_earnings: 0,
      pending_earnings: 0,
      confirmed_earnings: 0,
      paid_earnings: 0,
      reversed_earnings: 0,
    };

    for (const earning of (earnings || [])) {
      const amount = earning.earning_amount || 0;
      summary.total_earnings += amount;
      switch (earning.earning_status) {
        case 'pending': summary.pending_earnings += amount; break;
        case 'confirmed': summary.confirmed_earnings += amount; break;
        case 'paid': summary.paid_earnings += amount; break;
        case 'reversed': summary.reversed_earnings += amount; break;
      }
    }

    // Round to 2 decimals
    summary.total_earnings = Math.round(summary.total_earnings * 100) / 100;
    summary.pending_earnings = Math.round(summary.pending_earnings * 100) / 100;
    summary.confirmed_earnings = Math.round(summary.confirmed_earnings * 100) / 100;
    summary.paid_earnings = Math.round(summary.paid_earnings * 100) / 100;
    summary.reversed_earnings = Math.round(summary.reversed_earnings * 100) / 100;

    return ok(res, summary);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}
