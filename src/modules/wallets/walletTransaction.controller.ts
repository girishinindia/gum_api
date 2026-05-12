import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { reverseTransaction } from '../../services/wallet.service';
import { applySearch } from '../../utils/search';

const TABLE = 'wallet_transactions';
const CACHE_KEY = 'wallet_transactions:all';

const FK_SELECT = `*,
  wallet:wallets!wallet_transactions_wallet_id_fkey(id, user_id, balance,
    user:users!wallets_user_id_fkey(id, first_name, last_name, email)
  ),
  creator:users!wallet_transactions_created_by_fkey(id, first_name, last_name, email)`;

const clearCache = async () => { await redis.del(CACHE_KEY); };

export async function list(req: Request, res: Response) {
  try {
    const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

    let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

    if (search) q = applySearch(q, search, { ilike: ['description'] });
    if (req.query.wallet_id) q = q.eq('wallet_id', parseInt(req.query.wallet_id as string));
    if (req.query.transaction_type) q = q.eq('transaction_type', req.query.transaction_type as string);
    if (req.query.source_type) q = q.eq('source_type', req.query.source_type as string);
    if (req.query.status) q = q.eq('status', req.query.status as string);

    // Date range
    if (req.query.from_date) q = q.gte('created_at', req.query.from_date as string);
    if (req.query.to_date) q = q.lte('created_at', req.query.to_date as string);

    // Amount range
    if (req.query.min_amount) q = q.gte('amount', parseFloat(req.query.min_amount as string));
    if (req.query.max_amount) q = q.lte('amount', parseFloat(req.query.max_amount as string));

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
    if (e || !data) return err(res, 'Transaction not found', 404);
    return ok(res, data);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

// ── Reverse a transaction ──
export async function reverse(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { reason } = req.body;
    if (!reason) return err(res, 'Reason is required for reversal', 400);

    const result = await reverseTransaction(id, reason, req.user!.id);
    if (!result.success) return err(res, result.error || 'Reversal failed', 400);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'wallet_transaction_reversed', targetType: 'wallet_transaction', targetId: id, targetName: `Transaction #${id}`, metadata: { reason }, ip: getClientIp(req) });

    return ok(res, result, 'Transaction reversed');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function softDelete(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (!old) return err(res, 'Transaction not found', 404);

    const { error: e } = await supabase.from(TABLE).update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'wallet_transaction_soft_deleted', targetType: 'wallet_transaction', targetId: id, targetName: `Transaction #${id}`, ip: getClientIp(req) });
    return ok(res, null, 'Transaction deleted');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function restore(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null }).eq('id', id).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);
    if (!data) return err(res, 'Transaction not found', 404);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'wallet_transaction_restored', targetType: 'wallet_transaction', targetId: id, targetName: `Transaction #${id}`, ip: getClientIp(req) });
    return ok(res, data, 'Transaction restored');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (!old) return err(res, 'Transaction not found', 404);

    const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'wallet_transaction_deleted', targetType: 'wallet_transaction', targetId: id, targetName: `Transaction #${id}`, ip: getClientIp(req) });
    return ok(res, null, 'Transaction permanently deleted');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}
