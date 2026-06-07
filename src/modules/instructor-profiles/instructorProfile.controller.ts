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

  // Phase 13 — drop fields that no longer exist on the trimmed table.
  const DROPPED_AT_PHASE13 = [
    'tagline','instructor_bio','demo_video_url','intro_video_duration_sec',
    'teaching_mode','teaching_experience_years','total_teaching_hours','industry_experience_years',
    'specialization_id','secondary_specialization_id','preferred_teaching_language_id','preferred_time_slots',
    'highest_qualification','certifications_summary','awards_and_recognition',
    'max_concurrent_courses','available_from','available_until','available_hours_per_week','is_available',
    'total_courses_created','total_courses_published','total_students_taught',
    'completion_rate','total_content_minutes','patents_count','publications_count',
    'joining_date','branch_id','department_id','designation_id','total_experience_years',
  ];
  for (const f of DROPPED_AT_PHASE13) delete body[f];

  // Parse booleans
  if (typeof body.is_active === 'string')    body.is_active   = body.is_active   === 'true';
  if (typeof body.is_verified === 'string')  body.is_verified = body.is_verified === 'true';
  if (typeof body.is_featured === 'string')  body.is_featured = body.is_featured === 'true';
  if (typeof body.pan_verified === 'string') body.pan_verified = body.pan_verified === 'true';

  // Parse numbers
  if (typeof body.total_reviews_received === 'string') body.total_reviews_received = parseInt(body.total_reviews_received) || null;
  if (typeof body.approved_by === 'string')            body.approved_by = parseInt(body.approved_by) || null;

  // Empty strings to null
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
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
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'instructor_code' });

  let q = supabase.from('instructor_profiles').select(SELECT_QUERY, { count: 'exact' });

  // Search
  if (search) q = q.or(`instructor_code.ilike.%${search}%,user.full_name.ilike.%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters (Phase 13 — dropped cols removed from filter set)
  if (req.query.instructor_type) q = q.eq('instructor_type', req.query.instructor_type);
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
  return paginated(res, data || [], count || 0, page, limit);
}

// GET /instructor-profiles/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('instructor_profiles').select(SELECT_QUERY).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Instructor profile not found', 404);
  return ok(res, data);
}

// POST /instructor-profiles
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

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
