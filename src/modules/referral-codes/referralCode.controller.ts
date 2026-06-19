import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch } from '../../utils/search';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

const TABLE = 'referral_codes';
const CACHE_KEY = 'referral_codes:all';

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  // Integer fields
  for (const k of ['student_id', 'usage_limit', 'usage_count', 'total_referrals', 'successful_referrals']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  // Numeric fields
  for (const k of ['discount_percentage', 'max_discount_amount', 'referrer_reward_percentage', 'total_earnings']) {
    if (typeof body[k] === 'string') body[k] = toNumOrNull(body[k]);
  }
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

/** Generate a referral code like GIRISH-A3X9 from student name */
function generateCode(name: string): string {
  const prefix = (name || 'REF').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 8);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${suffix}`;
}

const FK_SELECT = `*, users!referral_codes_student_id_fkey(id, full_name, email, avatar_url)`;

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = applySearch(q, search, { ilike: ['referral_code'] });
  if (req.query.student_id) q = q.eq('student_id', parseInt(req.query.student_id as string));
  if (req.query.referrer_reward_type) q = q.eq('referrer_reward_type', req.query.referrer_reward_type as string);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Expired filter
  if (req.query.expired === 'true') q = q.not('expires_at', 'is', null).lt('expires_at', new Date().toISOString());
  else if (req.query.expired === 'false') q = q.or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  // Treat an expired code as inactive in the response (a cron persists this).
  const nowMs = Date.now();
  const rows = (data || []).map((r: any) =>
    (r.is_active && r.expires_at && new Date(r.expires_at).getTime() < nowMs) ? { ...r, is_active: false } : r
  );
  return paginated(res, rows, count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Referral code not found', 404);
  // Treat an expired code as inactive in the response.
  const row = (data.is_active && data.expires_at && new Date(data.expires_at).getTime() < Date.now())
    ? { ...data, is_active: false } : data;
  return ok(res, row);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  // expires_at must be a future date.
  if (body.expires_at && new Date(body.expires_at) <= new Date()) {
    return err(res, 'Expiry must be a future date', 400);
  }

  // Verify student exists
  if (!body.student_id) return err(res, 'student_id is required', 400);
  const { data: student } = await supabase.from('users').select('id, full_name').eq('id', body.student_id).single();
  if (!student) return err(res, 'Student not found', 404);

  // Auto-generate code if not provided
  if (!body.referral_code) {
    let code = generateCode(student.full_name);
    // Ensure unique
    for (let i = 0; i < 5; i++) {
      const { data: existing } = await supabase.from(TABLE).select('id').eq('referral_code', code).single();
      if (!existing) break;
      code = generateCode(student.full_name);
    }
    body.referral_code = code;
  }

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'referral_code_created', targetType: 'referral_code', targetId: data.id, targetName: body.referral_code, ip: getClientIp(req) });
  return ok(res, data, 'Referral code created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Referral code not found', 404);

  const updates = parseBody(req);
  // expires_at must be a future date (only when provided).
  if (updates.expires_at && new Date(updates.expires_at) <= new Date()) {
    return err(res, 'Expiry must be a future date', 400);
  }
  updates.updated_by = req.user!.id;

  // Verify student if changed
  if (updates.student_id && updates.student_id !== old.student_id) {
    const { data: student } = await supabase.from('users').select('id').eq('id', updates.student_id).single();
    if (!student) return err(res, 'Student not found', 404);
  }

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'referral_code_updated', targetType: 'referral_code', targetId: id, targetName: updates.referral_code || old.referral_code, ip: getClientIp(req) });
  return ok(res, data, 'Referral code updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('referral_code, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Referral code not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: now, is_active: false }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete to usages and rewards
  await supabase.from('referral_usages').update({ deleted_at: now, is_active: false }).eq('referral_code_id', id).is('deleted_at', null);
  await supabase.from('referral_rewards').update({ deleted_at: now, is_active: false }).eq('referral_code_id', id).is('deleted_at', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'referral_code_soft_deleted', targetType: 'referral_code', targetId: id, targetName: old.referral_code, ip: getClientIp(req) });
  return ok(res, data, 'Referral code moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('referral_code, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Referral code not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, is_active: true }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore to usages and rewards
  await supabase.from('referral_usages').update({ deleted_at: null, is_active: true }).eq('referral_code_id', id).not('deleted_at', 'is', null);
  await supabase.from('referral_rewards').update({ deleted_at: null, is_active: true }).eq('referral_code_id', id).not('deleted_at', 'is', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'referral_code_restored', targetType: 'referral_code', targetId: id, targetName: old.referral_code, ip: getClientIp(req) });
  return ok(res, data, 'Referral code restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('referral_code').eq('id', id).single();
  if (!old) return err(res, 'Referral code not found', 404);

  // Cascade delete rewards then usages then code (FK order)
  await supabase.from('referral_rewards').delete().eq('referral_code_id', id);
  await supabase.from('referral_usages').delete().eq('referral_code_id', id);
  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'referral_code_deleted', targetType: 'referral_code', targetId: id, targetName: old.referral_code, ip: getClientIp(req) });
  return ok(res, null, 'Referral code permanently deleted');
}
