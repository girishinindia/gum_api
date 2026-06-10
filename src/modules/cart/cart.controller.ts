import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch } from '../../utils/search';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';
import { attachItems } from '../../utils/itemEnrich';

const TABLE = 'cart_items';
const CACHE_KEY = 'cart_items:all';

const clearCache = async () => { await redis.del(CACHE_KEY); };

const FK_SELECT = '*, users!cart_items_user_id_fkey(full_name, email)';

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  for (const k of ['quantity', 'user_id', 'item_id', 'created_by', 'updated_by']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  for (const k of ['price']) {
    if (typeof body[k] === 'string') body[k] = toNumOrNull(body[k]);
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

export async function list(req: Request, res: Response) {
  try {
    const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

    let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

    if (search) q = applySearch(q, search, { ilike: ['notes'] });
    if (req.query.user_id) q = q.eq('user_id', req.query.user_id as string);
    if (req.query.item_type) q = q.eq('item_type', req.query.item_type as string);

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
    if (e || !data) return err(res, 'Cart item not found', 404);
    return ok(res, data);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function create(req: Request, res: Response) {
  try {
    const body = parseBody(req);
    if (!body.item_type) return err(res, 'item_type is required', 400);
    if (!body.item_id) return err(res, 'item_id is required', 400);

    // Self-service: the cart always belongs to the caller. The web client sends
    // no user_id; forcing it here also closes the IDOR (can't add to someone
    // else's cart by passing a different user_id).
    body.user_id = req.user!.id;
    body.created_by = req.user!.id;

    // Idempotent on (user_id, item_type, item_id): restore a soft-deleted row or
    // return the existing one instead of erroring / creating a duplicate.
    const { data: existing } = await supabase.from(TABLE).select('*')
      .eq('user_id', body.user_id).eq('item_type', body.item_type).eq('item_id', body.item_id).maybeSingle();
    if (existing) {
      if (existing.deleted_at || existing.is_active === false) {
        const { data: restored } = await supabase.from(TABLE)
          .update({ deleted_at: null, is_active: true, updated_by: req.user!.id })
          .eq('id', existing.id).select(FK_SELECT).single();
        await clearCache();
        return ok(res, restored, 'Cart item restored', 200);
      }
      return ok(res, existing, 'Already in cart', 200);
    }

    const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'cart_item_created', targetType: 'cart_item', targetId: data.id, targetName: `${data.item_type}:${data.item_id}`, ip: getClientIp(req) });
    return ok(res, data, 'Cart item created', 201);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (!old) return err(res, 'Cart item not found', 404);

    const updates = parseBody(req);
    updates.updated_by = req.user!.id;

    const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'cart_item_updated', targetType: 'cart_item', targetId: id, targetName: `${data.item_type}:${data.item_id}`, ip: getClientIp(req) });
    return ok(res, data, 'Cart item updated');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function softDelete(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('item_type, item_id, deleted_at').eq('id', id).single();
    if (!old) return err(res, 'Cart item not found', 404);
    if (old.deleted_at) return err(res, 'Already in trash', 400);

    const now = new Date().toISOString();
    const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: now, is_active: false }).eq('id', id).select().single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'cart_item_soft_deleted', targetType: 'cart_item', targetId: id, targetName: `${old.item_type}:${old.item_id}`, ip: getClientIp(req) });
    return ok(res, data, 'Cart item moved to trash');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function restore(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('item_type, item_id, deleted_at').eq('id', id).single();
    if (!old) return err(res, 'Cart item not found', 404);
    if (!old.deleted_at) return err(res, 'Not in trash', 400);

    const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, is_active: true }).eq('id', id).select().single();
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'cart_item_restored', targetType: 'cart_item', targetId: id, targetName: `${old.item_type}:${old.item_id}`, ip: getClientIp(req) });
    return ok(res, data, 'Cart item restored');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const { data: old } = await supabase.from(TABLE).select('item_type, item_id').eq('id', id).single();
    if (!old) return err(res, 'Cart item not found', 404);

    const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'cart_item_deleted', targetType: 'cart_item', targetId: id, targetName: `${old.item_type}:${old.item_id}`, ip: getClientIp(req) });
    return ok(res, null, 'Cart item permanently deleted');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function clearCart(req: Request, res: Response) {
  try {
    const userId = parseInt(req.params.userId);

    const { error: e } = await supabase.from(TABLE).delete().eq('user_id', userId);
    if (e) return err(res, e.message, 500);

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'cart_cleared', targetType: 'cart_item', targetId: userId, targetName: `user:${userId}`, ip: getClientIp(req) });
    return ok(res, null, 'Cart cleared');
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}

export async function getByUser(req: Request, res: Response) {
  try {
    const userId = parseInt(req.params.userId);

    const { data, error: e } = await supabase
      .from(TABLE)
      .select(FK_SELECT)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (e) return err(res, e.message, 500);
    const enriched = await attachItems(data || []);
    return ok(res, enriched);
  } catch (e: any) {
    return err(res, e.message, 500);
  }
}
