import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'instructor_profiles:all';
const clearCache = async () => {
  await redis.del(CACHE_KEY);
};

// Simple select – explicit FK-based joins removed to avoid PostgREST errors
// when constraint names don't match the actual database schema.
const SELECT_QUERY = '*';

function parseBody(req: Request): any {
  const body: any = { ...req.body };

  // Strip system / identity columns the client must never set
  delete body.id;
  delete body.user_id;
  delete body.created_at;
  delete body.updated_at;
  delete body.deleted_at;
  delete body.created_by;
  delete body.updated_by;
  delete body.deleted_by;

  // The Phase-13 fields are restored — coerce types instead of stripping them.

  // FK / id fields → integer or null
  for (const k of ['designation_id', 'department_id', 'branch_id', 'specialization_id', 'secondary_specialization_id', 'preferred_teaching_language_id', 'approved_by', 'total_reviews_received']) {
    if (typeof body[k] === 'string') { const t = body[k].trim(); const n = t === '' ? null : parseInt(t); body[k] = (n === null || Number.isNaN(n)) ? null : n; }
  }

  // Integer fields → integer or null
  for (const k of ['intro_video_duration_sec', 'teaching_experience_years', 'industry_experience_years', 'total_experience_years', 'total_teaching_hours', 'available_hours_per_week', 'max_concurrent_courses', 'total_courses_created', 'total_courses_published', 'total_students_taught', 'total_content_minutes', 'patents_count', 'publications_count']) {
    if (typeof body[k] === 'string') { const t = body[k].trim(); const n = t === '' ? null : parseInt(t); body[k] = (n === null || Number.isNaN(n)) ? null : n; }
  }

  // Decimal fields → number or null
  for (const k of ['revenue_share_percentage', 'fixed_rate_per_course', 'hourly_rate', 'completion_rate']) {
    if (typeof body[k] === 'string') { const t = body[k].trim(); const n = t === '' ? null : Number(t); body[k] = (n === null || Number.isNaN(n)) ? null : n; }
  }

  // Booleans
  for (const k of ['is_active', 'is_verified', 'is_featured', 'pan_verified', 'is_available']) {
    if (typeof body[k] === 'string') body[k] = body[k] === 'true';
  }

  // Empty strings to null
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// Minimal server-side guard for rate/share fields. Returns an error message
// when out of range, or null when the body is valid. (PATCH may omit fields,
// so only values that are actually present are checked.)
function validateRates(body: any): string | null {
  if (body.revenue_share_percentage != null) {
    const v = Number(body.revenue_share_percentage);
    if (!Number.isNaN(v) && (v < 0 || v > 100)) return 'Revenue share must be 0–100';
  }
  if (body.hourly_rate != null) {
    const v = Number(body.hourly_rate);
    if (!Number.isNaN(v) && v < 0) return 'Hourly rate must be 0 or more';
  }
  if (body.fixed_rate_per_course != null) {
    const v = Number(body.fixed_rate_per_course);
    if (!Number.isNaN(v) && v < 0) return 'Fixed rate per course must be 0 or more';
  }
  return null;
}

// Range / format validation for the restored instructor fields. Only checks
// values that are actually present (PATCH/upsert may omit fields).
const TEACHING_MODES = ['online', 'offline', 'hybrid', 'blended'];
function validateInstructorFields(body: any): string | null {
  const nonNegInt = (k: string, label: string, max?: number): string | null => {
    if (body[k] == null) return null;
    const v = Number(body[k]);
    if (Number.isNaN(v) || v < 0) return `${label} must be 0 or more`;
    if (max != null && v > max) return `${label} must be ${max} or less`;
    return null;
  };
  for (const [k, label, max] of [
    ['teaching_experience_years', 'Teaching experience (years)', 80],
    ['industry_experience_years', 'Industry experience (years)', 80],
    ['total_experience_years', 'Total experience (years)', 80],
    ['available_hours_per_week', 'Available hours per week', 168],
    ['max_concurrent_courses', 'Max concurrent courses', 1000],
    ['total_teaching_hours', 'Total teaching hours', undefined],
    ['total_courses_created', 'Total courses created', undefined],
    ['total_courses_published', 'Total courses published', undefined],
    ['total_students_taught', 'Total students taught', undefined],
    ['total_content_minutes', 'Total content minutes', undefined],
    ['patents_count', 'Patents count', undefined],
    ['publications_count', 'Publications count', undefined],
    ['intro_video_duration_sec', 'Intro video duration', undefined],
  ] as [string, string, number | undefined][]) {
    const e = nonNegInt(k, label, max);
    if (e) return e;
  }
  if (body.completion_rate != null) {
    const v = Number(body.completion_rate);
    if (Number.isNaN(v) || v < 0 || v > 100) return 'Completion rate must be 0–100';
  }
  if (body.teaching_mode != null && body.teaching_mode !== '' && !TEACHING_MODES.includes(String(body.teaching_mode))) {
    return `Teaching mode must be one of: ${TEACHING_MODES.join(', ')}`;
  }
  if (body.available_from && body.available_until) {
    const a = new Date(body.available_from).getTime();
    const b = new Date(body.available_until).getTime();
    if (!Number.isNaN(a) && !Number.isNaN(b) && b < a) return 'Available Until must be on or after Available From';
  }
  return null;
}

// GET /instructor-profiles/public — no auth, returns featured active instructors with user info
export async function listPublic(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase
    .from('instructor_profiles')
    .select('*, users!instructor_profiles_user_id_fkey(id, full_name, avatar_url)', { count: 'exact' })
    .is('deleted_at', null)
    .eq('is_active', true);

  // ── Search (by instructor code — user name search requires separate approach)
  if (search) q = q.ilike('instructor_code', `%${search}%`);

  // Optional filters
  if (req.query.is_featured === 'true')  q = q.eq('is_featured', true);
  if (req.query.is_verified === 'true')  q = q.eq('is_verified', true);
  if (req.query.instructor_type)         q = q.eq('instructor_type', req.query.instructor_type);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// GET /instructor-profiles?page=1&limit=20&search=foo&sort=instructor_code&order=asc
// Attach users + specialization names by id. The list SELECT is '*' (no embeds,
// to avoid PostgREST FK-name issues), so the admin's profile.users.full_name /
// profile.specializations.name would be empty without this enrichment.
async function enrichProfiles(rows: any[]): Promise<any[]> {
  if (!rows.length) return rows;
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const specIds = [...new Set(rows.flatMap((r) => [r.specialization_id, r.secondary_specialization_id]).filter(Boolean))];
  const userMap: Record<number, any> = {};
  const specMap: Record<number, any> = {};
  if (userIds.length) {
    const { data: us } = await supabase.from('users').select('id, full_name, email, avatar_url').in('id', userIds);
    for (const u of (us || []) as any[]) userMap[u.id] = u;
  }
  if (specIds.length) {
    const { data: sp } = await supabase.from('specializations').select('id, name').in('id', specIds);
    for (const s of (sp || []) as any[]) specMap[s.id] = s;
  }
  return rows.map((r) => ({
    ...r,
    users: r.user_id ? (userMap[r.user_id] ?? null) : null,
    specializations: r.specialization_id ? (specMap[r.specialization_id] ?? null) : null,
    secondary_specializations: r.secondary_specialization_id ? (specMap[r.secondary_specialization_id] ?? null) : null,
  }));
}

export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'instructor_code' });

  let q = supabase.from('instructor_profiles').select(SELECT_QUERY, { count: 'exact' });

  // Search by instructor code OR the instructor's user (name/email/mobile),
  // resolved to user ids first (the base SELECT has no embedded user relation).
  if (search) {
    const term = String(search).replace(/[%_\\(),]/g, '').trim();
    if (term) {
      const { data: us } = await supabase
        .from('users')
        .select('id')
        .or(`full_name.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,mobile.ilike.%${term}%`)
        .limit(1000);
      const ids = (us || []).map((u: any) => u.id);
      q = q.or(`instructor_code.ilike.%${term}%,user_id.in.(${ids.length ? ids.join(',') : 0})`);
    }
  }

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters (Phase 13 — dropped cols removed from filter set)
  if (req.query.instructor_type) q = q.eq('instructor_type', req.query.instructor_type);
  if (req.query.teaching_mode) q = q.eq('teaching_mode', req.query.teaching_mode as string);
  if (req.query.approval_status) q = q.eq('approval_status', req.query.approval_status);
  if (req.query.is_verified === 'true')  q = q.eq('is_verified', true);
  else if (req.query.is_verified === 'false') q = q.eq('is_verified', false);
  if (req.query.is_featured === 'true')  q = q.eq('is_featured', true);
  else if (req.query.is_featured === 'false') q = q.eq('is_featured', false);
  if (req.query.is_active === 'true')    q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  const enriched = await enrichProfiles(data || []);
  return paginated(res, enriched, count || 0, page, limit);
}

