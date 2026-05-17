import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

const TABLE = 'referral_usages';
const CACHE_KEY = 'referral_usages:all';

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  for (const k of ['referral_code_id', 'referred_user_id', 'order_id']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  for (const k of ['discount_applied', 'order_amount']) {
    if (typeof body[k] === 'string') body[k] = toNumOrNull(body[k]);
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = `*, referral_codes(id, referral_code, student_id, users!referral_codes_student_id_fkey(id, full_name, email)), users!referral_usages_referred_user_id_fkey(id, full_name, email, avatar_url)`;

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = q.or(`referral_codes.referral_code.ilike.%${search}%`);
  if (req.query.referral_code_id) q = q.eq('referral_code_id', parseInt(req.query.referral_code_id as string));
  if (req.query.referred_user_id) q = q.eq('referred_user_id', parseInt(req.query.referred_user_id as string));
  if (req.query.usage_status) q = q.eq('usage_status', req.query.usage_status as string);

  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Referral usage not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  if (!body.referral_code_id) return err(res, 'referral_code_id is required', 400);
  if (!body.referred_user_id) return err(res, 'referred_user_id is required', 400);

  // Verify referral code exists
  const { data: code } = await supabase.from('referral_codes').select('id, referral_code').eq('id', body.referral_code_id).single();
  if (!code) return err(res, 'Referral code not found', 404);

  // Verify referred user exists
  const { data: user } = await supabase.from('users').select('id').eq('id', body.referred_user_id).single();
  if (!user) return err(res, 'Referred user not found', 404);

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  // Increment total_referrals on the code
  await supabase.rpc('increment_field', { p_table: 'referral_codes', p_id: body.referral_code_id, p_field: 'total_referrals', p_amount: 1 }).maybeSingle();
  // Fallback: manual increment if RPC doesn't exist
  const { data: codeData } = await supabase.from('referral_codes').select('total_referrals').eq('id', body.referral_code_id).single();
  if (codeData) {
    await supabase.from('referral_codes').update({ total_referrals: (codeData.total_referrals || 0) + 1 }).eq('id', body.referral_code_id);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'referral_usage_created', targetType: 'referral_usage', targetId: data.id, targetName: code.referral_code, ip: getClientIp(req) });
  return ok(res, data, 'Referral usage recorded', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Referral usage not found', 404);

  const updates = parseBody(req);
  updates.updated_by = req.user!.id;

  // If status changing to 'completed', set converted_at
  if (updates.usage_status === 'completed' && old.usage_status !== 'completed') {
    updates.converted_at = new Date().toISOString();
    // Increment successful_referrals on the code
    const { data: codeData } = await supabase.from('referral_codes').select('successful_referrals').eq('id', old.referral_code_id).single();
    if (codeData) {
      await supabase.from('referral_codes').update({ successful_referrals: (codeData.successful_referrals || 0) + 1 }).eq('id', old.referral_code_id);
    }
  }

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'referral_usage_updated', targetType: 'referral_usage', targetId: id, targetName: `Usage #${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Referral usage updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('referral_code_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Referral usage not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: now, is_active: false }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete rewards for this usage
  await supabase.from('referral_rewards').update({ deleted_at: now, is_active: false }).eq('referral_usage_id', id).is('deleted_at', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'referral_usage_soft_deleted', targetType: 'referral_usage', targetId: id, targetName: `Usage #${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Referral usage moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('referral_code_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Referral usage not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  // Block restore if parent referral code is deleted
  const { data: parent } = await supabase.from('referral_codes').select('deleted_at').eq('id', old.referral_code_id).single();
  if (parent?.deleted_at) return err(res, 'Cannot restore: parent referral code is in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, is_active: true }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  // Cascade restore rewards
  await supabase.from('referral_rewards').update({ deleted_at: null, is_active: true }).eq('referral_usage_id', id).not('deleted_at', 'is', null);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'referral_usage_restored', targetType: 'referral_usage', targetId: id, targetName: `Usage #${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Referral usage restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('id').eq('id', id).single();
  if (!old) return err(res, 'Referral usage not found', 404);

  // Cascade delete rewards first
  await supabase.from('referral_rewards').delete().eq('referral_usage_id', id);
  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'referral_usage_deleted', targetType: 'referral_usage', targetId: id, targetName: `Usage #${id}`, ip: getClientIp(req) });
  return ok(res, null, 'Referral usage permanently deleted');
}
