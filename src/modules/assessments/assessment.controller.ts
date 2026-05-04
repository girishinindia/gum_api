import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin, logData } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp, generateUniqueSlug } from '../../utils/helpers';

const CACHE_KEY = 'assessments:all';
const clearCache = async (scopeId?: number, scopeType?: string) => {
  await redis.del(CACHE_KEY);
  if (scopeId && scopeType) await redis.del(`assessments:${scopeType}:${scopeId}`);
};

function parseMultipartBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.is_mandatory === 'string') body.is_mandatory = body.is_mandatory === 'true';
  if (typeof body.display_order === 'string') body.display_order = parseInt(body.display_order) || 0;
  if (typeof body.points === 'string') body.points = parseInt(body.points) || 0;
  if (typeof body.due_days === 'string') body.due_days = parseInt(body.due_days) || null;
  if (typeof body.estimated_hours === 'string') body.estimated_hours = parseFloat(body.estimated_hours) || null;
  if (typeof body.sub_topic_id === 'string') body.sub_topic_id = body.sub_topic_id === '' || body.sub_topic_id === 'null' ? null : parseInt(body.sub_topic_id) || null;
  if (typeof body.topic_id === 'string') body.topic_id = body.topic_id === '' || body.topic_id === 'null' ? null : parseInt(body.topic_id) || null;
  if (typeof body.chapter_id === 'string') body.chapter_id = body.chapter_id === '' || body.chapter_id === 'null' ? null : parseInt(body.chapter_id) || null;
  if (typeof body.course_id === 'string') body.course_id = body.course_id === '' || body.course_id === 'null' ? null : parseInt(body.course_id) || null;
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

