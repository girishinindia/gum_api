import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { toIntOrNull, toNumOrNull, toBool } from '../../utils/coerce';
import { processAndUploadImage, uploadRawFile, deleteImage } from '../../services/storage.service';
import { uploadVideoToStream, deleteVideoFromStream, extractBunnyVideoGuid } from '../../services/video.service';
import { signEmbedUrl } from '../../services/bunnyToken.service';
import { config } from '../../config';

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

// Phase 50 — physically remove Bunny assets (Stream videos + storage files) for
// the given URLs. Best-effort per item: a Bunny Stream embed → delete by guid;
// a CDN storage URL → delete the object. External (YouTube) URLs are ignored.
// Called only on PERMANENT delete (soft delete stays recoverable).
async function purgeBunnyForUrls(urls: (string | null | undefined)[]): Promise<void> {
  for (const url of urls) {
    if (!url) continue;
    const guid = extractBunnyVideoGuid(url);
    if (guid) { try { await deleteVideoFromStream(guid); } catch {} continue; }
    if (config.bunny.cdnUrl && url.startsWith(config.bunny.cdnUrl)) {
      try { await deleteImage(extractBunnyPath(url), url); } catch {}
    }
  }
}

// Collect a unit id plus all of its descendant unit ids (the cascade footprint).
function collectUnitSubtree(allUnits: any[], rootId: number): Set<number> {
  const ids = new Set<number>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const u of allUnits) {
      if (u.parent_unit_id != null && ids.has(u.parent_unit_id) && !ids.has(u.id)) { ids.add(u.id); grew = true; }
    }
  }
  return ids;
}

// Phase 49 — Instructor course authoring (draft layer). Four resources:
// courses, course_highlights, units (module/chapter/topic tree), faqs.
// Canonical course tables are NOT touched here — only by a future publish step.

function pick(body: any, keys: readonly string[]): any {
  const out: any = {};
  for (const k of keys) if (body[k] !== undefined) out[k] = body[k];
  return out;
}

// ───────────────────────── COURSES ─────────────────────────
const COURSE_COLS = ['instructor_id','title','subtitle','short_intro','long_intro','category_id','language_id','level','price','original_price','is_free','thumbnail_url','trailer_video','has_certificate','requires_verification'] as const;

function parseCourse(req: Request): any {
  const b = pick(req.body, COURSE_COLS);
  for (const k of ['instructor_id','category_id','language_id']) if (typeof b[k] === 'string') b[k] = toIntOrNull(b[k]);
  for (const k of ['price','original_price']) if (typeof b[k] === 'string') b[k] = toNumOrNull(b[k]);
  for (const k of ['is_free','has_certificate','requires_verification']) if (typeof b[k] === 'string') b[k] = toBool(b[k]);
  for (const k of Object.keys(b)) b[k] = nb(b[k]);
  return b;
}
const nb=(v:any)=>v===''?null:v;

// Phase 50 — basics validation (mirrors the validatePromotion guard pattern).
function validateCourseBasics(b: any, old: any = {}): string | null {
  const m = { ...old, ...b };
  if (b.title !== undefined && (!b.title || String(b.title).trim().length < 3)) return 'Title must be at least 3 characters';
  if (m.price != null && m.price < 0) return 'Price cannot be negative';
  if (m.original_price != null && m.original_price < 0) return 'Original price cannot be negative';
  if (m.original_price != null && m.price != null && m.original_price < m.price) return 'Original price must be greater than or equal to price';
  if (m.is_free === false && (m.price == null || m.price <= 0)) return 'A paid course needs a price greater than 0';
  return null;
}

export async function listCourses(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'id' });
  let q = supabase.from('authoring_courses').select('*', { count: 'exact' });
  if (search) q = q.ilike('title', `%${search}%`);
  if (req.query.show_deleted === 'true') q = q.not('deleted_at', 'is', null); else q = q.is('deleted_at', null);
  if (req.query.instructor_id) q = q.eq('instructor_id', parseInt(req.query.instructor_id as string));
  if (req.query.status) q = q.eq('status', req.query.status as string);
  // Non-super-admins only see their own drafts.
  if (!req.userPerms?.isSuperAdmin && req.user) q = q.eq('instructor_id', req.user.id);
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);
  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

export async function getCourse(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('authoring_courses').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Authoring course not found', 404);
  return ok(res, data);
}

