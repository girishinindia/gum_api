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

// ── Re-approval guard ──
// After ANY content mutation (course basics, highlights, curriculum, capstones,
// mini projects, FAQs, media), a published/pending course is pushed back to
// "draft" so a super-admin must re-verify before it goes live again.
// Best-effort & non-blocking — a failed reset must never break the edit itself.
async function requireReApproval(courseId: number): Promise<void> {
  try {
    await supabase.from('authoring_courses')
      .update({ status: 'draft', verified_at: null, verified_by: null })
      .eq('id', courseId)
      .in('status', ['published', 'pending_approval']);
  } catch { /* swallow — non-fatal */ }
}
// Resolve authoring_course_id from a child-table row, then call requireReApproval.
async function requireReApprovalForChild(table: string, childId: number): Promise<void> {
  try {
    const { data } = await supabase.from(table).select('authoring_course_id').eq('id', childId).single();
    if (data?.authoring_course_id) await requireReApproval(data.authoring_course_id);
  } catch { /* swallow */ }
}

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
  // Any edit on a live/pending course resets it back to draft (needs re-approval)
  if (old.status === 'published' || old.status === 'pending_approval') {
    updates.status = 'draft'; updates.verified_at = null; updates.verified_by = null;
  }
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

  // Every topic must have content. Report EACH topic that is missing content
  // by name so the instructor knows exactly what to fix.
  // Skip orphan/zombie topics — those with parent_unit_id=NULL OR whose parent
  // was soft-deleted (parent id exists in DB but NOT in the filtered `units`
  // array). These show in the "Unassigned" section of the curriculum tree.
  const validUnitIds = new Set(units.map(u => u.id));
  for (const t of topics) {
    if (!t.parent_unit_id || !validUnitIds.has(t.parent_unit_id)) continue;
    const hasVideo = t.video || t.youtube_url;
    const hasFile = t.exercise_pdf || t.assignment_pdf || t.article_pdf
      || t.project_pdf || t.project_solution_file_url;
    if (!hasVideo && !hasFile) {
      p.push(`Topic "${t.title}" has no content uploaded`);
    }
  }

  if (!highlights.some(h => h.kind === 'outcome')) p.push('Add at least one outcome (what students will learn)');
  return [...new Set(p)];
}

async function loadReadiness(id: number) {
  const { data: course } = await supabase.from('authoring_courses').select('*').eq('id', id).single();
  if (!course) return null;
  const { data: units } = await supabase.from('authoring_units')
    .select('id, unit_type, parent_unit_id, topic_type, video, youtube_url, article_pdf, exercise_pdf, assignment_pdf, project_pdf, project_solution_file_url')
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
    .select('video, article_pdf, exercise_pdf, exercise_solution_pdf, assignment_pdf, project_pdf, project_solution_file_url')
    .eq('authoring_course_id', id);
  const urls: (string | null | undefined)[] = [];
  if (course) urls.push(course.thumbnail_url, course.trailer_video);
  for (const u of units || []) urls.push(u.video, u.article_pdf, u.exercise_pdf, u.exercise_solution_pdf, u.assignment_pdf, u.project_pdf, u.project_solution_file_url);
  // Also purge capstone + mini project files (they cascade-delete from DB but Bunny assets need explicit removal)
  const { data: capstones } = await supabase.from('authoring_capstone_projects').select('pdf_url, solution_file_url').eq('authoring_course_id', id);
  for (const c of capstones || []) urls.push(c.pdf_url, c.solution_file_url);
  const { data: minis } = await supabase.from('authoring_mini_projects').select('pdf_url, solution_file_url').eq('authoring_course_id', id);
  for (const m of minis || []) urls.push(m.pdf_url, m.solution_file_url);
  await purgeBunnyForUrls(urls);

  // children (units, highlights, faqs, capstones, mini-projects) cascade via FK ON DELETE CASCADE
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
  await requireReApproval(body.authoring_course_id);
  return ok(res, data, 'Highlight added', 201);
}

export async function updateHighlight(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const updates = parseHighlight(req);
  delete updates.authoring_course_id;
  const { data, error: e } = await supabase.from('authoring_course_highlights').update(updates).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  await requireReApprovalForChild('authoring_course_highlights', id);
  return ok(res, data, 'Highlight updated');
}

export async function removeHighlight(req: Request, res: Response) {
  const hId = parseInt(req.params.id);
  // Resolve course before deleting the row (FK gone after delete)
  const { data: hl } = await supabase.from('authoring_course_highlights').select('authoring_course_id').eq('id', hId).single();
  const { error: e } = await supabase.from('authoring_course_highlights').delete().eq('id', hId);
  if (e) return err(res, e.message, 500);
  if (hl?.authoring_course_id) await requireReApproval(hl.authoring_course_id);
  return ok(res, null, 'Highlight removed');
}

// ─────────────────────────── UNITS ──────────────────────────
const UNIT_COLS = ['authoring_course_id','parent_unit_id','unit_type','title','summary','display_order','topic_type','is_free_preview','video','youtube_url','video_title','video_thumbnail','article_pdf','exercise_pdf','exercise_solution_pdf','assignment_pdf','project_pdf','project_scope','project_git_url','project_solution_file_url','points'] as const;
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
  // topic_type is now optional — topics can carry all content types simultaneously.
  // When set, it indicates the *primary* content type (used for display/icons).
  body.created_by = req.user!.id;
  const { data, error: e } = await supabase.from('authoring_units').insert(body).select().single();
  if (e) return err(res, e.message, 500);
  await requireReApproval(body.authoring_course_id);
  return ok(res, data, 'Unit created', 201);
}

