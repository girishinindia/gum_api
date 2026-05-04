import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin, logData } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'assessment_translations:all';
const clearCache = async (assessmentId?: number) => {
  await redis.del(CACHE_KEY);
  if (assessmentId) await redis.del(`assessment_translations:assessment:${assessmentId}`);
};

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.assessment_id === 'string') body.assessment_id = parseInt(body.assessment_id) || 0;
  if (typeof body.language_id === 'string') body.language_id = parseInt(body.language_id) || 0;
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  if (typeof body.tech_stack === 'string') { try { body.tech_stack = JSON.parse(body.tech_stack); } catch { body.tech_stack = []; } }
  if (typeof body.learning_outcomes === 'string') { try { body.learning_outcomes = JSON.parse(body.learning_outcomes); } catch { body.learning_outcomes = []; } }
  if (typeof body.tags === 'string') { try { body.tags = JSON.parse(body.tags); } catch { body.tags = []; } }
  if (typeof body.structured_data === 'string') { try { body.structured_data = JSON.parse(body.structured_data); } catch { body.structured_data = []; } }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = '*, assessments(slug, assessment_type, assessment_scope), languages(name, native_name, iso_code)';

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'sort_order' });

  let q = supabase.from('assessment_translations').select(FK_SELECT, { count: 'exact' });

  if (search) q = q.or(`title.ilike.%${search}%,description.ilike.%${search}%,meta_title.ilike.%${search}%,focus_keyword.ilike.%${search}%`);
  if (req.query.assessment_id) q = q.eq('assessment_id', parseInt(req.query.assessment_id as string));
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

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('assessment_translations').select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Assessment translation not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  if (body.is_active === false && !hasPermission(req, 'assessment_translation', 'activate')) {
    return err(res, 'Permission denied: assessment_translation:activate required to create inactive', 403);
  }

  // Verify assessment exists
  const { data: assessment } = await supabase.from('assessments').select('id, slug').eq('id', body.assessment_id).single();
  if (!assessment) return err(res, 'Assessment not found', 404);

  // Verify language exists
  const { data: lang } = await supabase.from('languages').select('id, name, iso_code').eq('id', body.language_id).single();
  if (!lang) return err(res, 'Language not found', 404);

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase
    .from('assessment_translations')
    .insert(body)
    .select(FK_SELECT)
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation already exists for this assessment + language', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.assessment_id);
  logAdmin({ actorId: req.user!.id, action: 'assessment_translation_created', targetType: 'assessment_translation', targetId: data.id, targetName: `${assessment.slug}/${lang.iso_code}`, ip: getClientIp(req) });
  return ok(res, data, 'Assessment translation created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('assessment_translations').select('*').eq('id', id).single();
  if (!old) return err(res, 'Assessment translation not found', 404);

  const updates = parseMultipartBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'assessment_translation', 'activate')) {
      return err(res, 'Permission denied: assessment_translation:activate required', 403);
    }
  }

  updates.updated_by = req.user!.id;

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase
    .from('assessment_translations')
    .update(updates)
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation already exists for this assessment + language', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'updated_by') continue;
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(old.assessment_id);
  logAdmin({ actorId: req.user!.id, action: 'assessment_translation_updated', targetType: 'assessment_translation', targetId: id, targetName: `assessment:${old.assessment_id}`, changes, ip: getClientIp(req) });
  return ok(res, data, 'Assessment translation updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('assessment_translations').select('assessment_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Assessment translation not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from('assessment_translations')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.assessment_id);
  logAdmin({ actorId: req.user!.id, action: 'assessment_translation_soft_deleted', targetType: 'assessment_translation', targetId: id, targetName: `assessment:${old.assessment_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Assessment translation moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('assessment_translations').select('assessment_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Assessment translation not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase
    .from('assessment_translations')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.assessment_id);
  logAdmin({ actorId: req.user!.id, action: 'assessment_translation_restored', targetType: 'assessment_translation', targetId: id, targetName: `assessment:${old.assessment_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Assessment translation restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('assessment_translations').select('assessment_id').eq('id', id).single();
  if (!old) return err(res, 'Assessment translation not found', 404);

  const { error: e } = await supabase.from('assessment_translations').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.assessment_id);
  logAdmin({ actorId: req.user!.id, action: 'assessment_translation_deleted', targetType: 'assessment_translation', targetId: id, targetName: `assessment:${old.assessment_id}`, ip: getClientIp(req) });
  return ok(res, null, 'Assessment translation permanently deleted');
}

// Coverage endpoint: how many languages translated per assessment
export async function coverage(req: Request, res: Response) {
  const assessmentId = parseInt(req.query.assessment_id as string);
  if (!assessmentId) return err(res, 'assessment_id is required', 400);

  const { data, error: e } = await supabase
    .from('assessment_translations')
    .select('id, language_id, title, languages(name, iso_code)')
    .eq('assessment_id', assessmentId)
    .is('deleted_at', null);
  if (e) return err(res, e.message, 500);

  return ok(res, data || []);
}
