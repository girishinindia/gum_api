import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch } from '../../utils/search';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

const TABLE = 'faqs';
const CACHE_KEY = 'faqs:all';

const clearCache = async () => {
  await redis.del(CACHE_KEY);
};

const FK_SELECT = '*, faq_categories!faqs_category_id_fkey(id, name), users!faqs_author_id_fkey(id, first_name, last_name, email)';

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  // Boolean fields
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.is_featured === 'string') body.is_featured = body.is_featured === 'true';
  // Integer fields
  for (const k of ['category_id', 'item_id', 'author_id', 'display_order']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// ── LIST ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = applySearch(q, search, { ilike: ['question', 'answer'] });
  if (req.query.category_id) q = q.eq('category_id', parseInt(req.query.category_id as string));
  if (req.query.item_type) q = q.eq('item_type', req.query.item_type as string);
  if (req.query.item_id) q = q.eq('item_id', parseInt(req.query.item_id as string));
  if (req.query.author_type) q = q.eq('author_type', req.query.author_type as string);
  if (req.query.author_id) q = q.eq('author_id', parseInt(req.query.author_id as string));
  if (req.query.is_featured === 'true') q = q.eq('is_featured', true);
  else if (req.query.is_featured === 'false') q = q.eq('is_featured', false);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Soft-delete filter
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

// ── GET BY ID ──
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'FAQ not found', 404);
  return ok(res, data);
}

// ── CREATE ──
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  if (!body.question || !body.answer || !body.item_type) {
    return err(res, 'question, answer, and item_type are required', 400);
  }

  const validTypes = ['course', 'bundle', 'batch', 'webinar', 'general'];
  if (!validTypes.includes(body.item_type)) {
    return err(res, `item_type must be one of: ${validTypes.join(', ')}`, 400);
  }

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'faq_created', targetType: 'faq', targetId: data.id, targetName: body.question?.substring(0, 80), ip: getClientIp(req) });
  return ok(res, data, 'FAQ created', 201);
}

// ── UPDATE ──
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'FAQ not found', 404);

  const updates = parseBody(req);

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'faq_updated', targetType: 'faq', targetId: id, targetName: (updates.question || old.question)?.substring(0, 80), ip: getClientIp(req) });
  return ok(res, data, 'FAQ updated');
}

// ── SOFT DELETE ──
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('question, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'FAQ not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'faq_soft_deleted', targetType: 'faq', targetId: id, targetName: old.question?.substring(0, 80), ip: getClientIp(req) });
  return ok(res, data, 'FAQ moved to trash');
}

// ── RESTORE ──
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('question, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'FAQ not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'faq_restored', targetType: 'faq', targetId: id, targetName: old.question?.substring(0, 80), ip: getClientIp(req) });
  return ok(res, data, 'FAQ restored');
}

// ── PERMANENT DELETE ──
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('question').eq('id', id).single();
  if (!old) return err(res, 'FAQ not found', 404);

  // Phase 45 — faq_translations.faq_id → faqs is ON DELETE RESTRICT, so the
  // permanent delete fails while translations exist. Remove them first.
  await supabase.from('faq_translations').delete().eq('faq_id', id);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'faq_deleted', targetType: 'faq', targetId: id, targetName: old.question?.substring(0, 80), ip: getClientIp(req) });
  return ok(res, null, 'FAQ permanently deleted');
}
