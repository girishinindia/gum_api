import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { config } from '../../config';
import { processAndUploadImage, uploadRawFile, deleteImage } from '../../services/storage.service';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { createUserDocumentSchema, updateUserDocumentSchema } from './userDocument.schema';

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

const SELECT_WITH_JOINS = `
  *,
  document_type:document_types(id, name),
  document:documents(id, name),
  user:users!user_documents_user_id_fkey(id, full_name, email),
  verifier:users!user_documents_verified_by_fkey(id, full_name)
`;

// ══════════════ Admin Endpoints ══════════════

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'id' });
  let q = supabase.from('user_documents').select(SELECT_WITH_JOINS, { count: 'exact' });
  if (req.query.show_deleted === 'true') q = q.not('deleted_at', 'is', null);
  else q = q.is('deleted_at', null);
  if (req.query.user_id) q = q.eq('user_id', Number(req.query.user_id));
  if (req.query.document_type_id) q = q.eq('document_type_id', Number(req.query.document_type_id));
  if (req.query.document_id) q = q.eq('document_id', Number(req.query.document_id));
  if (req.query.verification_status) q = q.eq('verification_status', req.query.verification_status);
  if (search) q = q.or(`document_number.ilike.%${search}%`);
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);
  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('user_documents').select(SELECT_WITH_JOINS).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Record not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body: any = { ...req.body };
  // Handle file upload — images get optimised, PDFs go raw
  if (req.file) {
    const isImage = req.file.mimetype.startsWith('image/');
    const ext = isImage ? 'webp' : (req.file.originalname.split('.').pop() || 'pdf');
    const path = `documents/user-${body.user_id}-doc-${Date.now()}.${ext}`;
    body.file = isImage
      ? await processAndUploadImage(req.file.buffer, path, { width: 1200, height: 1600, quality: 85 })
      : await uploadRawFile(req.file.buffer, path);
  }
  const parsed = createUserDocumentSchema.safeParse(body);
  if (!parsed.success) return err(res, parsed.error.errors.map(e => e.message).join(', '), 400);
  const payload: any = { ...parsed.data, created_by: req.user!.id };
  const { data, error: e } = await supabase.from('user_documents').insert(payload).select(SELECT_WITH_JOINS).single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'user_document_created', targetType: 'user_document', targetId: data.id, targetName: data.document_number || String(data.id), ip: getClientIp(req) });
  return ok(res, data, 'Document uploaded', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_documents').select('*').eq('id', id).single();
  if (!old) return err(res, 'Record not found', 404);
  const body: any = { ...req.body };
  if (req.file) {
    if (old.file) { try { await deleteImage(extractBunnyPath(old.file)); } catch {} }
    const isImage = req.file.mimetype.startsWith('image/');
    const ext = isImage ? 'webp' : (req.file.originalname.split('.').pop() || 'pdf');
    const path = `documents/user-${old.user_id}-doc-${id}-${Date.now()}.${ext}`;
    body.file = isImage
      ? await processAndUploadImage(req.file.buffer, path, { width: 1200, height: 1600, quality: 85 })
      : await uploadRawFile(req.file.buffer, path);
  }
  // Admin verification
  if (body.verification_status && body.verification_status !== old.verification_status) {
    if (['verified', 'rejected'].includes(body.verification_status)) {
      body.verified_by = req.user!.id;
      body.verified_at = new Date().toISOString();
    }
  }
  const parsed = updateUserDocumentSchema.safeParse(body);
  if (!parsed.success) return err(res, parsed.error.errors.map(e => e.message).join(', '), 400);
  const updates: any = { ...parsed.data, updated_by: req.user!.id };
  const { data, error: e } = await supabase.from('user_documents').update(updates).eq('id', id).select(SELECT_WITH_JOINS).single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'user_document_updated', targetType: 'user_document', targetId: id, targetName: data.document_number || String(id), ip: getClientIp(req) });
  return ok(res, data, 'Document updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_documents').select('id, document_number, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Record not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);
  const { error: e } = await supabase.from('user_documents').update({ deleted_at: new Date().toISOString(), deleted_by: req.user!.id }).eq('id', id);
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'user_document_soft_deleted', targetType: 'user_document', targetId: id, targetName: old.document_number || String(id), ip: getClientIp(req) });
  return ok(res, null, 'Moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_documents').select('id, document_number, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Record not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);
  const { error: e } = await supabase.from('user_documents').update({ deleted_at: null, deleted_by: null }).eq('id', id);
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'user_document_restored', targetType: 'user_document', targetId: id, targetName: old.document_number || String(id), ip: getClientIp(req) });
  return ok(res, null, 'Restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_documents').select('id, document_number, file').eq('id', id).single();
  if (!old) return err(res, 'Record not found', 404);
  if (old.file) { try { await deleteImage(extractBunnyPath(old.file)); } catch {} }
  const { error: e } = await supabase.from('user_documents').delete().eq('id', id);
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'user_document_deleted', targetType: 'user_document', targetId: id, targetName: old.document_number || String(id), ip: getClientIp(req) });
  return ok(res, null, 'Permanently deleted');
}

// ══════════════ Self-service "My" Endpoints ══════════════

