import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { config } from '../../config';
import { hasPermission } from '../../middleware/rbac';
import { processAndUploadImage, deleteImage, uploadRawFile } from '../../services/storage.service';
import { logAdmin, logData } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { generateUniqueSlug } from '../../utils/helpers';

const CACHE_KEY = 'certificate_templates:all';
const clearCache = () => redis.del(CACHE_KEY);

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.min_score === 'string') body.min_score = body.min_score === '' ? null : parseFloat(body.min_score);
  if (typeof body.min_progress_pct === 'string') body.min_progress_pct = body.min_progress_pct === '' ? null : parseFloat(body.min_progress_pct);
  if (typeof body.course_id === 'string') body.course_id = body.course_id === '' ? null : parseInt(body.course_id);
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// ── LIST ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from('certificate_templates').select('*', { count: 'exact' });

  if (search) q = q.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);
  if (req.query.course_id) q = q.eq('course_id', parseInt(req.query.course_id as string));
  if (req.query.template_type) q = q.eq('template_type', req.query.template_type as string);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Enrich with course name
  const courseIds = [...new Set((data || []).map((t: any) => t.course_id).filter(Boolean))];
  let courseMap: Record<number, string> = {};
  if (courseIds.length > 0) {
    const { data: courses } = await supabase.from('courses').select('id, name').in('id', courseIds);
    if (courses) for (const c of courses) courseMap[c.id] = c.name;
  }

  const enriched = (data || []).map((t: any) => ({
    ...t,
    course_name: t.course_id ? courseMap[t.course_id] || null : null,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

// ── GET BY ID ──
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('certificate_templates').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Certificate template not found', 404);

  // Enrich with course name
  if (data.course_id) {
    const { data: course } = await supabase.from('courses').select('name').eq('id', data.course_id).single();
    (data as any).course_name = course?.name || null;
  }

  return ok(res, data);
}

// ── CREATE ──
export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  if (body.is_active === false && !hasPermission(req, 'certificate_template', 'activate')) {
    return err(res, 'Permission denied: certificate_template:activate required to create inactive', 403);
  }

  // Auto-generate slug
  if (body.name && !body.slug) {
    body.slug = await generateUniqueSlug(supabase, 'certificate_templates', body.name);
  }

  body.created_by = req.user!.id;

  // Handle image uploads (multer.fields)
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  const imageFields: { field: string; dbCol: string; folder: string; width: number; height: number }[] = [
    { field: 'background_image', dbCol: 'background_image_url', folder: 'certificate-templates/backgrounds', width: 1200, height: 850 },
    { field: 'logo', dbCol: 'logo_url', folder: 'certificate-templates/logos', width: 300, height: 300 },
    { field: 'signature', dbCol: 'signature_url', folder: 'certificate-templates/signatures', width: 400, height: 200 },
  ];

  const uploadedUrls: string[] = [];
  try {
    if (files) {
      for (const img of imageFields) {
        const fileArr = files[img.field];
        if (fileArr && fileArr[0]) {
          const slug = (body.slug || 'cert').slice(0, 40);
          const path = `${img.folder}/${slug}-${Date.now()}.webp`;
          const url = await processAndUploadImage(fileArr[0].buffer, path, { width: img.width, height: img.height, quality: 85 });
          body[img.dbCol] = url;
          uploadedUrls.push(url);
        }
      }
    }

    // Handle template_html file upload
    if (files && files['template_html_file'] && files['template_html_file'][0]) {
      const htmlFile = files['template_html_file'][0];
      const slug = (body.slug || 'cert').slice(0, 40);
      const path = `certificate-templates/html/${slug}-${Date.now()}.html`;
      const url = await uploadRawFile(htmlFile.buffer, path);
      body.template_html = url;
      uploadedUrls.push(url);
    }

    const { data, error: e } = await supabase.from('certificate_templates').insert(body).select().single();
    if (e) {
      // Cleanup uploaded images on failure
      for (const url of uploadedUrls) {
        try { await deleteImage(extractBunnyPath(url), url); } catch {}
      }
      if (e.code === '23505') return err(res, 'Certificate template slug already exists', 409);
      return err(res, e.message, 500);
    }

    await clearCache();
    logAdmin({ actorId: req.user!.id, action: 'certificate_template_created', targetType: 'certificate_template', targetId: data.id, targetName: data.name, ip: getClientIp(req) });
    if (uploadedUrls.length > 0) logData({ actorId: req.user!.id, action: 'media_uploaded', resourceType: 'certificate_template', resourceId: data.id, resourceName: data.name, ip: getClientIp(req), metadata: { type: 'certificate_template_assets' } });
    return ok(res, data, 'Certificate template created', 201);
  } catch (uploadErr: any) {
    for (const url of uploadedUrls) {
      try { await deleteImage(extractBunnyPath(url), url); } catch {}
    }
    return err(res, uploadErr.message || 'Upload failed', 500);
  }
}

// ── UPDATE ──
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('certificate_templates').select('*').eq('id', id).single();
  if (!old) return err(res, 'Certificate template not found', 404);

  const updates = parseMultipartBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'certificate_template', 'activate')) {
      return err(res, 'Permission denied: certificate_template:activate required to change active status', 403);
    }
  }

  updates.updated_by = req.user!.id;

  // Handle image uploads
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  const imageFields = [
    { field: 'background_image', dbCol: 'background_image_url', folder: 'certificate-templates/backgrounds', width: 1200, height: 850 },
    { field: 'logo', dbCol: 'logo_url', folder: 'certificate-templates/logos', width: 300, height: 300 },
    { field: 'signature', dbCol: 'signature_url', folder: 'certificate-templates/signatures', width: 400, height: 200 },
  ];

  if (files) {
    for (const img of imageFields) {
      const fileArr = files[img.field];
      if (fileArr && fileArr[0]) {
        const slug = (updates.slug || old.slug || 'cert').slice(0, 40);
        const path = `${img.folder}/${slug}-${Date.now()}.webp`;
        updates[img.dbCol] = await processAndUploadImage(fileArr[0].buffer, path, { width: img.width, height: img.height, quality: 85 });
        if (old[img.dbCol]) { try { await deleteImage(extractBunnyPath(old[img.dbCol]), old[img.dbCol]); } catch {} }
      }
    }

    // Handle template_html file upload
    if (files['template_html_file'] && files['template_html_file'][0]) {
      const htmlFile = files['template_html_file'][0];
      const slug = (updates.slug || old.slug || 'cert').slice(0, 40);
      const path = `certificate-templates/html/${slug}-${Date.now()}.html`;
      updates.template_html = await uploadRawFile(htmlFile.buffer, path);
      if (old.template_html && old.template_html.startsWith('http')) {
        try { await deleteImage(extractBunnyPath(old.template_html), old.template_html); } catch {}
      }
    }
  }

  if (Object.keys(updates).filter(k => k !== 'updated_by').length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase.from('certificate_templates').update(updates).eq('id', id).select().single();
  if (e) {
    if (e.code === '23505') return err(res, 'Certificate template slug already exists', 409);
    return err(res, e.message, 500);
  }

  // Compute changes for audit log
  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'updated_by') continue;
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'certificate_template_updated', targetType: 'certificate_template', targetId: id, targetName: data.name, changes, ip: getClientIp(req) });
  return ok(res, data, 'Certificate template updated');
}

