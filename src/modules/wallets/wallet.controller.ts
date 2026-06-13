import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { getOrCreateWallet, creditWallet, debitWallet, freezeWallet, unfreezeWallet } from '../../services/wallet.service';
import { notifyWalletFrozen } from '../../services/notification.service';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

const TABLE = 'wallets';
const CACHE_KEY = 'wallets:all';

const FK_SELECT = `*,
  user:users!wallets_user_id_fkey(id, first_name, last_name, email, type, profile_picture:avatar_url)`;

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_frozen === 'string') body.is_frozen = body.is_frozen === 'true';
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.auto_payout_enabled === 'string') body.auto_payout_enabled = body.auto_payout_enabled === 'true';
  // Integer fields
  for (const k of ['user_id', 'payout_day']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  // Decimal fields
  for (const k of ['balance', 'min_payout_amount']) {
    if (typeof body[k] === 'string') body[k] = toNumOrNull(body[k]);
  }
  // JSON fields
  if (typeof body.payout_details === 'string') {
    try { body.payout_details = JSON.parse(body.payout_details); } catch { body.payout_details = null; }
  }
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  try {
    const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

    let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

    if (search) q = q.or(`user.first_name.ilike.%${search}%,user.last_name.ilike.%${search}%,user.email.ilike.%${search}%`);
    if (req.query.is_frozen === 'true') q = q.eq('is_frozen', true);
    if (req.query.is_frozen === 'false') q = q.eq('is_frozen', false);
    if (req.query.user_id) q = q.eq('user_id', parseInt(req.query.user_id as string));
    if (req.query.auto_payout_enabled === 'true') q = q.eq('auto_payout_enabled', true);

    // Balance range filters
    if (req.query.min_balance) q = q.gte('balance', parseFloat(req.query.min_balance as string));
    if (req.query.max_balance) q = q.lte('balance', parseFloat(req.query.max_balance as string));

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
    if (e || !data) return err(res, 'Wallet not found', 404);
    return ok(res, data);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function getByUserId(req: Request, res: Response) {
  try {
    const userId = parseInt(req.params.userId);
    const wallet = await getOrCreateWallet(userId);
    if (!wallet) return err(res, 'Failed to get wallet', 500);

    const { data } = await supabase.from(TABLE).select(FK_SELECT).eq('id', wallet.id).single();
    return ok(res, data);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

// ── Self-service endpoints (June 2026 — the web /wallet page) ──────────────
// Any signed-in user; always scoped to req.user.id — never accepts a user id.

/** GET /wallets/me — the caller's own wallet (auto-created on first access). */
export async function getMine(req: Request, res: Response) {
  try {
    const wallet = await getOrCreateWallet(req.user!.id);
    if (!wallet) return err(res, 'Failed to get wallet', 500);
    return ok(res, wallet);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

/** GET /wallets/me/transactions?page=&limit= — the caller's own history. */
export async function myTransactions(req: Request, res: Response) {
  try {
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const wallet = await getOrCreateWallet(req.user!.id);
    if (!wallet) return err(res, 'Failed to get wallet', 500);

    const { data, count, error: e } = await supabase
      .from('wallet_transactions')
      .select('id, transaction_type, amount, balance_before, balance_after, source_type, source_id, description, status, created_at', { count: 'exact' })
      .eq('wallet_id', wallet.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (e) return err(res, e.message, 500);
    return paginated(res, data || [], count || 0, page, limit);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function create(req: Request, res: Response) {
  try {
    const body = parseBody(req);
    if (!body.user_id) return err(res, 'user_id is required', 400);

    // Check if wallet already exists
    const { data: existing } = await supabase.from(TABLE).select('id').eq('user_id', body.user_id).is('deleted_at', null).single();
    if (existing) return err(res, 'Wallet already exists for this user', 400);

    body.created_by = req.user!.id;

    const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'wallet_created', targetType: 'wallet', targetId: data.id, targetName: `Wallet #${data.id}`, ip: getClientIp(req) });
    return ok(res, data, 'Wallet created', 201);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (!old) return err(res, 'Wallet not found', 404);

    const updates = parseBody(req);
    // Don't allow direct balance manipulation via update
    delete updates.balance;
    delete updates.total_credited;
    delete updates.total_debited;
    delete updates.total_withdrawn;
    updates.updated_by = req.user!.id;

    const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'wallet_updated', targetType: 'wallet', targetId: id, targetName: `Wallet #${id}`, changes: updates, ip: getClientIp(req) });
    return ok(res, data, 'Wallet updated');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

// ── Freeze / Unfreeze ──
export async function toggleFreeze(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: wallet } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (!wallet) return err(res, 'Wallet not found', 404);

    const action = wallet.is_frozen ? 'unfreeze' : 'freeze';
    const success = wallet.is_frozen
      ? await unfreezeWallet(id, req.user!.id)
      : await freezeWallet(id, req.user!.id, req.body?.reason ? String(req.body.reason) : null); // BUG-42

    if (!success) return err(res, `Failed to ${action} wallet`, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: wallet.is_frozen ? 'wallet_unfrozen' : 'wallet_frozen', targetType: 'wallet', targetId: id, targetName: `Wallet #${id}`, ip: getClientIp(req) });

    // BUG-53: alert the wallet owner (in-app + email) when their wallet is frozen, with the reason.
    if (action === 'freeze' && wallet.user_id) {
      notifyWalletFrozen(wallet.user_id, req.body?.reason ? String(req.body.reason) : '', id).catch(() => { /* non-blocking */ });
    }

    const { data } = await supabase.from(TABLE).select(FK_SELECT).eq('id', id).single();
    return ok(res, data, `Wallet ${action === 'freeze' ? 'frozen' : 'unfrozen'}`);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

// ── Manual Credit ──
export async function manualCredit(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: wallet } = await supabase.from(TABLE).select('user_id').eq('id', id).single();
    if (!wallet) return err(res, 'Wallet not found', 404);

    const { amount, description } = req.body;
    if (!amount || parseFloat(amount) <= 0) return err(res, 'Valid amount is required', 400);
    if (!description) return err(res, 'Description is required for manual credit', 400);

    const result = await creditWallet({
      userId: wallet.user_id,
      amount: parseFloat(amount),
      sourceType: 'manual_credit',
      description,
      metadata: { admin_id: req.user!.id },
      createdBy: req.user!.id,
    });

    if (!result.success) return err(res, result.error || 'Credit failed', 400);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'wallet_manual_credit', targetType: 'wallet', targetId: id, targetName: `Wallet #${id}`, metadata: { amount, description }, ip: getClientIp(req) });

    const { data } = await supabase.from(TABLE).select(FK_SELECT).eq('id', id).single();
    return ok(res, data, `Credited ${amount} successfully`);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

// ── Manual Debit ──
export async function manualDebit(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: wallet } = await supabase.from(TABLE).select('user_id').eq('id', id).single();
    if (!wallet) return err(res, 'Wallet not found', 404);

    const { amount, description } = req.body;
    if (!amount || parseFloat(amount) <= 0) return err(res, 'Valid amount is required', 400);
    if (!description) return err(res, 'Description is required for manual debit', 400);

    const result = await debitWallet({
      userId: wallet.user_id,
      amount: parseFloat(amount),
      sourceType: 'manual_debit',
      description,
      metadata: { admin_id: req.user!.id },
      createdBy: req.user!.id,
    });

    if (!result.success) return err(res, result.error || 'Debit failed', 400);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'wallet_manual_debit', targetType: 'wallet', targetId: id, targetName: `Wallet #${id}`, metadata: { amount, description }, ip: getClientIp(req) });

    const { data } = await supabase.from(TABLE).select(FK_SELECT).eq('id', id).single();
    return ok(res, data, `Debited ${amount} successfully`);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function softDelete(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (!old) return err(res, 'Wallet not found', 404);

    const { error: e } = await supabase.from(TABLE).update({ deleted_at: new Date().toISOString(), updated_by: req.user!.id }).eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'wallet_soft_deleted', targetType: 'wallet', targetId: id, targetName: `Wallet #${id}`, ip: getClientIp(req) });
    return ok(res, null, 'Wallet deleted');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function restore(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, updated_by: req.user!.id }).eq('id', id).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);
    if (!data) return err(res, 'Wallet not found', 404);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'wallet_restored', targetType: 'wallet', targetId: id, targetName: `Wallet #${id}`, ip: getClientIp(req) });
    return ok(res, data, 'Wallet restored');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (!old) return err(res, 'Wallet not found', 404);

    // Delete transactions first
    await supabase.from('wallet_transactions').delete().eq('wallet_id', id);
    const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'wallet_deleted', targetType: 'wallet', targetId: id, targetName: `Wallet #${id}`, ip: getClientIp(req) });
    return ok(res, null, 'Wallet permanently deleted');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}