export async function createCourse(req: Request, res: Response) {
  const body = parseCourse(req);
  const vErr = validateCourseBasics(body);
  if (vErr) return err(res, vErr, 400);
  if (!body.instructor_id) body.instructor_id = req.user!.id;
  body.created_by = req.user!.id;
  const { data, error: e } = await supabase.from('authoring_courses').insert(body).select().single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'authoring_course_created', targetType: 'authoring_course', targetId: data.id, targetName: data.title, ip: getClientIp(req) });
  return ok(res, data, 'Draft course created', 201);
}

export async function updateCourse(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('authoring_courses').select('*').eq('id', id).single();
  if (!old) return err(res, 'Authoring course not found', 404);
  const updates = parseCourse(req);
  const vErr = validateCourseBasics(updates, old);
  if (vErr) return err(res, vErr, 400);
  updates.updated_by = req.user!.id;
  const { data, error: e } = await supabase.from('authoring_courses').update(updates).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'authoring_course_updated', targetType: 'authoring_course', targetId: id, targetName: data.title, ip: getClientIp(req) });
  return ok(res, data, 'Draft course updated');
}

// Phase 50 — completeness checks. Returns the list of blocking problems.
function readinessProblems(course: any, units: any[], highlights: any[]): string[] {
  const p: string[] = [];
  if (!course.thumbnail_url) p.push('Add a course thumbnail');
  if (course.is_free === false && (course.price == null || course.price <= 0)) p.push('Set a price (or mark it free)');

  const modules = units.filter(u => u.unit_type === 'module');
  const topics = units.filter(u => u.unit_type === 'topic');
  if (modules.length === 0) p.push('Add at least one module');

  const chapterParent = new Map(units.filter(u => u.unit_type === 'chapter').map(c => [c.id, c.parent_unit_id]));
  const modulesWithTopic = new Set<number>();
  for (const t of topics) {
    if (t.parent_unit_id == null) continue;
    if (modules.some(m => m.id === t.parent_unit_id)) modulesWithTopic.add(t.parent_unit_id);
    else if (chapterParent.has(t.parent_unit_id)) modulesWithTopic.add(chapterParent.get(t.parent_unit_id) as number);
  }
  if (modules.some(m => !modulesWithTopic.has(m.id))) p.push('Every module needs at least one topic');

  for (const t of topics) {
    if (t.topic_type === 'video' && !t.video && !t.youtube_url) { p.push('A video topic has no video'); break; }
  }
  for (const t of topics) { if (t.topic_type === 'article' && !t.article_pdf) { p.push('An article topic has no PDF'); break; } }
  for (const t of topics) { if (t.topic_type === 'exercise' && !t.exercise_pdf) { p.push('An exercise topic has no PDF'); break; } }
  for (const t of topics) { if (t.topic_type === 'project' && !t.project_pdf) { p.push('A project topic has no brief PDF'); break; } }

  if (!highlights.some(h => h.kind === 'outcome')) p.push('Add at least one outcome (what students will learn)');
  return [...new Set(p)];
}

async function loadReadiness(id: number) {
  const { data: course } = await supabase.from('authoring_courses').select('*').eq('id', id).single();
  if (!course) return null;
  const { data: units } = await supabase.from('authoring_units')
    .select('id, unit_type, parent_unit_id, topic_type, video, youtube_url, article_pdf, exercise_pdf, project_pdf')
    .eq('authoring_course_id', id).is('deleted_at', null);
  const { data: highlights } = await supabase.from('authoring_course_highlights').select('id, kind').eq('authoring_course_id', id);
  const problems = readinessProblems(course, units || [], highlights || []);
  return { course, problems };
}

// GET /authoring/courses/:id/readiness — powers the live checklist + submit button
export async function getReadiness(req: Request, res: Response) {
  const r = await loadReadiness(parseInt(req.params.id));
  if (!r) return err(res, 'Authoring course not found', 404);
  return ok(res, { ready: r.problems.length === 0, problems: r.problems });
}

export async function submitCourse(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const r = await loadReadiness(id);
  if (!r) return err(res, 'Authoring course not found', 404);
  if (r.problems.length > 0) return err(res, 'Not ready to submit — ' + r.problems.join('; '), 400);
  const { data, error: e } = await supabase.from('authoring_courses')
    .update({ status: 'pending_approval', updated_by: req.user!.id }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'authoring_course_submitted', targetType: 'authoring_course', targetId: id, targetName: data?.title, ip: getClientIp(req) });
  return ok(res, data, 'Submitted for review');
}

