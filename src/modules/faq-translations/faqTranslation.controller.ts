import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { applySearch } from '../../utils/search';

const TABLE = 'faq_translations';
const PARENT_TABLE = 'faqs';
const CACHE_KEY = 'faq_translations:all';

const clearCache = async (faqId?: number) => {
  await redis.del(CACHE_KEY);
  if (faqId) await redis.del(`faq_translations:faq:${faqId}`);
};

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.faq_id === 'string') body.faq_id = parseInt(body.faq_id) || 0;
  if (typeof body.language_id === 'string') body.language_id = parseInt(body.language_id) || 0;
  // Nullify empty strings
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = `*, languages!faq_translations_language_id_fkey(id, name, iso_code)`;

// ── LIST ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'id' });

  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = applySearch(q, search, { ilike: ['question', 'answer'] });
  if (req.query.faq_id) q = q.eq('faq_id', parseInt(req.query.faq_id as string));
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
  if (e || !data) return err(res, 'FAQ translation not found', 404);
  return ok(res, data);
}

/**
 * GET /faq-translations/coverage
 * Returns X/Y translation coverage for all active FAQs (or a specific one via ?faq_id=X).
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

  // Get all non-deleted FAQs (or a specific one)
  let parentQ = supabase
    .from(PARENT_TABLE)
    .select('id, question')
    .is('deleted_at', null)
    .order('id');
  const faqId = req.query.faq_id ? parseInt(req.query.faq_id as string) : undefined;
  if (faqId) parentQ = parentQ.eq('id', faqId);

  const { data: parents, error: parentErr } = await parentQ;
  if (parentErr) return err(res, parentErr.message, 500);

  // Get all non-deleted translations
  let transQ = supabase
    .from(TABLE)
    .select('faq_id, language_id')
    .is('deleted_at', null);
  if (faqId) transQ = transQ.eq('faq_id', faqId);

  const { data: translations, error: transErr } = await transQ;
  if (transErr) return err(res, transErr.message, 500);

  // Build translation map
  const transMap = new Map<number, Set<number>>();
  for (const t of (translations || [])) {
    if (!transMap.has(t.faq_id)) transMap.set(t.faq_id, new Set());
    transMap.get(t.faq_id)!.add(t.language_id);
  }

  const result = (parents || []).map(parent => {
    const translatedLangIds = transMap.get(parent.id) || new Set();
    const missingLangs = (activeLangs || []).filter(l => !translatedLangIds.has(l.id));
    const translatedLangs = (activeLangs || []).filter(l => translatedLangIds.has(l.id));
    return {
      faq_id: parent.id,
      faq_question: parent.question?.substring(0, 80),
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
  const { data: parent } = await supabase.from(PARENT_TABLE).select('id, question').eq('id', body.faq_id).single();
  if (!parent) return err(res, 'FAQ not found', 404);

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
    .eq('faq_id', body.faq_id)
    .eq('language_id', body.language_id)
    .is('deleted_at', null)
    .single();
  if (dup) return err(res, 'Translation already exists for this language', 409);

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  // Sync question/answer to parent if English (language_id=7)
  if (body.language_id === 7) {
    const syncFields: any = {};
    if (body.question) syncFields.question = body.question;
    if (body.answer) syncFields.answer = body.answer;
    if (Object.keys(syncFields).length > 0) {
      await supabase.from(PARENT_TABLE).update(syncFields).eq('id', body.faq_id);
    }
  }

  await clearCache(body.faq_id);
  logAdmin({ actorId: req.user!.id, action: 'faq_translation_created', targetType: 'faq_translation', targetId: data.id, targetName: `${parent.question?.substring(0, 60)} [${lang.iso_code}]`, ip: getClientIp(req) });
  return ok(res, data, 'FAQ translation created', 201);
}

// ── UPDATE ──
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (!old) return err(res, 'FAQ translation not found', 404);

  const updates = parseBody(req);

  const { data, error: e } = await supabase.from(TABLE).update(updates).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  // Sync question/answer to parent if English
  if (old.language_id === 7) {
    const syncFields: any = {};
    if (updates.question) syncFields.question = updates.question;
    if (updates.answer) syncFields.answer = updates.answer;
    if (Object.keys(syncFields).length > 0) {
      await supabase.from(PARENT_TABLE).update(syncFields).eq('id', old.faq_id);
    }
  }

  await clearCache(old.faq_id);
  logAdmin({ actorId: req.user!.id, action: 'faq_translation_updated', targetType: 'faq_translation', targetId: id, targetName: `translation:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'FAQ translation updated');
}

// ── SOFT DELETE ──
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('faq_id, question, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'FAQ translation not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.faq_id);
  logAdmin({ actorId: req.user!.id, action: 'faq_translation_soft_deleted', targetType: 'faq_translation', targetId: id, targetName: old.question?.substring(0, 80), ip: getClientIp(req) });
  return ok(res, data, 'FAQ translation moved to trash');
}

// ── RESTORE ──
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('faq_id, question, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'FAQ translation not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  // Block restore if parent FAQ is still deleted
  const { data: parentFaq } = await supabase.from(PARENT_TABLE).select('deleted_at').eq('id', old.faq_id).single();
  if (parentFaq?.deleted_at) return err(res, 'Cannot restore translation — parent FAQ is still in trash. Restore it first.', 400);

  const { data, error: e } = await supabase
    .from(TABLE)
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.faq_id);
  logAdmin({ actorId: req.user!.id, action: 'faq_translation_restored', targetType: 'faq_translation', targetId: id, targetName: old.question?.substring(0, 80), ip: getClientIp(req) });
  return ok(res, data, 'FAQ translation restored');
}

// ── PERMANENT DELETE ──
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('faq_id, question').eq('id', id).single();
  if (!old) return err(res, 'FAQ translation not found', 404);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.faq_id);
  logAdmin({ actorId: req.user!.id, action: 'faq_translation_deleted', targetType: 'faq_translation', targetId: id, targetName: old.question?.substring(0, 80), ip: getClientIp(req) });
  return ok(res, null, 'FAQ translation permanently deleted');
}
