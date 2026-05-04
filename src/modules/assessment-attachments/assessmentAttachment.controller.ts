import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'assessment_attachments:all';
const clearCache = async (assessmentId?: number) => {
  await redis.del(CACHE_KEY);
  if (assessmentId) await redis.del(`assessment_attachments:assessment:${assessmentId}`);
};

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.assessment_id === 'string') body.assessment_id = parseInt(body.assessment_id) || 0;
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  if (typeof body.file_size_bytes === 'string') body.file_size_bytes = parseInt(body.file_size_bytes) || null;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = '*, assessments(slug, assessment_type)';

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from('assessment_attachments').select(FK_SELECT, { count: 'exact' });

  if (search) q = q.or(`file_name.ilike.%${search}%,file_url.ilike.%${search}%`);
  if (req.query.assessment_id) q = q.eq('assessment_id', parseInt(req.query.assessment_id as string));
  if (req.query.attachment_type) q = q.eq('attachment_type', req.query.attachment_type as string);
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
  const { data, error: e } = await supabase.from('assessment_attachments').select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Assessment attachment not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  // Verify assessment exists
  const { data: assessment } = await supabase.from('assessments').select('id, slug').eq('id', body.assessment_id).single();
  if (!assessment) return err(res, 'Assessment not found', 404);

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase
    .from('assessment_attachments')
    .insert(body)
    .select(FK_SELECT)
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(body.assessment_id);
  logAdmin({ actorId: req.user!.id, action: 'assessment_attachment_created', targetType: 'assessment_attachment', targetId: data.id, targetName: body.file_name || assessment.slug, ip: getClientIp(req) });
  return ok(res, data, 'Assessment attachment created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('assessment_attachments').select('*').eq('id', id).single();
  if (!old) return err(res, 'Assessment attachment not found', 404);

  const updates = parseMultipartBody(req);
  updates.updated_by = req.user!.id;

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase
    .from('assessment_attachments')
    .update(updates)
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) return err(res, e.message, 500);

  await clearCache(old.assessment_id);
  logAdmin({ actorId: req.user!.id, action: 'assessment_attachment_updated', targetType: 'assessment_attachment', targetId: id, targetName: data.file_name || `attachment:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Assessment attachment updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('assessment_attachments').select('assessment_id, file_name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Assessment attachment not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from('assessment_attachments')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  // Cascade to attachment translations
  await supabase.from('assessment_attachment_translations').update({ deleted_at: now, is_active: false }).eq('assessment_attachment_id', id).is('deleted_at', null);

  await clearCache(old.assessment_id);
  logAdmin({ actorId: req.user!.id, action: 'assessment_attachment_soft_deleted', targetType: 'assessment_attachment', targetId: id, targetName: old.file_name || `attachment:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Assessment attachment moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('assessment_attachments').select('assessment_id, file_name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Assessment attachment not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase
    .from('assessment_attachments')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  await supabase.from('assessment_attachment_translations').update({ deleted_at: null, is_active: true }).eq('assessment_attachment_id', id).not('deleted_at', 'is', null);

  await clearCache(old.assessment_id);
  logAdmin({ actorId: req.user!.id, action: 'assessment_attachment_restored', targetType: 'assessment_attachment', targetId: id, targetName: old.file_name || `attachment:${id}`, ip: getClientIp(req) });
  return ok(res, data, 'Assessment attachment restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('assessment_attachments').select('assessment_id, file_name').eq('id', id).single();
  if (!old) return err(res, 'Assessment attachment not found', 404);

  // Delete translations first
  await supabase.from('assessment_attachment_translations').delete().eq('assessment_attachment_id', id);
  const { error: e } = await supabase.from('assessment_attachments').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(old.assessment_id);
  logAdmin({ actorId: req.user!.id, action: 'assessment_attachment_deleted', targetType: 'assessment_attachment', targetId: id, targetName: old.file_name || `attachment:${id}`, ip: getClientIp(req) });
  return ok(res, null, 'Assessment attachment permanently deleted');
}