// Super-admin verification gate — only verified drafts may go live.
export async function verifyCourse(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('authoring_courses').select('*').eq('id', id).single();
  if (!old) return err(res, 'Authoring course not found', 404);
  const now = new Date().toISOString();
  const { data, error: e } = await supabase.from('authoring_courses').update({
    status: 'published', verified_by: req.user!.id, verified_at: now, last_published_at: now, rejection_reason: null, updated_by: req.user!.id,
  }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'authoring_course_verified', targetType: 'authoring_course', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, 'Course verified & published');
}

export async function rejectCourse(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data, error: e } = await supabase.from('authoring_courses').update({
    status: 'rejected', rejection_reason: req.body.rejection_reason || null, verified_by: req.user!.id, verified_at: new Date().toISOString(), updated_by: req.user!.id,
  }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'authoring_course_rejected', targetType: 'authoring_course', targetId: id, targetName: data?.title, ip: getClientIp(req) });
  return ok(res, data, 'Course rejected');
}

export async function softDeleteCourse(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('authoring_courses').select('title, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Authoring course not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);
  const { data, error: e } = await supabase.from('authoring_courses').update({ deleted_at: new Date().toISOString() }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'authoring_course_soft_deleted', targetType: 'authoring_course', targetId: id, targetName: old.title, ip: getClientIp(req) });
  return ok(res, data, 'Moved to trash');
}

export async function restoreCourse(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data, error: e } = await supabase.from('authoring_courses').update({ deleted_at: null }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'Restored');
}

export async function removeCourse(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  // Phase 50 — physically purge all Bunny assets (thumbnail, trailer, every
  // topic's video + PDFs) BEFORE the DB rows cascade away. Include soft-deleted
  // units too (no deleted_at filter) so nothing is left orphaned on Bunny.
  const { data: course } = await supabase.from('authoring_courses').select('thumbnail_url, trailer_video').eq('id', id).single();
  const { data: units } = await supabase.from('authoring_units')
    .select('video, article_pdf, exercise_pdf, exercise_solution_pdf, project_pdf')
    .eq('authoring_course_id', id);
  const urls: (string | null | undefined)[] = [];
  if (course) urls.push(course.thumbnail_url, course.trailer_video);
  for (const u of units || []) urls.push(u.video, u.article_pdf, u.exercise_pdf, u.exercise_solution_pdf, u.project_pdf);
  await purgeBunnyForUrls(urls);

  // children (units, highlights, faqs) cascade via FK ON DELETE CASCADE
  const { error: e } = await supabase.from('authoring_courses').delete().eq('id', id);
  if (e) return err(res, e.message, 500);
  logAdmin({ actorId: req.user!.id, action: 'authoring_course_deleted', targetType: 'authoring_course', targetId: id, targetName: `#${id}`, ip: getClientIp(req) });
  return ok(res, null, 'Permanently deleted (course + Bunny media removed)');
}

// ──────────────────────── HIGHLIGHTS ────────────────────────
const HIGHLIGHT_COLS = ['authoring_course_id','kind','text','display_order'] as const;
function parseHighlight(req: Request): any {
  const b = pick(req.body, HIGHLIGHT_COLS);
  if (typeof b.authoring_course_id === 'string') b.authoring_course_id = toIntOrNull(b.authoring_course_id);
  if (typeof b.display_order === 'string') b.display_order = toIntOrNull(b.display_order) ?? 0;
  return b;
}

export async function listHighlights(req: Request, res: Response) {
  if (!req.query.authoring_course_id) return err(res, 'authoring_course_id is required', 400);
  const { data, error: e } = await supabase.from('authoring_course_highlights').select('*')
    .eq('authoring_course_id', parseInt(req.query.authoring_course_id as string))
    .order('kind').order('display_order');
  if (e) return err(res, e.message, 500);
  return ok(res, data || []);
}

export async function createHighlight(req: Request, res: Response) {
  const body = parseHighlight(req);
  if (!body.authoring_course_id || !body.kind || !body.text) return err(res, 'authoring_course_id, kind and text are required', 400);
  const { data, error: e } = await supabase.from('authoring_course_highlights').insert(body).select().single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'Highlight added', 201);
}

