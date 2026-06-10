import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { ok, err } from '../../utils/response';

/**
 * Self-serve referral endpoints for the logged-in student. Unlike the admin
 * /referral-codes routes (permission-gated), these are scoped to the caller:
 * a student gets/creates their own code and views their own referrals/rewards.
 */

function genCode(): string {
  return 'GUM' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function myCodeIds(userId: number): Promise<number[]> {
  const { data } = await supabase.from('referral_codes').select('id').eq('student_id', userId).is('deleted_at', null);
  return (data || []).map((r: any) => r.id);
}

// GET /my/referral  → get-or-create my referral code + headline stats
export async function getMine(req: Request, res: Response) {
  try {
    const userId = req.user!.id;

    // A student may (rarely) end up with more than one row — order + limit(1)
    // instead of maybeSingle() so a duplicate never throws the whole request.
    const fetchMine = async () =>
      (await supabase
        .from('referral_codes')
        .select('*')
        .eq('student_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)).data?.[0] ?? null;

    let code = await fetchMine();

    if (!code) {
      let referral_code = genCode();
      for (let i = 0; i < 4; i++) {
        const { data: ex } = await supabase.from('referral_codes').select('id').eq('referral_code', referral_code).maybeSingle();
        if (!ex) break;
        referral_code = genCode();
      }

      const { data: created, error: e } = await supabase.from('referral_codes').insert({
        student_id: userId,
        referral_code,
        discount_percentage: 10,
        // Must be one of wallet_credit | discount_code | cashback
        // (chk_referral_codes_reward_type). The referrer earns 10% as wallet credit.
        referrer_reward_type: 'wallet_credit',
        referrer_reward_percentage: 10,
        is_active: true,
        created_by: userId,
      }).select('*').single();

      if (e || !created) {
        // A concurrent request may have created the row first — re-fetch before failing.
        code = await fetchMine();
        if (!code) return err(res, e?.message || 'Could not create referral code', 500);
      } else {
        code = created;
      }
    }

    return ok(res, {
      id: code.id,
      referral_code: code.referral_code,
      discount_percentage: code.discount_percentage,
      referrer_reward_type: code.referrer_reward_type,
      referrer_reward_percentage: code.referrer_reward_percentage,
      referrer_reward_amount: code.referrer_reward_amount,
      is_active: code.is_active,
      expires_at: code.expires_at,
      stats: {
        total_referrals: code.total_referrals || 0,
        successful_referrals: code.successful_referrals || 0,
        total_earnings: Number(code.total_earnings || 0),
      },
    });
  } catch (e: any) {
    return err(res, e?.message || 'Failed to load referral', 500);
  }
}

// GET /my/referral/usages  → people who used my code
export async function myUsages(req: Request, res: Response) {
  const codeIds = await myCodeIds(req.user!.id);
  if (!codeIds.length) return ok(res, []);

  const { data, error: e } = await supabase.from('referral_usages')
    .select('id, referred_user_id, usage_status, discount_applied, order_amount, converted_at, created_at')
    .in('referral_code_id', codeIds).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(50);
  if (e) return err(res, e.message, 500);

  const userIds = [...new Set((data || []).map((u: any) => u.referred_user_id).filter(Boolean))];
  const nameMap: Record<number, string> = {};
  if (userIds.length) {
    const { data: users } = await supabase.from('users').select('id, full_name, email').in('id', userIds);
    if (users) for (const u of users as any[]) nameMap[u.id] = u.full_name || u.email || 'User';
  }
  return ok(res, (data || []).map((u: any) => ({ ...u, referred_user_name: nameMap[u.referred_user_id] || 'A friend' })));
}

// GET /my/referral/rewards  → rewards I earned
export async function myRewards(req: Request, res: Response) {
  const codeIds = await myCodeIds(req.user!.id);
  if (!codeIds.length) return ok(res, []);

  const { data, error: e } = await supabase.from('referral_rewards')
    .select('id, reward_type, reward_amount, status, credited_at, created_at')
    .in('referral_code_id', codeIds).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(50);
  if (e) return err(res, e.message, 500);
  return ok(res, data || []);
}