export async function updateUnit(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const updates = parseUnit(req);
  delete updates.authoring_course_id;
  updates.updated_by = req.user!.id;
  const { data, error: e } = await supabase.from('authoring_units').update(updates).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  await requireReApprovalForChild('authoring_units', id);
  return ok(res, data, 'Unit updated');
}

export async function softDeleteUnit(req: Request, res: Response) {
  const uId = parseInt(req.params.id);
  await requireReApprovalForChild('authoring_units', uId);
  const { error: e } = await supabase.from('authoring_units').update({ deleted_at: new Date().toISOString() }).eq('id', uId);
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
      .select('id, parent_unit_id, video, article_pdf, exercise_pdf, exercise_solution_pdf, assignment_pdf, project_pdf, project_solution_file_url')
      .eq('authoring_course_id', root.authoring_course_id);
    const subtree = collectUnitSubtree(all || [], id);
    const urls: (string | null | undefined)[] = [];
    for (const u of all || []) {
      if (subtree.has(u.id)) urls.push(u.video, u.article_pdf, u.exercise_pdf, u.exercise_solution_pdf, u.assignment_pdf, u.project_pdf, u.project_solution_file_url);
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
  await requireReApproval(body.authoring_course_id);
  return ok(res, data, 'FAQ added', 201);
}

export async function updateFaq(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const updates = parseFaq(req);
  delete updates.authoring_course_id;
  const { data, error: e } = await supabase.from('authoring_faqs').update(updates).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  await requireReApprovalForChild('authoring_faqs', id);
  return ok(res, data, 'FAQ updated');
}

export async function removeFaq(req: Request, res: Response) {
  const fId = parseInt(req.params.id);
  const { data: faq } = await supabase.from('authoring_faqs').select('authoring_course_id').eq('id', fId).single();
  const { error: e } = await supabase.from('authoring_faqs').delete().eq('id', fId);
  if (e) return err(res, e.message, 500);
  if (faq?.authoring_course_id) await requireReApproval(faq.authoring_course_id);
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
    await requireReApproval(id);
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
    const courseIdForReset = table === 'authoring_courses' ? id : (row as any).authoring_course_id;
    if (courseIdForReset) await requireReApproval(courseIdForReset);
    logAdmin({ actorId: req.user!.id, action: 'authoring_video_uploaded', targetType: table, targetId: id, targetName: (row as any).title, ip: getClientIp(req) });
    return ok(res, data, 'Video uploaded');
  } catch (e: any) { return err(res, e.message || 'Video upload failed', 500); }
}
export async function uploadCourseTrailerVideo(req: Request, res: Response) { return handleVideoUpload(req, res, 'authoring_courses', 'trailer_video', 'trailer'); }
export async function uploadUnitVideo(req: Request, res: Response) { return handleVideoUpload(req, res, 'authoring_units', 'video', 'topic'); }