export async function updateHighlight(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const updates = parseHighlight(req);
  delete updates.authoring_course_id;
  const { data, error: e } = await supabase.from('authoring_course_highlights').update(updates).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'Highlight updated');
}

export async function removeHighlight(req: Request, res: Response) {
  const { error: e } = await supabase.from('authoring_course_highlights').delete().eq('id', parseInt(req.params.id));
  if (e) return err(res, e.message, 500);
  return ok(res, null, 'Highlight removed');
}

// ─────────────────────────── UNITS ──────────────────────────
const UNIT_COLS = ['authoring_course_id','parent_unit_id','unit_type','title','summary','display_order','topic_type','is_free_preview','video','youtube_url','video_title','video_thumbnail','article_pdf','exercise_pdf','exercise_solution_pdf','project_pdf','project_scope','project_git_url','points'] as const;
function parseUnit(req: Request): any {
  const b = pick(req.body, UNIT_COLS);
  for (const k of ['authoring_course_id','parent_unit_id','display_order','points']) if (typeof b[k] === 'string') b[k] = toIntOrNull(b[k]);
  if (typeof b.is_free_preview === 'string') b.is_free_preview = toBool(b.is_free_preview);
  for (const k of Object.keys(b)) if (b[k] === '') b[k] = null;
  // a non-topic unit must not carry a topic_type (DB CHECK enforces this too)
  if (b.unit_type && b.unit_type !== 'topic') b.topic_type = null;
  return b;
}

export async function listUnits(req: Request, res: Response) {
  if (!req.query.authoring_course_id) return err(res, 'authoring_course_id is required', 400);
  const { data, error: e } = await supabase.from('authoring_units').select('*')
    .eq('authoring_course_id', parseInt(req.query.authoring_course_id as string))
    .is('deleted_at', null)
    .order('parent_unit_id', { nullsFirst: true }).order('display_order');
  if (e) return err(res, e.message, 500);
  return ok(res, data || []);
}

export async function createUnit(req: Request, res: Response) {
  const body = parseUnit(req);
  if (!body.authoring_course_id || !body.unit_type || !body.title) return err(res, 'authoring_course_id, unit_type and title are required', 400);
  if (body.unit_type === 'topic' && !body.topic_type) return err(res, 'topic_type is required for a topic unit', 400);
  body.created_by = req.user!.id;
  const { data, error: e } = await supabase.from('authoring_units').insert(body).select().single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'Unit created', 201);
}

export async function updateUnit(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const updates = parseUnit(req);
  delete updates.authoring_course_id;
  updates.updated_by = req.user!.id;
  const { data, error: e } = await supabase.from('authoring_units').update(updates).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'Unit updated');
}

export async function softDeleteUnit(req: Request, res: Response) {
  const { error: e } = await supabase.from('authoring_units').update({ deleted_at: new Date().toISOString() }).eq('id', parseInt(req.params.id));
  if (e) return err(res, e.message, 500);
  return ok(res, null, 'Unit removed');
}

export async function removeUnit(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  // Phase 50 — purge Bunny media for this unit AND its descendants (which the
  // self-FK cascade will remove from the DB), before deleting.
  const { data: root } = await supabase.from('authoring_units').select('authoring_course_id').eq('id', id).single();
  if (root) {
    const { data: all } = await supabase.from('authoring_units')
      .select('id, parent_unit_id, video, article_pdf, exercise_pdf, exercise_solution_pdf, project_pdf')
      .eq('authoring_course_id', root.authoring_course_id);
    const subtree = collectUnitSubtree(all || [], id);
    const urls: (string | null | undefined)[] = [];
    for (const u of all || []) {
      if (subtree.has(u.id)) urls.push(u.video, u.article_pdf, u.exercise_pdf, u.exercise_solution_pdf, u.project_pdf);
    }
    await purgeBunnyForUrls(urls);
  }
  // child units cascade via self-FK ON DELETE CASCADE
  const { error: e } = await supabase.from('authoring_units').delete().eq('id', id);
  if (e) return err(res, e.message, 500);
  return ok(res, null, 'Unit permanently deleted (with its Bunny media)');
}

// ──────────────────────────── FAQS ──────────────────────────
const FAQ_COLS = ['authoring_course_id','question','answer','display_order'] as const;
function parseFaq(req: Request): any {
  const b = pick(req.body, FAQ_COLS);
  if (typeof b.authoring_course_id === 'string') b.authoring_course_id = toIntOrNull(b.authoring_course_id);
  if (typeof b.display_order === 'string') b.display_order = toIntOrNull(b.display_order) ?? 0;
  return b;
}