// GET /instructor-profiles/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('instructor_profiles').select(SELECT_QUERY).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Instructor profile not found', 404);
  const [enriched] = await enrichProfiles([data]);
  return ok(res, enriched);
}

// POST /instructor-profiles
export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  // parseBody() strips user_id (correct for update/upsert, which must not re-point
  // an existing profile) — but a create legitimately needs it from the body.
  if (req.body?.user_id != null && req.body.user_id !== '') body.user_id = parseInt(String(req.body.user_id));

  const rateErr = validateRates(body);
  if (rateErr) return err(res, rateErr, 400);
  const fieldErr = validateInstructorFields(body);
  if (fieldErr) return err(res, fieldErr, 400);

  // Verify user_id exists
  if (!body.user_id) return err(res, 'user_id is required', 400);
  const { data: user } = await supabase.from('users').select('id').eq('id', body.user_id).single();
  if (!user) return err(res, 'User not found', 404);

  // Check user doesn't already have an instructor profile
  const { data: existing } = await supabase.from('instructor_profiles').select('id').eq('user_id', body.user_id).single();
  if (existing) return err(res, 'User already has an instructor profile', 409);

  // Verify foreign keys if provided
  if (body.designation_id) {
    const { data: designation } = await supabase.from('designations').select('id').eq('id', body.designation_id).single();
    if (!designation) return err(res, 'Designation not found', 404);
  }

  if (body.department_id) {
    const { data: department } = await supabase.from('departments').select('id').eq('id', body.department_id).single();
    if (!department) return err(res, 'Department not found', 404);
  }

  if (body.branch_id) {
    const { data: branch } = await supabase.from('branches').select('id').eq('id', body.branch_id).single();
    if (!branch) return err(res, 'Branch not found', 404);
  }

  if (body.specialization_id) {
    const { data: specialization } = await supabase.from('specializations').select('id').eq('id', body.specialization_id).single();
    if (!specialization) return err(res, 'Specialization not found', 404);
  }

  if (body.secondary_specialization_id) {
    const { data: specialization } = await supabase.from('specializations').select('id').eq('id', body.secondary_specialization_id).single();
    if (!specialization) return err(res, 'Secondary specialization not found', 404);
  }

  if (body.preferred_teaching_language_id) {
    const { data: language } = await supabase.from('languages').select('id').eq('id', body.preferred_teaching_language_id).single();
    if (!language) return err(res, 'Preferred teaching language not found', 404);
  }

  if (body.approved_by) {
    const { data: approver } = await supabase.from('users').select('id').eq('id', body.approved_by).single();
    if (!approver) return err(res, 'Approved by user not found', 404);
  }

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from('instructor_profiles').insert(body).select(SELECT_QUERY).single();
  if (e) {
    if (e.code === '23505') return err(res, 'Instructor code already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'instructor_profile_created', targetType: 'instructor_profile', targetId: data.id, targetName: data.instructor_code, ip: getClientIp(req) });
  return ok(res, data, 'Instructor profile created', 201);
}

// PATCH /instructor-profiles/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('instructor_profiles').select('*').eq('id', id).single();
  if (!old) return err(res, 'Instructor profile not found', 404);

  const updates = parseBody(req);

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  const rateErr = validateRates(updates);
  if (rateErr) return err(res, rateErr, 400);
  const fieldErr = validateInstructorFields(updates);
  if (fieldErr) return err(res, fieldErr, 400);

  // Verify foreign keys if changed
  if ('designation_id' in updates && updates.designation_id !== old.designation_id && updates.designation_id) {
    const { data: designation } = await supabase.from('designations').select('id').eq('id', updates.designation_id).single();
    if (!designation) return err(res, 'Designation not found', 404);
  }

  if ('department_id' in updates && updates.department_id !== old.department_id && updates.department_id) {
    const { data: department } = await supabase.from('departments').select('id').eq('id', updates.department_id).single();
    if (!department) return err(res, 'Department not found', 404);
  }

  if ('branch_id' in updates && updates.branch_id !== old.branch_id && updates.branch_id) {
    const { data: branch } = await supabase.from('branches').select('id').eq('id', updates.branch_id).single();
    if (!branch) return err(res, 'Branch not found', 404);
  }

  if ('specialization_id' in updates && updates.specialization_id !== old.specialization_id && updates.specialization_id) {
    const { data: specialization } = await supabase.from('specializations').select('id').eq('id', updates.specialization_id).single();
    if (!specialization) return err(res, 'Specialization not found', 404);
  }

  if ('secondary_specialization_id' in updates && updates.secondary_specialization_id !== old.secondary_specialization_id && updates.secondary_specialization_id) {
    const { data: specialization } = await supabase.from('specializations').select('id').eq('id', updates.secondary_specialization_id).single();
    if (!specialization) return err(res, 'Secondary specialization not found', 404);
  }

  if ('preferred_teaching_language_id' in updates && updates.preferred_teaching_language_id !== old.preferred_teaching_language_id && updates.preferred_teaching_language_id) {
    const { data: language } = await supabase.from('languages').select('id').eq('id', updates.preferred_teaching_language_id).single();
    if (!language) return err(res, 'Preferred teaching language not found', 404);
  }

  if ('approved_by' in updates && updates.approved_by !== old.approved_by && updates.approved_by) {
    const { data: approver } = await supabase.from('users').select('id').eq('id', updates.approved_by).single();
    if (!approver) return err(res, 'Approved by user not found', 404);
  }

  updates.updated_by = req.user!.id;

  const { data, error: e } = await supabase.from('instructor_profiles').update(updates).eq('id', id).select(SELECT_QUERY).single();
  if (e) {
    if (e.code === '23505') return err(res, 'Instructor code already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache();

  logAdmin({ actorId: req.user!.id, action: 'instructor_profile_updated', targetType: 'instructor_profile', targetId: id, targetName: old.instructor_code, changes, ip: getClientIp(req) });
  return ok(res, data, 'Instructor profile updated');
}

// DELETE /instructor-profiles/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('instructor_profiles').select('instructor_code, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Instructor profile not found', 404);
  if (old.deleted_at) return err(res, 'Instructor profile is already in trash', 400);

  const { data, error: e } = await supabase
    .from('instructor_profiles')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'instructor_profile_soft_deleted', targetType: 'instructor_profile', targetId: id, targetName: old.instructor_code, ip: getClientIp(req) });
  return ok(res, data, 'Instructor profile moved to trash');
}

