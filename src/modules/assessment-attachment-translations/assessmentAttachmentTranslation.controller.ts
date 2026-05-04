import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'assessment_attachment_translations:all';
const clearCache = async (attachmentId?: number) => {
  await redis.del(CACHE_KEY);
  if (attachmentId) await redis.del(`assessment_attachment_translations:attachment:${attachmentId}`);
};

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.assessment_attachment_id === 'string') body.assessment_attachment_id = parseInt(body.assessment_attachment_id) || 0;
  if (typeof body.language_id === 'string') body.language_id = parseInt(body.language_id) || 0;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = '*, assessment_attachments(file_name, assessment_id, assessments(slug)), languages(name, native_name, iso_code)';

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from('assessment_attachment_translations').select(FK_SELECT, { count: 'exact' });

  if (search) q = q.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  if (req.query.assessment_attachment_id) q = q.eq('assessment_attachment_id', parseInt(req.query.assessment_attachment_id as string));
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
  const { data, error: e } = await supabase.from('assessment_attachment_translations').select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Assessment attachment translation not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  // Verify attachment exists
  const { data: attachment } = await supabase.from('assessment_attachments').select('id, file_name').eq('id', body.assessment_attachment_id).single();
  if (!attachment) return err(res, 'Assessment attachment not found', 404);

  // Verify language exists
  const { data: lang } = await supabase.from('languages').select('id, iso_code').eq('id', body.language_id).single();
  if (!lang) return err(res, 'Language not found', 404);

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase
    .from('assessment_attachment_translations')
    .insert(body)
    .select(FK_SELECT)
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation already exists for this attachment + language', 409);
    return err(res, e.message, 500);
  }

  await clearCache(body.assessment_attachment_id);
  logAdmin({ actorId: req.user!.id, action: 'assessment_attachment_translation_created', targetType: 'assessment_attachment_translation', targetId: data.id, targetName: `${attachment.file_name}/${lang.iso_code}`, ip: getClientIp(req) });
  return ok(res, data, 'Assessment attachment translation created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('assessment_attachment_translations').select('*').eq('id', id).single();
  if (!old) return err(res, 'Assessment attachment translation not found', 404);

  const updates = parseMultipartBody(req);
  updates.updated_by = req.user!.id;

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase
    .from('assessment_attachment_translations')
    .update(updates)
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Translation already exists for this attachment + language', 409);
    return err(res, e.message, 500);
  }

  await clearCache(old.assessment_attachment_id);
  logAdmin({ actorId: req.user!.id, action: 'assessment_attachment_translation_updated', targetType: 'assessment_attachment_translation', targetId: id, targetName: `attachment_trans:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Assessment attachment translation updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('assessment_attachment_translations').select('assessment_attachment_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Assessment attachment translation not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from('assessment_attachment_translations')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.assessment_attachment_id);
  logAdmin({ actorId: req.user!.id, action: 'assessment_attachment_translation_soft_deleted', targetType: 'assessment_attachment_translation', targetId: id, targetName: `attachment_trans:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('assessment_attachment_translations').select('assessment_attachment_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Assessment attachment translation not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase
    .from('assessment_attachment_translations')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.assessment_attachment_id);
  logAdmin({ actorId: req.user!.id, action: 'assessment_attachment_translation_restored', targetType: 'assessment_attachment_translation', targetId: id, targetName: `attachment_trans:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('assessment_attachment_translations').select('assessment_attachment_id').eq('id', id).single();
  if (!old) return err(res, 'Assessment attachment translation not found', 404);

  const { error: e } = await supabase.from('assessment_attachment_translations').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.assessment_attachment_id);
  logAdmin({ actorId: req.user!.id, action: 'assessment_attachment_translation_deleted', targetType: 'assessment_attachment_translation', targetId: id, targetName: `attachment_trans:${id}`, ip: getClientIp(req) });
  return ok(res, null, 'Permanently deleted');
}
