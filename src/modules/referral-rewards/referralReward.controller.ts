import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { creditWallet } from '../../services/wallet.service';

const TABLE = 'referral_rewards';
const CACHE_KEY = 'referral_rewards:all';

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  for (const k of ['referral_code_id', 'referral_usage_id']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  for (const k of ['reward_amount']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseFloat(body[k]) || null : null;
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = `*, referral_codes(id, referral_code, student_id, users!referral_codes_student_id_fkey(id, full_name, email)), referral_usages(id, referred_user_id, usage_status, users!referral_usages_referred_user_id_fkey(id, full_name, email))`;

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (req.query.referral_code_id) q = q.eq('referral_code_id', parseInt(req.query.referral_code_id as string));
  if (req.query.referral_usage_id) q = q.eq('referral_usage_id', parseInt(req.query.referral_usage_id as string));
  if (req.query.reward_type) q = q.eq('reward_type', req.query.reward_type as string);
  if (req.query.status) q = q.eq('status', req.query.status as string);

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
  if (e || !data) return err(res, 'Referral reward not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  if (!body.referral_code_id) return err(res, 'referral_code_id is required', 400);
  if (!body.referral_usage_id) return err(res, 'referral_usage_id is required', 400);

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'referral_reward_created', targetType: 'referral_reward', targetId: data.id, targetName: `Reward #${data.id}`, ip: getClientIp(req) });
  return ok(res, data, 'Referral reward created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'Referral reward not found', 404);

  const updates = parseBody(req);
  updates.updated_by = req.user!.id;

  // If status changing to 'credited', set credited_at and update total_earnings on referral_code
  if (updates.status === 'credited' && old.status !== 'credited') {
    updates.credited_at = new Date().toISOString();
    // Add reward_amount to referral_code's total_earnings
    const rewardAmount = updates.reward_amount || old.reward_amount || 0;
    const { data: codeData } = await supabase.from('referral_codes').select('total_earnings').eq('id', old.referral_code_id).single();
    if (codeData) {
      await supabase.from('referral_codes').update({ total_earnings: (parseFloat(codeData.total_earnings) || 0) + rewardAmount }).eq('id', old.referral_code_id);
    }
    // Credit the referrer's wallet
    const { data: refCode } = await supabase.from('referral_codes').select('user_id').eq('id', old.referral_code_id).single();
    if (refCode?.user_id && rewardAmount > 0) {
      await creditWallet({
        userId: refCode.user_id,
        amount: rewardAmount,
        sourceType: 'referral',
        sourceId: id,
        description: `Referral reward #${id} credited`,
        metadata: { referral_code_id: old.referral_code_id },
        createdBy: req.user!.id,
      }).catch(e => console.error('[REFERRAL] Wallet credit failed:', e));
    }
  }

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'referral_reward_updated', targetType: 'referral_reward', targetId: id, targetName: `Reward #${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Referral reward updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Referral reward not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: now, is_active: false }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'referral_reward_soft_deleted', targetType: 'referral_reward', targetId: id, targetName: `Reward #${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Referral reward moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('referral_code_id, referral_usage_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Referral reward not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  // Block restore if parent code or usage is deleted
  const { data: parentCode } = await supabase.from('referral_codes').select('deleted_at').eq('id', old.referral_code_id).single();
  if (parentCode?.deleted_at) return err(res, 'Cannot restore: parent referral code is in trash', 400);
  const { data: parentUsage } = await supabase.from('referral_usages').select('deleted_at').eq('id', old.referral_usage_id).single();
  if (parentUsage?.deleted_at) return err(res, 'Cannot restore: parent referral usage is in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, is_active: true }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'referral_reward_restored', targetType: 'referral_reward', targetId: id, targetName: `Reward #${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Referral reward restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('id').eq('id', id).single();
  if (!old) return err(res, 'Referral reward not found', 404);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'referral_reward_deleted', targetType: 'referral_reward', targetId: id, targetName: `Reward #${id}`, ip: getClientIp(req) });
  return ok(res, null, 'Referral reward permanently deleted');
}
