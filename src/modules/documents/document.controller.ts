import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { processAndUploadImage, deleteImage } from '../../services/storage.service';
import { logAdmin, logData } from '../../services/activityLog.service';
import { ok, err } from '../../utils/response';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'documents:all';
const clearCache = () => redis.del(CACHE_KEY);

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.sort_order === 'string') body.sort_order = parseInt(body.sort_order) || 0;
  if (typeof body.document_type_id === 'string') body.document_type_id = parseInt(body.document_type_id) || 0;
  for (const k of Object.keys(body)) {
    if (body[k] === '') { if (k === 'description') body[k] = null; else delete body[k]; }
  }
  return body;
}

// GET /documents?document_type_id=1
export async function list(req: Request, res: Response) {
  const typeId = req.query.document_type_id ? parseInt(req.query.document_type_id as string) : null;
  const cacheKey = typeId ? `documents:type:${typeId}` : CACHE_KEY;

  const cached = await redis.get(cacheKey);
  if (cached) return ok(res, JSON.parse(cached));

  let query = supabase.from('documents').select('*, document_types(name)').order('sort_order').order('name');
  if (typeId) query = query.eq('document_type_id', typeId);

  const { data, error: e } = await query;
  if (e) return err(res, e.message, 500);

  await redis.set(cacheKey, JSON.stringify(data), 'EX', config.redis.cacheTtl);
  return ok(res, data);
}

// GET /documents/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('documents').select('*, document_types(name)').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Document not found', 404);
  return ok(res, data);
}

// POST /documents
export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  if (body.is_active === false && !hasPermission(req, 'document', 'activate')) {
    return err(res, 'Permission denied: document:activate required to create inactive document', 403);
  }

  // Verify document type exists
  const { data: docType } = await supabase.from('document_types').select('id').eq('id', body.document_type_id).single();
  if (!docType) return err(res, 'Document type not found', 404);

  // File upload
  let fileUrl: string | null = null;
  if (req.file) {
    const slug = (body.name || 'doc').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `documents/${slug}-${Date.now()}.webp`;
    fileUrl = await processAndUploadImage(req.file.buffer, path, { width: 800, height: 800, quality: 85 });
    body.file_url = fileUrl;
  }

  const { data, error: e } = await supabase.from('documents').insert(body).select('*, document_types(name)').single();
  if (e) {
    if (fileUrl) { try { await deleteImage(extractBunnyPath(fileUrl), fileUrl); } catch {} }
    if (e.code === '23505') return err(res, 'Document name already exists in this type', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  await redis.del(`documents:type:${body.document_type_id}`);

  logAdmin({ actorId: req.user!.id, action: 'document_created', targetType: 'document', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
  if (fileUrl) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'document', resourceId: data.id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'document_file' } });
  return ok(res, data, 'Document created', 201);
}

// PATCH /documents/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('documents').select('*').eq('id', id).single();
  if (!old) return err(res, 'Document not found', 404);

  const updates = parseMultipartBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'document', 'activate')) {
      return err(res, 'Permission denied: document:activate required to change active status', 403);
    }
  }

  // If changing type, verify it exists
  if (updates.document_type_id && updates.document_type_id !== old.document_type_id) {
    const { data: docType } = await supabase.from('document_types').select('id').eq('id', updates.document_type_id).single();
    if (!docType) return err(res, 'Document type not found', 404);
  }

  // File upload — unique path so CDN cache never serves stale images
  if (req.file) {
    const slug = (updates.name || old.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const path = `documents/${slug}-${Date.now()}.webp`;
    updates.file_url = await processAndUploadImage(req.file.buffer, path, { width: 800, height: 800, quality: 85 });
    // Delete old AFTER new is uploaded
    if (old.file_url) { try { await deleteImage(extractBunnyPath(old.file_url), old.file_url); } catch {} }
  }

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('documents').update(updates).eq('id', id).select('*, document_types(name)').single();
  if (e) {
    if (e.code === '23505') return err(res, 'Document name already exists in this type', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'file_url') {
      changes.file_url = { old: old.file_url || null, new: updates.file_url };
    } else if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache();
  await redis.del(`documents:type:${old.document_type_id}`);
  if (updates.document_type_id && updates.document_type_id !== old.document_type_id) {
    await redis.del(`documents:type:${updates.document_type_id}`);
  }

  logAdmin({ actorId: req.user!.id, action: 'document_updated', targetType: 'document', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  if (req.file) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'document', resourceId: id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'document_file', old_url: old.file_url } });

  return ok(res, data, 'Document updated');
}

// DELETE /documents/:id
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('documents').select('name, file_url, document_type_id').eq('id', id).single();
  if (!old) return err(res, 'Document not found', 404);

  if (old.file_url) { try { await deleteImage(extractBunnyPath(old.file_url), old.file_url); } catch {} }

  const { error: e } = await supabase.from('documents').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  await redis.del(`documents:type:${old.document_type_id}`);

  logAdmin({ actorId: req.user!.id, action: 'document_deleted', targetType: 'document', targetId: id, targetName: old.name, ip: getClientIp(req) });
  if (old.file_url) logData({ actorId: req.user!.id, action: 'media_deleted', resourceType: 'document', resourceId: id, resourceName: old.name, ip: getClientIp(req) });

  return ok(res, null, 'Document deleted');
}