export async function listFaqs(req: Request, res: Response) {
  if (!req.query.authoring_course_id) return err(res, 'authoring_course_id is required', 400);
  const { data, error: e } = await supabase.from('authoring_faqs').select('*')
    .eq('authoring_course_id', parseInt(req.query.authoring_course_id as string))
    .is('deleted_at', null).order('display_order');
  if (e) return err(res, e.message, 500);
  return ok(res, data || []);
}

export async function createFaq(req: Request, res: Response) {
  const body = parseFaq(req);
  if (!body.authoring_course_id || !body.question || !body.answer) return err(res, 'authoring_course_id, question and answer are required', 400);
  const { data, error: e } = await supabase.from('authoring_faqs').insert(body).select().single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'FAQ added', 201);
}

export async function updateFaq(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const updates = parseFaq(req);
  delete updates.authoring_course_id;
  const { data, error: e } = await supabase.from('authoring_faqs').update(updates).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'FAQ updated');
}

export async function removeFaq(req: Request, res: Response) {
  const { error: e } = await supabase.from('authoring_faqs').delete().eq('id', parseInt(req.params.id));
  if (e) return err(res, e.message, 500);
  return ok(res, null, 'FAQ removed');
}

// ═══════════════════════ MEDIA UPLOADS (Bunny) ═══════════════════════
// Mirrors the proven Courses pattern: save the row first, then upload each
// file to a dedicated endpoint → Bunny → store the returned URL on the row.

// ── Course thumbnail (image → Bunny storage) ──
export async function uploadCourseThumbnail(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: course } = await supabase.from('authoring_courses').select('id, title, thumbnail_url').eq('id', id).single();
  if (!course) return err(res, 'Authoring course not found', 404);
  if (!req.file) return err(res, 'No image file provided', 400);
  if (!req.file.mimetype?.startsWith('image/')) return err(res, 'File must be an image', 400);
  try {
    if (course.thumbnail_url) { try { await deleteImage(extractBunnyPath(course.thumbnail_url), course.thumbnail_url); } catch {} }
    const path = `authoring/courses/${id}/thumbnail-${Date.now()}.webp`;
    const url = await processAndUploadImage(req.file.buffer, path, { width: 1280, height: 720, quality: 85 });
    const { data, error: e } = await supabase.from('authoring_courses').update({ thumbnail_url: url, updated_by: req.user!.id }).eq('id', id).select().single();
    if (e) return err(res, e.message, 500);
    logAdmin({ actorId: req.user!.id, action: 'authoring_course_thumbnail_uploaded', targetType: 'authoring_course', targetId: id, targetName: course.title, ip: getClientIp(req) });
    return ok(res, data, 'Thumbnail uploaded');
  } catch (e: any) { return err(res, e.message || 'Upload failed', 500); }
}

// ── Generic video upload (→ Bunny Stream) for course trailer or unit topic ──
async function handleVideoUpload(req: Request, res: Response, table: 'authoring_courses' | 'authoring_units', column: 'trailer_video' | 'video', titleSuffix: string) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from(table).select('*').eq('id', id).single();
  if (!row) return err(res, 'Not found', 404);
  if (!req.file) return err(res, 'No video file provided', 400);
  try {
    const oldGuid = extractBunnyVideoGuid((row as any)[column]);
    if (oldGuid) { try { await deleteVideoFromStream(oldGuid); } catch {} }
    const title = `${(row as any).title || `${table}-${id}`} — ${titleSuffix}`;
    const result = await uploadVideoToStream(req.file.buffer, title);
    const patch: any = { [column]: result.embedUrl, updated_by: req.user!.id };
    if (table === 'authoring_units') patch.youtube_url = null; // a Bunny upload supersedes any external URL
    const { data, error: e } = await supabase.from(table).update(patch).eq('id', id).select().single();
    if (e) return err(res, e.message, 500);
    logAdmin({ actorId: req.user!.id, action: 'authoring_video_uploaded', targetType: table, targetId: id, targetName: (row as any).title, ip: getClientIp(req) });
    return ok(res, data, 'Video uploaded');
  } catch (e: any) { return err(res, e.message || 'Video upload failed', 500); }
}
export async function uploadCourseTrailerVideo(req: Request, res: Response) { return handleVideoUpload(req, res, 'authoring_courses', 'trailer_video', 'trailer'); }
export async function uploadUnitVideo(req: Request, res: Response) { return handleVideoUpload(req, res, 'authoring_units', 'video', 'topic'); }