// PATCH /instructor-profiles/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('instructor_profiles').select('instructor_code, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Instructor profile not found', 404);
  if (!old.deleted_at) return err(res, 'Instructor profile is not in trash', 400);

  const { data, error: e } = await supabase
    .from('instructor_profiles')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'instructor_profile_restored', targetType: 'instructor_profile', targetId: id, targetName: old.instructor_code, ip: getClientIp(req) });
  return ok(res, data, 'Instructor profile restored');
}

// DELETE /instructor-profiles/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('instructor_profiles').select('instructor_code').eq('id', id).single();
  if (!old) return err(res, 'Instructor profile not found', 404);

  const { error: e } = await supabase.from('instructor_profiles').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'instructor_profile_deleted', targetType: 'instructor_profile', targetId: id, targetName: old.instructor_code, ip: getClientIp(req) });
  return ok(res, null, 'Instructor profile deleted');
}

// GET /instructor-profiles/user/:userId
export async function getByUserId(req: Request, res: Response) {
  const userId = parseInt(req.params.userId);
  const { data, error: e } = await supabase.from('instructor_profiles')
    .select(SELECT_QUERY)
    .eq('user_id', userId)
    .maybeSingle();
  if (e) return err(res, e.message, 500);
  return ok(res, data);
}

// PUT /instructor-profiles/user/:userId (upsert by user ID)
export async function upsertByUserId(req: Request, res: Response) {
  const userId = parseInt(req.params.userId);
  const { data: user } = await supabase.from('users').select('id, full_name').eq('id', userId).single();
  if (!user) return err(res, 'User not found', 404);

  const body = parseBody(req);

  const rateErr = validateRates(body);
  if (rateErr) return err(res, rateErr, 400);
  const fieldErr = validateInstructorFields(body);
  if (fieldErr) return err(res, fieldErr, 400);

  const { data: existing } = await supabase.from('instructor_profiles').select('id').eq('user_id', userId).maybeSingle();

  let data: any;
  let action: string;

  if (existing) {
    const { data: updated, error: e } = await supabase.from('instructor_profiles')
      .update({ ...body, updated_by: req.user!.id })
      .eq('user_id', userId)
      .select(SELECT_QUERY)
      .single();
    if (e) return err(res, e.message, 500);
    data = updated;
    action = 'instructor_profile_updated';
  } else {
    const { data: created, error: e } = await supabase.from('instructor_profiles')
      .insert({ ...body, user_id: userId, created_by: req.user!.id })
      .select(SELECT_QUERY)
      .single();
    if (e) {
      if (e.code === '23505') return err(res, 'Instructor profile already exists for this user', 409);
      return err(res, e.message, 500);
    }
    data = created;
    action = 'instructor_profile_created';
  }

  logAdmin({ actorId: req.user!.id, action, targetType: 'instructor_profile', targetId: userId, targetName: user.full_name, ip: getClientIp(req) });
  return ok(res, data, existing ? 'Profile updated' : 'Profile created');
}