// ── Explicit media removal (delete Bunny asset + null the column) ──
export async function removeUnitVideo(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from('authoring_units').select('video, authoring_course_id').eq('id', id).single();
  if (!row) return err(res, 'Unit not found', 404);
  const guid = extractBunnyVideoGuid(row.video);
  if (guid) { try { await deleteVideoFromStream(guid); } catch {} }
  const { data, error: e } = await supabase.from('authoring_units').update({ video: null, youtube_url: null, updated_by: req.user!.id }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  if (row.authoring_course_id) await requireReApproval(row.authoring_course_id);
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
  await requireReApproval(id);
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
  article: 'article_pdf', exercise: 'exercise_pdf', exercise_solution: 'exercise_solution_pdf',
  assignment: 'assignment_pdf', project: 'project_pdf', project_solution: 'project_solution_file_url',
};
export async function uploadUnitFile(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const kind = String(req.query.kind || '');
  const column = FILE_KIND_COLUMN[kind];
  if (!column) return err(res, `Invalid kind. One of: ${Object.keys(FILE_KIND_COLUMN).join(', ')}`, 400);
  const { data: row } = await supabase.from('authoring_units').select('*').eq('id', id).single();
  if (!row) return err(res, 'Unit not found', 404);
  if (!req.file) return err(res, 'No file provided', 400);
  const allowedMimes = kind === 'project_solution'
    ? ['application/pdf', 'application/zip', 'application/x-zip-compressed', 'application/octet-stream']
    : ['application/pdf'];
  if (req.file.mimetype && !allowedMimes.includes(req.file.mimetype)) {
    return err(res, kind === 'project_solution' ? 'File must be a PDF or ZIP' : 'File must be a PDF', 400);
  }
  try {
    const old = (row as any)[column];
    if (old) { try { await deleteImage(extractBunnyPath(old), old); } catch {} }
    const safe = (req.file.originalname || 'file.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `authoring/units/${id}/${kind}-${Date.now()}-${safe}`;
    const url = await uploadRawFile(req.file.buffer, path);
    const { data, error: e } = await supabase.from('authoring_units').update({ [column]: url, updated_by: req.user!.id }).eq('id', id).select().single();
    if (e) return err(res, e.message, 500);
    if ((row as any).authoring_course_id) await requireReApproval((row as any).authoring_course_id);
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
  if ((row as any).authoring_course_id) await requireReApproval((row as any).authoring_course_id);
  return ok(res, data, 'File removed');
}

// ═════════════════════ CAPSTONE PROJECTS (course-level) ═════════════════════
const CAPSTONE_COLS = ['authoring_course_id','title','description','display_order','pdf_url','solution_file_url','solution_github_url','is_active'] as const;

function parseCapstone(req: Request): any {
  const b = pick(req.body, CAPSTONE_COLS);
  if (typeof b.authoring_course_id === 'string') b.authoring_course_id = toIntOrNull(b.authoring_course_id);
  if (typeof b.display_order === 'string') b.display_order = toIntOrNull(b.display_order) ?? 0;
  if (typeof b.is_active === 'string') b.is_active = toBool(b.is_active);
  for (const k of Object.keys(b)) if (b[k] === '') b[k] = null;
  return b;
}

export async function listCapstoneProjects(req: Request, res: Response) {
  if (!req.query.authoring_course_id) return err(res, 'authoring_course_id is required', 400);
  const { data, error: e } = await supabase.from('authoring_capstone_projects').select('*')
    .eq('authoring_course_id', parseInt(req.query.authoring_course_id as string))
    .is('deleted_at', null).order('display_order');
  if (e) return err(res, e.message, 500);
  return ok(res, data || []);
}

export async function getCapstoneProject(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('authoring_capstone_projects').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Capstone project not found', 404);
  return ok(res, data);
}

export async function createCapstoneProject(req: Request, res: Response) {
  const body = parseCapstone(req);
  if (!body.authoring_course_id || !body.title) return err(res, 'authoring_course_id and title are required', 400);
  body.created_by = req.user!.id;
  const { data, error: e } = await supabase.from('authoring_capstone_projects').insert(body).select().single();
  if (e) return err(res, e.message, 500);
  await requireReApproval(body.authoring_course_id);
  logAdmin({ actorId: req.user!.id, action: 'authoring_capstone_created', targetType: 'authoring_capstone_project', targetId: data.id, targetName: data.title, ip: getClientIp(req) });
  return ok(res, data, 'Capstone project created', 201);
}

export async function updateCapstoneProject(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const updates = parseCapstone(req);
  delete updates.authoring_course_id; // immutable after creation
  updates.updated_by = req.user!.id;
  const { data, error: e } = await supabase.from('authoring_capstone_projects').update(updates).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  await requireReApprovalForChild('authoring_capstone_projects', id);
  return ok(res, data, 'Capstone project updated');
}

export async function softDeleteCapstoneProject(req: Request, res: Response) {
  const cpId = parseInt(req.params.id);
  await requireReApprovalForChild('authoring_capstone_projects', cpId);
  const { error: e } = await supabase.from('authoring_capstone_projects')
    .update({ deleted_at: new Date().toISOString() }).eq('id', cpId);
  if (e) return err(res, e.message, 500);
  return ok(res, null, 'Capstone project moved to trash');
}

export async function removeCapstoneProject(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from('authoring_capstone_projects').select('pdf_url, solution_file_url').eq('id', id).single();
  if (row) await purgeBunnyForUrls([row.pdf_url, row.solution_file_url]);
  const { error: e } = await supabase.from('authoring_capstone_projects').delete().eq('id', id);
  if (e) return err(res, e.message, 500);
  return ok(res, null, 'Capstone project permanently deleted');
}

// ── Capstone project file uploads (PDF brief + solution ZIP) ──
const CAPSTONE_FILE_KIND: Record<string, string> = { pdf: 'pdf_url', solution: 'solution_file_url' };

export async function uploadCapstoneFile(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const kind = String(req.query.kind || '');
  const column = CAPSTONE_FILE_KIND[kind];
  if (!column) return err(res, `Invalid kind. One of: ${Object.keys(CAPSTONE_FILE_KIND).join(', ')}`, 400);
  const { data: row } = await supabase.from('authoring_capstone_projects').select('*').eq('id', id).single();
  if (!row) return err(res, 'Capstone project not found', 404);
  if (!req.file) return err(res, 'No file provided', 400);
  const allowedMimes = kind === 'solution'
    ? ['application/pdf', 'application/zip', 'application/x-zip-compressed', 'application/octet-stream']
    : ['application/pdf'];
  if (req.file.mimetype && !allowedMimes.includes(req.file.mimetype)) {
    return err(res, kind === 'solution' ? 'File must be a PDF or ZIP' : 'File must be a PDF', 400);
  }
  try {
    const old = (row as any)[column];
    if (old) { try { await deleteImage(extractBunnyPath(old), old); } catch {} }
    const safe = (req.file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `authoring/capstone-projects/${id}/${kind}-${Date.now()}-${safe}`;
    const url = await uploadRawFile(req.file.buffer, path);
    const { data, error: e } = await supabase.from('authoring_capstone_projects').update({ [column]: url, updated_by: req.user!.id }).eq('id', id).select().single();
    if (e) return err(res, e.message, 500);
    if ((row as any).authoring_course_id) await requireReApproval((row as any).authoring_course_id);
    return ok(res, data, 'File uploaded');
  } catch (e: any) { return err(res, e.message || 'Upload failed', 500); }
}

export async function removeCapstoneFile(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const kind = String(req.query.kind || '');
  const column = CAPSTONE_FILE_KIND[kind];
  if (!column) return err(res, `Invalid kind. One of: ${Object.keys(CAPSTONE_FILE_KIND).join(', ')}`, 400);
  const { data: row } = await supabase.from('authoring_capstone_projects').select('*').eq('id', id).single();
  if (!row) return err(res, 'Capstone project not found', 404);
  const old = (row as any)[column];
  if (old) { try { await deleteImage(extractBunnyPath(old), old); } catch {} }
  const { data, error: e } = await supabase.from('authoring_capstone_projects').update({ [column]: null, updated_by: req.user!.id }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  if ((row as any).authoring_course_id) await requireReApproval((row as any).authoring_course_id);
  return ok(res, data, 'File removed');
}

// ═════════════════════ MINI PROJECTS (module/chapter-level) ═════════════════════
const MINI_PROJECT_COLS = ['authoring_course_id','unit_id','title','description','display_order','pdf_url','solution_file_url','solution_github_url','is_active'] as const;

function parseMiniProject(req: Request): any {
  const b = pick(req.body, MINI_PROJECT_COLS);
  if (typeof b.authoring_course_id === 'string') b.authoring_course_id = toIntOrNull(b.authoring_course_id);
  if (typeof b.unit_id === 'string') b.unit_id = toIntOrNull(b.unit_id);
  if (typeof b.display_order === 'string') b.display_order = toIntOrNull(b.display_order) ?? 0;
  if (typeof b.is_active === 'string') b.is_active = toBool(b.is_active);
  for (const k of Object.keys(b)) if (b[k] === '') b[k] = null;
  return b;
}

export async function listMiniProjects(req: Request, res: Response) {
  if (!req.query.authoring_course_id) return err(res, 'authoring_course_id is required', 400);
  let q = supabase.from('authoring_mini_projects').select('*')
    .eq('authoring_course_id', parseInt(req.query.authoring_course_id as string))
    .is('deleted_at', null);
  if (req.query.unit_id) q = q.eq('unit_id', parseInt(req.query.unit_id as string));
  q = q.order('display_order');
  const { data, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return ok(res, data || []);
}

export async function getMiniProject(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('authoring_mini_projects').select('*').eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Mini project not found', 404);
  return ok(res, data);
}

export async function createMiniProject(req: Request, res: Response) {
  const body = parseMiniProject(req);
  if (!body.authoring_course_id || !body.unit_id || !body.title) return err(res, 'authoring_course_id, unit_id and title are required', 400);
  // Validate the target unit is a module or chapter
  const { data: unit } = await supabase.from('authoring_units').select('unit_type').eq('id', body.unit_id).single();
  if (!unit) return err(res, 'Unit not found', 404);
  if (unit.unit_type !== 'module' && unit.unit_type !== 'chapter') return err(res, 'Mini projects can only be attached to modules or chapters', 400);
  body.created_by = req.user!.id;
  const { data, error: e } = await supabase.from('authoring_mini_projects').insert(body).select().single();
  if (e) return err(res, e.message, 500);
  await requireReApproval(body.authoring_course_id);
  logAdmin({ actorId: req.user!.id, action: 'authoring_mini_project_created', targetType: 'authoring_mini_project', targetId: data.id, targetName: data.title, ip: getClientIp(req) });
  return ok(res, data, 'Mini project created', 201);
}

export async function updateMiniProject(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const updates = parseMiniProject(req);
  delete updates.authoring_course_id; // immutable
  delete updates.unit_id;             // immutable — move = delete + re-create
  updates.updated_by = req.user!.id;
  const { data, error: e } = await supabase.from('authoring_mini_projects').update(updates).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  await requireReApprovalForChild('authoring_mini_projects', id);
  return ok(res, data, 'Mini project updated');
}

export async function softDeleteMiniProject(req: Request, res: Response) {
  const mpId = parseInt(req.params.id);
  await requireReApprovalForChild('authoring_mini_projects', mpId);
  const { error: e } = await supabase.from('authoring_mini_projects')
    .update({ deleted_at: new Date().toISOString() }).eq('id', mpId);
  if (e) return err(res, e.message, 500);
  return ok(res, null, 'Mini project moved to trash');
}

export async function removeMiniProject(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: row } = await supabase.from('authoring_mini_projects').select('pdf_url, solution_file_url').eq('id', id).single();
  if (row) await purgeBunnyForUrls([row.pdf_url, row.solution_file_url]);
  const { error: e } = await supabase.from('authoring_mini_projects').delete().eq('id', id);
  if (e) return err(res, e.message, 500);
  return ok(res, null, 'Mini project permanently deleted');
}

// ── Mini project file uploads (PDF brief + solution ZIP) ──
const MINI_FILE_KIND: Record<string, string> = { pdf: 'pdf_url', solution: 'solution_file_url' };

export async function uploadMiniProjectFile(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const kind = String(req.query.kind || '');
  const column = MINI_FILE_KIND[kind];
  if (!column) return err(res, `Invalid kind. One of: ${Object.keys(MINI_FILE_KIND).join(', ')}`, 400);
  const { data: row } = await supabase.from('authoring_mini_projects').select('*').eq('id', id).single();
  if (!row) return err(res, 'Mini project not found', 404);
  if (!req.file) return err(res, 'No file provided', 400);
  const allowedMimes = kind === 'solution'
    ? ['application/pdf', 'application/zip', 'application/x-zip-compressed', 'application/octet-stream']
    : ['application/pdf'];
  if (req.file.mimetype && !allowedMimes.includes(req.file.mimetype)) {
    return err(res, kind === 'solution' ? 'File must be a PDF or ZIP' : 'File must be a PDF', 400);
  }
  try {
    const old = (row as any)[column];
    if (old) { try { await deleteImage(extractBunnyPath(old), old); } catch {} }
    const safe = (req.file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `authoring/mini-projects/${id}/${kind}-${Date.now()}-${safe}`;
    const url = await uploadRawFile(req.file.buffer, path);
    const { data, error: e } = await supabase.from('authoring_mini_projects').update({ [column]: url, updated_by: req.user!.id }).eq('id', id).select().single();
    if (e) return err(res, e.message, 500);
    if ((row as any).authoring_course_id) await requireReApproval((row as any).authoring_course_id);
    return ok(res, data, 'File uploaded');
  } catch (e: any) { return err(res, e.message || 'Upload failed', 500); }
}

export async function removeMiniProjectFile(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const kind = String(req.query.kind || '');
  const column = MINI_FILE_KIND[kind];
  if (!column) return err(res, `Invalid kind. One of: ${Object.keys(MINI_FILE_KIND).join(', ')}`, 400);
  const { data: row } = await supabase.from('authoring_mini_projects').select('*').eq('id', id).single();
  if (!row) return err(res, 'Mini project not found', 404);
  const old = (row as any)[column];
  if (old) { try { await deleteImage(extractBunnyPath(old), old); } catch {} }
  const { data, error: e } = await supabase.from('authoring_mini_projects').update({ [column]: null, updated_by: req.user!.id }).eq('id', id).select().single();
  if (e) return err(res, e.message, 500);
  if ((row as any).authoring_course_id) await requireReApproval((row as any).authoring_course_id);
  return ok(res, data, 'File removed');
}

// ───────────────────────── IMPORT COURSE (FULL) ─────────────────────────

/**
 * Full course import from a single .txt file with [SECTION] markers.
 *
 * Supported sections (all optional except [CURRICULUM]):
 *   [COURSE]      — key:value pairs for course metadata
 *   [HIGHLIGHTS]  — kind:text lines (prerequisite, outcome, skill, audience, requirement)
 *   [FAQ]         — Q:/A: pairs
 *   [CURRICULUM]  — tab-indented module → chapter → topic tree
 *
 * If no section markers are found, the entire file is treated as [CURRICULUM]
 * (backwards compatible with the original import format).
 *
 * Lines starting with # are comments. Blank lines ignored.
 */

// ── Parsed types ──
interface ParsedImportTopic { title: string; topic_type: string; summary?: string; is_free_preview?: boolean; points?: number; youtube_url?: string; line: number; }
interface ParsedImportChapter { title: string; summary?: string; topics: ParsedImportTopic[]; line: number; }
interface ParsedImportModule { title: string; summary?: string; chapters: ParsedImportChapter[]; line: number; }
interface ParsedHighlight { kind: string; text: string; }
interface ParsedFaq { question: string; answer: string; }
interface FullImportParseResult {
  courseFields: Record<string, string>;
  highlights: ParsedHighlight[];
  faqs: ParsedFaq[];
  modules: ParsedImportModule[];
  errors: string[];
  hasCourseSection: boolean;
  hasHighlightsSection: boolean;
  hasFaqSection: boolean;
  hasCurriculumSection: boolean;
}

const VALID_TOPIC_TYPES = ['video', 'article', 'quiz', 'exercise', 'project'];
const VALID_HIGHLIGHT_KINDS = ['prerequisite', 'outcome', 'skill', 'audience', 'requirement'];
const VALID_COURSE_KEYS = ['title', 'subtitle', 'short_intro', 'long_intro', 'level', 'price', 'original_price', 'is_free', 'has_certificate', 'category_id', 'language_id', 'requires_verification'];

/**
 * Split raw file content by [SECTION] markers into named blocks.
 * If no markers found, the entire content goes to 'CURRICULUM'.
 */
function splitSections(content: string): { sections: Record<string, string>; hasMarkers: boolean } {
  const markerRe = /^\[([A-Z_]+)\]\s*$/;
  const lines = content.split(/\r?\n/);
  const sections: Record<string, string> = {};
  let currentSection: string | null = null;
  let currentLines: string[] = [];
  let hasMarkers = false;

  for (const line of lines) {
    const m = line.trim().match(markerRe);
    if (m) {
      hasMarkers = true;
      if (currentSection) sections[currentSection] = currentLines.join('\n');
      currentSection = m[1];
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentSection) sections[currentSection] = currentLines.join('\n');
  if (!hasMarkers) sections['CURRICULUM'] = content;
  return { sections, hasMarkers };
}

/** Parse [COURSE] section: key:value lines → record */
function parseCourseSection(block: string): { fields: Record<string, string>; errors: string[] } {
  const fields: Record<string, string> = {};
  const errors: string[] = [];
  for (const raw of block.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx <= 0) { errors.push(`[COURSE] Invalid line (expected key:value): "${trimmed}"`); continue; }
    const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const val = trimmed.slice(colonIdx + 1).trim();
    if (!VALID_COURSE_KEYS.includes(key)) { errors.push(`[COURSE] Unknown key "${key}"`); continue; }
    fields[key] = val;
  }
  return { fields, errors };
}

/** Parse [HIGHLIGHTS] section: kind:text lines */
function parseHighlightsSection(block: string): { highlights: ParsedHighlight[]; errors: string[] } {
  const highlights: ParsedHighlight[] = [];
  const errors: string[] = [];
  for (const raw of block.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx <= 0) { errors.push(`[HIGHLIGHTS] Invalid line (expected kind:text): "${trimmed}"`); continue; }
    const kind = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const text = trimmed.slice(colonIdx + 1).trim();
    if (!VALID_HIGHLIGHT_KINDS.includes(kind)) { errors.push(`[HIGHLIGHTS] Unknown kind "${kind}". Valid: ${VALID_HIGHLIGHT_KINDS.join(', ')}`); continue; }
    if (!text) { errors.push(`[HIGHLIGHTS] Empty text for kind "${kind}"`); continue; }
    highlights.push({ kind, text });
  }
  return { highlights, errors };
}

/** Parse [FAQ] section: Q:/A: pairs */
function parseFaqSection(block: string): { faqs: ParsedFaq[]; errors: string[] } {
  const faqs: ParsedFaq[] = [];
  const errors: string[] = [];
  let currentQ: string | null = null;
  for (const raw of block.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (/^Q\s*:\s*/i.test(trimmed)) {
      if (currentQ !== null) errors.push(`[FAQ] Question without answer: "${currentQ}"`);
      currentQ = trimmed.replace(/^Q\s*:\s*/i, '').trim();
    } else if (/^A\s*:\s*/i.test(trimmed)) {
      const answer = trimmed.replace(/^A\s*:\s*/i, '').trim();
      if (currentQ === null) { errors.push(`[FAQ] Answer without question: "${answer}"`); continue; }
      if (!answer) { errors.push(`[FAQ] Empty answer for question: "${currentQ}"`); currentQ = null; continue; }
      faqs.push({ question: currentQ, answer });
      currentQ = null;
    } else {
      errors.push(`[FAQ] Invalid line (expected Q: or A:): "${trimmed}"`);
    }
  }
  if (currentQ !== null) errors.push(`[FAQ] Question without answer: "${currentQ}"`);
  return { faqs, errors };
}

/** Parse [CURRICULUM] section: tab-indented module → chapter → topic tree */
function parseCurriculumSection(block: string): { modules: ParsedImportModule[]; errors: string[] } {
  const lines = block.split(/\r?\n/);
  const modules: ParsedImportModule[] = [];
  const errors: string[] = [];

  let curMod: ParsedImportModule | null = null;
  let curCh: ParsedImportChapter | null = null;
  let curTopic: ParsedImportTopic | null = null;
  let lastEntity: 'module' | 'chapter' | 'topic' | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNum = i + 1;
    if (raw.trim() === '' || raw.trim().startsWith('#')) continue;

    // Count leading tabs (also support 4 spaces = 1 tab)
    let tabs = 0;
    let j = 0;
    while (j < raw.length && raw[j] === '\t') { tabs++; j++; }
    if (tabs === 0 && raw[0] === ' ') {
      let spaces = 0; let k = 0;
      while (k < raw.length && raw[k] === ' ') { spaces++; k++; }
      if (spaces >= 8) tabs = 2; else if (spaces >= 4) tabs = 1;
      j = k;
    }
    const text = raw.slice(j).trim();
    if (!text) continue;

    // Check if this is a property line (key: value)
    const propMatch = text.match(/^(summary|is_free_preview|points|youtube_url)\s*:\s*(.*)$/i);
    if (propMatch) {
      const key = propMatch[1].toLowerCase();
      const val = propMatch[2].trim();
      const target = lastEntity === 'module' ? curMod : lastEntity === 'chapter' ? curCh : lastEntity === 'topic' ? curTopic : null;
      if (!target) { errors.push(`[CURRICULUM] Line ${lineNum}: Property "${key}" has no parent entity`); continue; }
      if (key === 'summary') (target as any).summary = val;
      else if (key === 'is_free_preview') (target as any).is_free_preview = val === 'true' || val === '1' || val === 'yes';
      else if (key === 'points') (target as any).points = parseInt(val) || undefined;
      else if (key === 'youtube_url') (target as any).youtube_url = val;
      continue;
    }

    // Heading line
    if (tabs === 0) {
      curMod = { title: text, chapters: [], line: lineNum };
      curCh = null; curTopic = null; lastEntity = 'module';
      modules.push(curMod);
    } else if (tabs === 1) {
      if (!curMod) { errors.push(`[CURRICULUM] Line ${lineNum}: Chapter "${text}" has no parent module`); continue; }
      curCh = { title: text, topics: [], line: lineNum };
      curTopic = null; lastEntity = 'chapter';
      curMod.chapters.push(curCh);
    } else if (tabs === 2) {
      if (!curCh) { errors.push(`[CURRICULUM] Line ${lineNum}: Topic "${text}" has no parent chapter`); continue; }
      const pipeIdx = text.lastIndexOf('|');
      let title = text;
      let topicType = 'video';
      if (pipeIdx > 0) {
        const maybeType = text.slice(pipeIdx + 1).trim().toLowerCase();
        if (VALID_TOPIC_TYPES.includes(maybeType)) {
          title = text.slice(0, pipeIdx).trim();
          topicType = maybeType;
        }
      }
      curTopic = { title, topic_type: topicType, line: lineNum };
      lastEntity = 'topic';
      curCh.topics.push(curTopic);
    } else {
      errors.push(`[CURRICULUM] Line ${lineNum}: Too many indent levels (max 2 tabs). Got ${tabs} tabs for "${text}"`);
    }
  }

  return { modules, errors };
}

/** Master parser — splits by section markers, delegates to sub-parsers */
function parseFullCourseImport(content: string): FullImportParseResult {
  const { sections, hasMarkers } = splitSections(content);
  const errors: string[] = [];

  let courseFields: Record<string, string> = {};
  let highlights: ParsedHighlight[] = [];
  let faqs: ParsedFaq[] = [];
  let modules: ParsedImportModule[] = [];

  const hasCourseSection = !!sections['COURSE'];
  const hasHighlightsSection = !!sections['HIGHLIGHTS'];
  const hasFaqSection = !!sections['FAQ'];
  const hasCurriculumSection = !!sections['CURRICULUM'];

  if (hasCourseSection) {
    const r = parseCourseSection(sections['COURSE']);
    courseFields = r.fields;
    errors.push(...r.errors);
  }
  if (hasHighlightsSection) {
    const r = parseHighlightsSection(sections['HIGHLIGHTS']);
    highlights = r.highlights;
    errors.push(...r.errors);
  }
  if (hasFaqSection) {
    const r = parseFaqSection(sections['FAQ']);
    faqs = r.faqs;
    errors.push(...r.errors);
  }
  if (hasCurriculumSection) {
    const r = parseCurriculumSection(sections['CURRICULUM']);
    modules = r.modules;
    errors.push(...r.errors);
    if (r.modules.length === 0 && r.errors.length === 0) {
      errors.push('[CURRICULUM] No modules found. Module names must have no leading tabs.');
    }
  }

  // Must have at least one meaningful section
  if (!hasCourseSection && !hasHighlightsSection && !hasFaqSection && !hasCurriculumSection) {
    errors.push('No valid sections found. Use [COURSE], [HIGHLIGHTS], [FAQ], or [CURRICULUM] markers.');
  }

  return { courseFields, highlights, faqs, modules, errors, hasCourseSection, hasHighlightsSection, hasFaqSection, hasCurriculumSection };
}

/**
 * POST /authoring/courses/:id/import-structure
 * Accepts multipart .txt file → parses sections → updates course metadata,
 * syncs highlights/FAQs, creates/updates curriculum units.
 */
export async function importStructure(req: Request, res: Response) {
  try {
    const courseId = parseInt(req.params.id);
    if (!courseId) return err(res, 'Invalid course ID', 400);

    const { data: course } = await supabase.from('authoring_courses').select('*').eq('id', courseId).single();
    if (!course) return err(res, 'Course not found', 404);

    const file = (req as any).file;
    if (!file) return err(res, '.txt file is required', 400);

    const content = file.buffer.toString('utf-8');
    const parsed = parseFullCourseImport(content);

    if (parsed.errors.length > 0) {
      return err(res, `Parsing errors: ${parsed.errors.join('; ')}`, 400);
    }

    const userId = req.user!.id;
    const report = {
      course: null as null | 'updated',
      highlights: { added: 0, removed: 0 },
      faqs: { added: 0, removed: 0 },
      created: { modules: 0, chapters: 0, topics: 0 },
      errors: [] as string[],
    };

    // ── 1. [COURSE] — PATCH course metadata ──
    if (parsed.hasCourseSection && Object.keys(parsed.courseFields).length > 0) {
      const f = parsed.courseFields;
      const upd: any = { updated_by: userId };
      if (f.title) upd.title = f.title;
      if (f.subtitle) upd.subtitle = f.subtitle;
      if (f.short_intro) upd.short_intro = f.short_intro;
      if (f.long_intro) upd.long_intro = f.long_intro;
      if (f.level) upd.level = f.level;
      if (f.price !== undefined) upd.price = toNumOrNull(f.price);
      if (f.original_price !== undefined) upd.original_price = toNumOrNull(f.original_price);
      if (f.is_free !== undefined) upd.is_free = f.is_free === 'true' || f.is_free === '1' || f.is_free === 'yes';
      if (f.has_certificate !== undefined) upd.has_certificate = f.has_certificate === 'true' || f.has_certificate === '1' || f.has_certificate === 'yes';
      if (f.requires_verification !== undefined) upd.requires_verification = f.requires_verification === 'true' || f.requires_verification === '1' || f.requires_verification === 'yes';
      if (f.category_id) upd.category_id = toIntOrNull(f.category_id);
      if (f.language_id) upd.language_id = toIntOrNull(f.language_id);

      // Validate basics
      const valErr = validateCourseBasics(upd, course);
      if (valErr) { report.errors.push(`[COURSE] ${valErr}`); } else {
        const { error: e } = await supabase.from('authoring_courses').update(upd).eq('id', courseId);
        if (e) report.errors.push(`[COURSE] Update failed: ${e.message}`);
        else report.course = 'updated';
      }
    }

    // ── 2. [HIGHLIGHTS] — Replace all existing → insert new ──
    if (parsed.hasHighlightsSection) {
      // Count existing for reporting
      const { data: existing } = await supabase.from('authoring_course_highlights').select('id').eq('authoring_course_id', courseId);
      const oldCount = existing?.length || 0;

      // Delete all existing highlights for this course
      if (oldCount > 0) {
        const { error: de } = await supabase.from('authoring_course_highlights').delete().eq('authoring_course_id', courseId);
        if (de) report.errors.push(`[HIGHLIGHTS] Failed to clear old highlights: ${de.message}`);
      }
      report.highlights.removed = oldCount;

      // Insert new highlights
      if (parsed.highlights.length > 0) {
        const rows = parsed.highlights.map((h, i) => ({
          authoring_course_id: courseId,
          kind: h.kind,
          text: h.text,
          display_order: i + 1,
        }));
        const { error: ie } = await supabase.from('authoring_course_highlights').insert(rows);
        if (ie) report.errors.push(`[HIGHLIGHTS] Insert failed: ${ie.message}`);
        else report.highlights.added = rows.length;
      }
    }

    // ── 3. [FAQ] — Replace all existing → insert new ──
    if (parsed.hasFaqSection) {
      const { data: existing } = await supabase.from('authoring_faqs').select('id').eq('authoring_course_id', courseId);
      const oldCount = existing?.length || 0;

      if (oldCount > 0) {
        const { error: de } = await supabase.from('authoring_faqs').delete().eq('authoring_course_id', courseId);
        if (de) report.errors.push(`[FAQ] Failed to clear old FAQs: ${de.message}`);
      }
      report.faqs.removed = oldCount;

      if (parsed.faqs.length > 0) {
        const rows = parsed.faqs.map((f, i) => ({
          authoring_course_id: courseId,
          question: f.question,
          answer: f.answer,
          display_order: i + 1,
        }));
        const { error: ie } = await supabase.from('authoring_faqs').insert(rows);
        if (ie) report.errors.push(`[FAQ] Insert failed: ${ie.message}`);
        else report.faqs.added = rows.length;
      }
    }

    // ── 4. [CURRICULUM] — Create modules → chapters → topics (create-only, no updates) ──
    if (parsed.hasCurriculumSection && parsed.modules.length > 0) {
      for (let mi = 0; mi < parsed.modules.length; mi++) {
        const pm = parsed.modules[mi];
        const modRow: any = { authoring_course_id: courseId, unit_type: 'module', title: pm.title, display_order: mi + 1, created_by: userId };
        if (pm.summary) modRow.summary = pm.summary;
        const { data: modData, error: modErr } = await supabase.from('authoring_units').insert(modRow).select('id').single();
        if (modErr || !modData) { report.errors.push(`Module "${pm.title}" creation failed: ${modErr?.message || 'unknown'}`); continue; }
        report.created.modules++;

        for (let ci = 0; ci < pm.chapters.length; ci++) {
          const pc = pm.chapters[ci];
          const chRow: any = { authoring_course_id: courseId, parent_unit_id: modData.id, unit_type: 'chapter', title: pc.title, display_order: ci + 1, created_by: userId };
          if (pc.summary) chRow.summary = pc.summary;
          const { data: chData, error: chErr } = await supabase.from('authoring_units').insert(chRow).select('id').single();
          if (chErr || !chData) { report.errors.push(`Chapter "${pc.title}" creation failed: ${chErr?.message || 'unknown'}`); continue; }
          report.created.chapters++;

          for (let ti = 0; ti < pc.topics.length; ti++) {
            const pt = pc.topics[ti];
            const tRow: any = { authoring_course_id: courseId, parent_unit_id: chData.id, unit_type: 'topic', title: pt.title, topic_type: pt.topic_type, display_order: ti + 1, created_by: userId, is_free_preview: pt.is_free_preview || false };
            if (pt.summary) tRow.summary = pt.summary;
            if (pt.points) tRow.points = pt.points;
            if (pt.youtube_url) tRow.youtube_url = pt.youtube_url;
            const { error: tErr } = await supabase.from('authoring_units').insert(tRow);
            if (tErr) { report.errors.push(`Topic "${pt.title}" creation failed: ${tErr.message}`); continue; }
            report.created.topics++;
          }
        }
      }
    }

    await requireReApproval(courseId);

    // Build summary message
    const parts: string[] = [];
    if (report.course) parts.push('Course details updated');
    if (parsed.hasHighlightsSection) parts.push(`Highlights: ${report.highlights.added} added, ${report.highlights.removed} old removed`);
    if (parsed.hasFaqSection) parts.push(`FAQs: ${report.faqs.added} added, ${report.faqs.removed} old removed`);
    const totalCreated = report.created.modules + report.created.chapters + report.created.topics;
    if (totalCreated) parts.push(`Curriculum: ${totalCreated} created`);
    if (report.errors.length) parts.push(`${report.errors.length} errors`);
    const msg = parts.join('. ') || 'No changes made';

    logAdmin({ actorId: userId, action: 'course_structure_imported', targetType: 'authoring_course', targetId: courseId, targetName: `Course #${courseId}`, ip: getClientIp(req), metadata: { course: report.course, highlights: report.highlights, faqs: report.faqs, created: report.created } });

    return ok(res, { report }, msg);
  } catch (e: any) {
    return err(res, e.message || 'Import failed', 500);
  }
}