// ── Explicit media removal (delete Bunny asset + null the column) ──
export async function removeUnitVideo(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from('authoring_units').select('video').eq('id', id).single();
  if (!row) return err(res, 'Unit not found', 404);
  const guid = extractBunnyVideoGuid(row.video);
  if (guid) { try { await deleteVideoFromStream(guid); } catch {} }
  const { data, error: e } = await supabase.from('authoring_units').update({ video: null, youtube_url: null, updated_by: req.user!.id }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'Video removed');
}
export async function removeCourseTrailerVideo(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from('authoring_courses').select('trailer_video').eq('id', id).single();
  if (!row) return err(res, 'Course not found', 404);
  const guid = extractBunnyVideoGuid(row.trailer_video);
  if (guid) { try { await deleteVideoFromStream(guid); } catch {} }
  const { data, error: e } = await supabase.from('authoring_courses').update({ trailer_video: null, updated_by: req.user!.id }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'Trailer removed');
}

// ── Signed playback (Bunny library is token-gated) ──
async function signPlayback(res: Response, url: string | null) {
  const guid = extractBunnyVideoGuid(url);
  if (!guid) return ok(res, { url: url || null }); // external/YouTube → return as-is
  try { const s = signEmbedUrl(guid); return ok(res, { url: s.embedUrl, expiresAt: s.expiresAt }); }
  catch (e: any) { return err(res, e.message || 'Sign failed', 500); }
}
export async function courseTrailerPlayback(req: Request, res: Response) {
  const { data } = await supabase.from('authoring_courses').select('trailer_video').eq('id', req.params.id).single();
  if (!data) return err(res, 'Not found', 404);
  return signPlayback(res, data.trailer_video);
}
export async function unitVideoPlayback(req: Request, res: Response) {
  const { data } = await supabase.from('authoring_units').select('video').eq('id', req.params.id).single();
  if (!data) return err(res, 'Not found', 404);
  return signPlayback(res, data.video);
}

// ── Topic PDF upload (article / exercise / exercise_solution / project → Bunny storage) ──
const FILE_KIND_COLUMN: Record<string, string> = {
  article: 'article_pdf', exercise: 'exercise_pdf', exercise_solution: 'exercise_solution_pdf', project: 'project_pdf',
};
export async function uploadUnitFile(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const kind = String(req.query.kind || '');
  const column = FILE_KIND_COLUMN[kind];
  if (!column) return err(res, `Invalid kind. One of: ${Object.keys(FILE_KIND_COLUMN).join(', ')}`, 400);
  const { data: row } = await supabase.from('authoring_units').select('*').eq('id', id).single();
  if (!row) return err(res, 'Unit not found', 404);
  if (!req.file) return err(res, 'No file provided', 400);
  if (req.file.mimetype && req.file.mimetype !== 'application/pdf') return err(res, 'File must be a PDF', 400);
  try {
    const old = (row as any)[column];
    if (old) { try { await deleteImage(extractBunnyPath(old), old); } catch {} }
    const safe = (req.file.originalname || 'file.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `authoring/units/${id}/${kind}-${Date.now()}-${safe}`;
    const url = await uploadRawFile(req.file.buffer, path);
    const { data, error: e } = await supabase.from('authoring_units').update({ [column]: url, updated_by: req.user!.id }).eq('id', id).select().single();
    if (e) return err(res, e.message, 500);
    return ok(res, data, 'File uploaded');
  } catch (e: any) { return err(res, e.message || 'Upload failed', 500); }
}

export async function removeUnitFile(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const kind = String(req.query.kind || '');
  const column = FILE_KIND_COLUMN[kind];
  if (!column) return err(res, `Invalid kind. One of: ${Object.keys(FILE_KIND_COLUMN).join(', ')}`, 400);
  const { data: row } = await supabase.from('authoring_units').select('*').eq('id', id).single();
  if (!row) return err(res, 'Unit not found', 404);
  const old = (row as any)[column];
  if (old) { try { await deleteImage(extractBunnyPath(old), old); } catch {} }
  const { data, error: e } = await supabase.from('authoring_units').update({ [column]: null, updated_by: req.user!.id }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  return ok(res, data, 'File removed');
}
