import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch } from '../../utils/search';

const TABLE = 'faq_category_translations';
const PARENT_TABLE = 'faq_categories';
const CACHE_KEY = 'faq_category_translations:all';

const clearCache = async (categoryId?: number) => {
  await redis.del(CACHE_KEY);
  if (categoryId) await redis.del(`faq_category_translations:category:${categoryId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.faq_category_id === 'string') body.faq_category_id = parseInt(body.faq_category_id) || 0;
  if (typeof body.language_id === 'string') body.language_id = parseInt(body.language_id) || 0;
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = `*, languages!faq_category_translations_language_id_fkey(id, name, iso_code)`;

// ── LIST ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'id' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = applySearch(q, search, { ilike: ['name'] });
  if (req.query.faq_category_id) q = q.eq('faq_category_id', parseInt(req.query.faq_category_id as string));
  if (req.query.language_id) q = q.eq('language_id', parseInt(req.query.language_id as string));
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

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
  if (e || !data) return err(res, 'FAQ category translation not found', 404);
  return ok(res, data);
}

/**
 * GET /faq-category-translations/coverage
 * Returns X/Y translation coverage for all active FAQ categories (or a specific one).
 */
export async function coverage(req: Request, res: Response) {
  // Get all active languages that are for_material
  const { data: activeLangs, error: langErr } = await supabase
    .from('languages')
    .select('id, name, iso_code, native_name')
    .eq('is_active', true)
    .eq('for_material', true)
    .order('id');
  if (langErr) return err(res, langErr.message, 500);
  const totalLangs = activeLangs?.length || 0;

  // Get all non-deleted categories (or a specific one)
  let parentQ = supabase
    .from(PARENT_TABLE)
    .select('id, name')
    .is('deleted_at', null)
    .order('id');
  const categoryId = req.query.faq_category_id ? parseInt(req.query.faq_category_id as string) : undefined;
  if (categoryId) parentQ = parentQ.eq('id', categoryId);

  const { data: parents, error: parentErr } = await parentQ;
  if (parentErr) return err(res, parentErr.message, 500);

  // Get all non-deleted translations
  let transQ = supabase
    .from(TABLE)
    .select('faq_category_id, language_id')
    .is('deleted_at', null);
  if (categoryId) transQ = transQ.eq('faq_category_id', categoryId);

  const { data: translations, error: transErr } = await transQ;
  if (transErr) return err(res, transErr.message, 500);

  // Build translation map
  const transMap = new Map<number, Set<number>>();
  for (const t of (translations || [])) {
    if (!transMap.has(t.faq_category_id)) transMap.set(t.faq_category_id, new Set());
    transMap.get(t.faq_category_id)!.add(t.language_id);
  }

  const result = (parents || []).map(parent => {
    const translatedLangIds = transMap.get(parent.id) || new Set();
    const missingLangs = (activeLangs || []).filter(l => !translatedLangIds.has(l.id));
    const translatedLangs = (activeLangs || []).filter(l => translatedLangIds.has(l.id));
    return {
      faq_category_id: parent.id,
      faq_category_name: parent.name,
      total_languages: totalLangs,
      translated_count: translatedLangs.length,
      missing_count: missingLangs.length,
      is_complete: missingLangs.length === 0,
      translated_languages: translatedLangs.map(l => ({ id: l.id, name: l.name, iso_code: l.iso_code })),
      missing_languages: missingLangs.map(l => ({ id: l.id, name: l.name, iso_code: l.iso_code, native_name: l.native_name })),
    };
  });

  return ok(res, result, 'Coverage retrieved');
}

// ── CREATE ──
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  // Verify parent exists
  const { data: parent } = await supabase.from(PARENT_TABLE).select('id, name').eq('id', body.faq_category_id).single();
  if (!parent) return err(res, 'FAQ category not found', 404);

  // Verify language is for_material
  const { data: lang } = await supabase
    .from('languages')
    .select('id, name, iso_code')
    .eq('id', body.language_id)
    .eq('for_material', true)
    .single();
  if (!lang) return err(res, 'Language not found or not enabled for material', 404);

  // Check uniqueness
  const { data: dup } = await supabase
    .from(TABLE)
    .select('id')
    .eq('faq_category_id', body.faq_category_id)
    .eq('language_id', body.language_id)
    .is('deleted_at', null)
    .single();
  if (dup) return err(res, 'Translation already exists for this language', 409);

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  // Sync name to parent if English (language_id=7)
  if (body.language_id === 7 && body.name) {
    await supabase.from(PARENT_TABLE).update({ name: body.name }).eq('id', body.faq_category_id);
  }

  await clearCache(body.faq_category_id);
  logAdmin({ actorId: req.user!.id, action: 'faq_category_translation_created', targetType: 'faq_category_translation', targetId: data.id, targetName: `${parent.name} [${lang.iso_code}]`, ip: getClientIp(req) });
  return ok(res, data, 'FAQ category translation created', 201);
}

// ── UPDATE ──
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'FAQ category translation not found', 404);

  const updates = parseBody(req);

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  // Sync name to parent if English
  if (old.language_id === 7 && updates.name) {
    await supabase.from(PARENT_TABLE).update({ name: updates.name }).eq('id', old.faq_category_id);
  }

  await clearCache(old.faq_category_id);
  logAdmin({ actorId: req.user!.id, action: 'faq_category_translation_updated', targetType: 'faq_category_translation', targetId: id, targetName: `translation:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'FAQ category translation updated');
}

// ── SOFT DELETE ──
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('faq_category_id, name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'FAQ category translation not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.faq_category_id);
  logAdmin({ actorId: req.user!.id, action: 'faq_category_translation_soft_deleted', targetType: 'faq_category_translation', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'FAQ category translation moved to trash');
}

// ── RESTORE ──
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('faq_category_id, name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'FAQ category translation not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  // Block restore if parent is still deleted
  const { data: parentCat } = await supabase.from(PARENT_TABLE).select('deleted_at').eq('id', old.faq_category_id).single();
  if (parentCat?.deleted_at) return err(res, 'Cannot restore translation — parent FAQ category is still in trash. Restore it first.', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.faq_category_id);
  logAdmin({ actorId: req.user!.id, action: 'faq_category_translation_restored', targetType: 'faq_category_translation', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'FAQ category translation restored');
}

// ── PERMANENT DELETE ──
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('faq_category_id, name').eq('id', id).single();
  if (!old) return err(res, 'FAQ category translation not found', 404);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.faq_category_id);
  logAdmin({ actorId: req.user!.id, action: 'faq_category_translation_deleted', targetType: 'faq_category_translation', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, null, 'FAQ category translation permanently deleted');
}