// ── SOFT DELETE ──
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('certificate_templates').select('name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Certificate template not found', 404);
  if (old.deleted_at) return err(res, 'Certificate template is already in trash', 400);

  const now = new Date().toISOString();
  const { data, error: e } = await supabase
    .from('certificate_templates')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'certificate_template_soft_deleted', targetType: 'certificate_template', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Certificate template moved to trash');
}

// ── RESTORE ──
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('certificate_templates').select('name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Certificate template not found', 404);
  if (!old.deleted_at) return err(res, 'Certificate template is not in trash', 400);

  const { data, error: e } = await supabase
    .from('certificate_templates')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'certificate_template_restored', targetType: 'certificate_template', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Certificate template restored');
}

// ── PERMANENT DELETE ──
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('certificate_templates').select('*').eq('id', id).single();
  if (!old) return err(res, 'Certificate template not found', 404);

  // Check if any certificates have been issued with this template
  const { count } = await supabase.from('issued_certificates').select('id', { count: 'exact', head: true }).eq('template_id', id);
  if (count && count > 0) {
    return err(res, `Cannot delete: ${count} certificate(s) have been issued with this template. Revoke them first or use soft delete.`, 400);
  }

  // Delete CDN assets
  const cdnFields = ['background_image_url', 'logo_url', 'signature_url'];
  for (const field of cdnFields) {
    if (old[field]) { try { await deleteImage(extractBunnyPath(old[field]), old[field]); } catch {} }
  }
  if (old.template_html && old.template_html.startsWith('http')) {
    try { await deleteImage(extractBunnyPath(old.template_html), old.template_html); } catch {}
  }

  const { error: e } = await supabase.from('certificate_templates').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'certificate_template_deleted', targetType: 'certificate_template', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, null, 'Certificate template permanently deleted');
}