export async function listMy(req: Request, res: Response) {
  const userId = req.user!.id;
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'id' });
  let q = supabase.from('user_documents').select(SELECT_WITH_JOINS, { count: 'exact' }).eq('user_id', userId);
  if (req.query.show_deleted === 'true') q = q.not('deleted_at', 'is', null);
  else q = q.is('deleted_at', null);
  if (req.query.document_type_id) q = q.eq('document_type_id', Number(req.query.document_type_id));
  if (req.query.document_id) q = q.eq('document_id', Number(req.query.document_id));
  if (search) q = q.or(`document_number.ilike.%${search}%`);
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);
  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getMyById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('user_documents').select(SELECT_WITH_JOINS).eq('id', req.params.id).eq('user_id', req.user!.id).single();
  if (e || !data) return err(res, 'Record not found', 404);
  return ok(res, data);
}

export async function createMy(req: Request, res: Response) {
  const userId = req.user!.id;
  const body: any = { ...req.body, user_id: userId };
  if (req.file) {
    const isImage = req.file.mimetype.startsWith('image/');
    const ext = isImage ? 'webp' : (req.file.originalname.split('.').pop() || 'pdf');
    const path = `documents/user-${userId}-doc-${Date.now()}.${ext}`;
    body.file = isImage
      ? await processAndUploadImage(req.file.buffer, path, { width: 1200, height: 1600, quality: 85 })
      : await uploadRawFile(req.file.buffer, path);
  }
  const parsed = createUserDocumentSchema.safeParse(body);
  if (!parsed.success) return err(res, parsed.error.errors.map(e => e.message).join(', '), 400);
  const payload: any = { ...parsed.data, user_id: userId, created_by: userId };
  const { data, error: e } = await supabase.from('user_documents').insert(payload).select(SELECT_WITH_JOINS).single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: userId, action: 'user_document_created', targetType: 'user_document', targetId: data.id, targetName: data.document_number || String(data.id), ip: getClientIp(req) });
  return ok(res, data, 'Document uploaded', 201);
}

export async function updateMy(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_documents').select('*').eq('id', id).eq('user_id', userId).single();
  if (!old) return err(res, 'Record not found', 404);
  const body: any = { ...req.body };
  if (req.file) {
    if (old.file) { try { await deleteImage(extractBunnyPath(old.file)); } catch {} }
    const isImage = req.file.mimetype.startsWith('image/');
    const ext = isImage ? 'webp' : (req.file.originalname.split('.').pop() || 'pdf');
    const path = `documents/user-${userId}-doc-${id}-${Date.now()}.${ext}`;
    body.file = isImage
      ? await processAndUploadImage(req.file.buffer, path, { width: 1200, height: 1600, quality: 85 })
      : await uploadRawFile(req.file.buffer, path);
  }
  // Self-service users cannot change verification_status
  delete body.verification_status;
  delete body.verified_by;
  delete body.verified_at;
  delete body.rejection_reason;
  delete body.admin_notes;
  const parsed = updateUserDocumentSchema.safeParse(body);
  if (!parsed.success) return err(res, parsed.error.errors.map(e => e.message).join(', '), 400);
  const updates: any = { ...parsed.data, updated_by: userId };
  const { data, error: e } = await supabase.from('user_documents').update(updates).eq('id', id).eq('user_id', userId).select(SELECT_WITH_JOINS).single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: userId, action: 'user_document_updated', targetType: 'user_document', targetId: id, targetName: data.document_number || String(id), ip: getClientIp(req) });
  return ok(res, data, 'Document updated');
}

export async function softDeleteMy(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_documents').select('id, document_number, deleted_at').eq('id', id).eq('user_id', userId).single();
  if (!old) return err(res, 'Record not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);
  const { error: e } = await supabase.from('user_documents').update({ deleted_at: new Date().toISOString(), deleted_by: userId }).eq('id', id).eq('user_id', userId);
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: userId, action: 'user_document_soft_deleted', targetType: 'user_document', targetId: id, targetName: old.document_number || String(id), ip: getClientIp(req) });
  return ok(res, null, 'Moved to trash');
}

export async function restoreMy(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_documents').select('id, document_number, deleted_at').eq('id', id).eq('user_id', userId).single();
  if (!old) return err(res, 'Record not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);
  const { error: e } = await supabase.from('user_documents').update({ deleted_at: null, deleted_by: null }).eq('id', id).eq('user_id', userId);
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: userId, action: 'user_document_restored', targetType: 'user_document', targetId: id, targetName: old.document_number || String(id), ip: getClientIp(req) });
  return ok(res, null, 'Restored');
}

export async function removeMy(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_documents').select('id, document_number, file').eq('id', id).eq('user_id', userId).single();
  if (!old) return err(res, 'Record not found', 404);
  if (old.file) { try { await deleteImage(extractBunnyPath(old.file)); } catch {} }
  const { error: e } = await supabase.from('user_documents').delete().eq('id', id).eq('user_id', userId);
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: userId, action: 'user_document_deleted', targetType: 'user_document', targetId: id, targetName: old.document_number || String(id), ip: getClientIp(req) });
  return ok(res, null, 'Permanently deleted');
}