const FK_SELECT = `*,
  sub_topics(id, slug),
  topics(id, slug, chapter_id),
  chapters(id, slug, subject_id),
  courses(id, slug)`;

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'display_order' });

  let q = supabase.from('assessments').select(FK_SELECT, { count: 'exact' });

  // Search
  if (search) q = q.ilike('slug', `%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Type filter
  if (req.query.assessment_type) q = q.eq('assessment_type', req.query.assessment_type as string);

  // Scope filters (cascade)
  if (req.query.sub_topic_id) q = q.eq('sub_topic_id', parseInt(req.query.sub_topic_id as string));
  else if (req.query.topic_id) q = q.eq('topic_id', parseInt(req.query.topic_id as string));
  else if (req.query.chapter_id) q = q.eq('chapter_id', parseInt(req.query.chapter_id as string));
  else if (req.query.course_id) q = q.eq('course_id', parseInt(req.query.course_id as string));

  // Difficulty filter
  if (req.query.difficulty_level) q = q.eq('difficulty_level', req.query.difficulty_level as string);

  // Active filter
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);

  // Enrich with English translation title
  const ids = (data || []).map((a: any) => a.id);
  let titleMap: Record<number, string> = {};
  if (ids.length > 0) {
    const { data: enLang } = await supabase.from('languages').select('id').eq('iso_code', 'en').single();
    if (enLang) {
      const { data: enTrans } = await supabase
        .from('assessment_translations')
        .select('assessment_id, title')
        .in('assessment_id', ids)
        .eq('language_id', enLang.id)
        .is('deleted_at', null);
      if (enTrans) {
        for (const t of enTrans) titleMap[t.assessment_id] = t.title;
      }
    }
  }

  // Enrich with counts
  let attachmentCountMap: Record<number, number> = {};
  let solutionCountMap: Record<number, number> = {};
  if (ids.length > 0) {
    const { data: attCounts } = await supabase
      .from('assessment_attachments')
      .select('assessment_id')
      .in('assessment_id', ids)
      .is('deleted_at', null);
    if (attCounts) {
      for (const a of attCounts) attachmentCountMap[a.assessment_id] = (attachmentCountMap[a.assessment_id] || 0) + 1;
    }
    const { data: solCounts } = await supabase
      .from('assessment_solutions')
      .select('assessment_id')
      .in('assessment_id', ids)
      .is('deleted_at', null);
    if (solCounts) {
      for (const s of solCounts) solutionCountMap[s.assessment_id] = (solutionCountMap[s.assessment_id] || 0) + 1;
    }
  }

  const enriched = (data || []).map((a: any) => ({
    ...a,
    english_title: titleMap[a.id] || null,
    attachment_count: attachmentCountMap[a.id] || 0,
    solution_count: solutionCountMap[a.id] || 0,
  }));

  return paginated(res, enriched, count || 0, page, limit);
}

export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase
    .from('assessments')
    .select(FK_SELECT)
    .eq('id', req.params.id)
    .single();
  if (e || !data) return err(res, 'Assessment not found', 404);
  return ok(res, data);
}

export async function create(req: Request, res: Response) {
  const body = parseMultipartBody(req);

  if (body.is_active === false && !hasPermission(req, 'assessment', 'activate')) {
    return err(res, 'Permission denied: assessment:activate required to create inactive', 403);
  }

  // Validate type-scope-FK consistency
  const typeErr = validateTypeScope(body);
  if (typeErr) return err(res, typeErr, 400);

  // Verify FK exists
  const fkErr = await verifyForeignKey(body);
  if (fkErr) return err(res, fkErr, 404);

  // Set audit field
  body.created_by = req.user!.id;

  // Auto-generate slug
  const slugSource = body.slug || body.title || `${body.assessment_type}-${Date.now()}`;
  body.slug = await generateUniqueSlug(supabase, 'assessments', slugSource);

  const { data, error: e } = await supabase
    .from('assessments')
    .insert(body)
    .select(FK_SELECT)
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Assessment slug already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache(getScopeId(body), body.assessment_scope);
  logAdmin({ actorId: req.user!.id, action: 'assessment_created', targetType: 'assessment', targetId: data.id, targetName: data.slug, ip: getClientIp(req) });
  return ok(res, data, 'Assessment created', 201);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('assessments').select('*').eq('id', id).single();
  if (!old) return err(res, 'Assessment not found', 404);

  const updates = parseMultipartBody(req);

  if ('is_active' in updates && updates.is_active !== old.is_active) {
    if (!hasPermission(req, 'assessment', 'activate')) {
      return err(res, 'Permission denied: assessment:activate required to change active status', 403);
    }
  }

  // If type/scope changed, validate consistency
  if (updates.assessment_type || updates.assessment_scope) {
    const merged = { ...old, ...updates };
    const typeErr = validateTypeScope(merged);
    if (typeErr) return err(res, typeErr, 400);
  }

  // If FK changed, verify it exists
  if (updates.sub_topic_id || updates.topic_id || updates.chapter_id || updates.course_id) {
    const merged = { ...old, ...updates };
    const fkErr = await verifyForeignKey(merged);
    if (fkErr) return err(res, fkErr, 404);
  }

  updates.updated_by = req.user!.id;

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const { data, error: e } = await supabase
    .from('assessments')
    .update(updates)
    .eq('id', id)
    .select(FK_SELECT)
    .single();
  if (e) {
    if (e.code === '23505') return err(res, 'Assessment slug already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (k === 'updated_by') continue;
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache(getScopeId(old), old.assessment_scope);
  if (updates.assessment_scope && updates.assessment_scope !== old.assessment_scope) {
    await clearCache(getScopeId(updates), updates.assessment_scope);
  }

  logAdmin({ actorId: req.user!.id, action: 'assessment_updated', targetType: 'assessment', targetId: id, targetName: data.slug, changes, ip: getClientIp(req) });
  return ok(res, data, 'Assessment updated');
}

export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('assessments').select('slug, assessment_scope, sub_topic_id, topic_id, chapter_id, course_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Assessment not found', 404);
  if (old.deleted_at) return err(res, 'Assessment is already in trash', 400);

  const now = new Date().toISOString();

  const { data, error: e } = await supabase
    .from('assessments')
    .update({ deleted_at: now, is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  // Cascade soft-delete to translations, attachments, solutions
  await supabase.from('assessment_translations').update({ deleted_at: now, is_active: false }).eq('assessment_id', id).is('deleted_at', null);
  await supabase.from('assessment_attachments').update({ deleted_at: now, is_active: false }).eq('assessment_id', id).is('deleted_at', null);
  await supabase.from('assessment_solutions').update({ deleted_at: now, is_active: false }).eq('assessment_id', id).is('deleted_at', null);

  await clearCache(getScopeId(old), old.assessment_scope);
  logAdmin({ actorId: req.user!.id, action: 'assessment_soft_deleted', targetType: 'assessment', targetId: id, targetName: old.slug, ip: getClientIp(req) });
  return ok(res, data, 'Assessment moved to trash');
}

export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('assessments').select('slug, assessment_scope, sub_topic_id, topic_id, chapter_id, course_id, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Assessment not found', 404);
  if (!old.deleted_at) return err(res, 'Assessment is not in trash', 400);

  const { data, error: e } = await supabase
    .from('assessments')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (e) return err(res, e.message, 500);

  // Cascade restore
  await supabase.from('assessment_translations').update({ deleted_at: null, is_active: true }).eq('assessment_id', id).not('deleted_at', 'is', null);
  await supabase.from('assessment_attachments').update({ deleted_at: null, is_active: true }).eq('assessment_id', id).not('deleted_at', 'is', null);
  await supabase.from('assessment_solutions').update({ deleted_at: null, is_active: true }).eq('assessment_id', id).not('deleted_at', 'is', null);

  await clearCache(getScopeId(old), old.assessment_scope);
  logAdmin({ actorId: req.user!.id, action: 'assessment_restored', targetType: 'assessment', targetId: id, targetName: old.slug, ip: getClientIp(req) });
  return ok(res, data, 'Assessment restored');
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('assessments').select('slug, assessment_scope, sub_topic_id, topic_id, chapter_id, course_id').eq('id', id).single();
  if (!old) return err(res, 'Assessment not found', 404);

  // Delete children first (FK constraint order)
  // Solution translations → solutions → attachment translations → attachments → assessment translations → assessment
  const { data: solutions } = await supabase.from('assessment_solutions').select('id').eq('assessment_id', id);
  if (solutions && solutions.length > 0) {
    const solIds = solutions.map((s: any) => s.id);
    await supabase.from('assessment_solution_translations').delete().in('assessment_solution_id', solIds);
    await supabase.from('assessment_solutions').delete().eq('assessment_id', id);
  }

  const { data: attachments } = await supabase.from('assessment_attachments').select('id').eq('assessment_id', id);
  if (attachments && attachments.length > 0) {
    const attIds = attachments.map((a: any) => a.id);
    await supabase.from('assessment_attachment_translations').delete().in('assessment_attachment_id', attIds);
    await supabase.from('assessment_attachments').delete().eq('assessment_id', id);
  }

  await supabase.from('assessment_translations').delete().eq('assessment_id', id);

  const { error: e } = await supabase.from('assessments').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache(getScopeId(old), old.assessment_scope);
  logAdmin({ actorId: req.user!.id, action: 'assessment_deleted', targetType: 'assessment', targetId: id, targetName: old.slug, ip: getClientIp(req) });
  return ok(res, null, 'Assessment permanently deleted');
}

// ── Helpers ──

function getScopeId(row: any): number | undefined {
  return row.sub_topic_id || row.topic_id || row.chapter_id || row.course_id;
}

function validateTypeScope(body: any): string | null {
  const type = body.assessment_type;
  const scope = body.assessment_scope;

  if (!type || !scope) return null; // let DB constraint handle

  const validMap: Record<string, string> = {
    exercise: 'sub_topic',
    assignment: 'topic',
    mini_project: 'chapter',
    capstone_project: 'course',
  };

  if (validMap[type] && validMap[type] !== scope) {
    return `assessment_type '${type}' requires assessment_scope '${validMap[type]}', got '${scope}'`;
  }

  // Validate FK matches scope
  const fkMap: Record<string, string> = {
    sub_topic: 'sub_topic_id',
    topic: 'topic_id',
    chapter: 'chapter_id',
    course: 'course_id',
  };

  const requiredFk = fkMap[scope];
  if (requiredFk && !body[requiredFk]) {
    return `assessment_scope '${scope}' requires ${requiredFk} to be set`;
  }

  return null;
}

async function verifyForeignKey(body: any): Promise<string | null> {
  if (body.sub_topic_id) {
    const { data } = await supabase.from('sub_topics').select('id').eq('id', body.sub_topic_id).single();
    if (!data) return 'Sub-topic not found';
  }
  if (body.topic_id) {
    const { data } = await supabase.from('topics').select('id').eq('id', body.topic_id).single();
    if (!data) return 'Topic not found';
  }
  if (body.chapter_id) {
    const { data } = await supabase.from('chapters').select('id').eq('id', body.chapter_id).single();
    if (!data) return 'Chapter not found';
  }
  if (body.course_id) {
    const { data } = await supabase.from('courses').select('id').eq('id', body.course_id).single();
    if (!data) return 'Course not found';
  }
  return null;
}
