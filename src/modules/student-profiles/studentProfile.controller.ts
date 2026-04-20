import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { hasPermission } from '../../middleware/rbac';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';

const CACHE_KEY = 'student_profiles:all';
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

  // Booleans
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.is_currently_studying === 'string') body.is_currently_studying = body.is_currently_studying === 'true';
  if (typeof body.has_active_subscription === 'string') body.has_active_subscription = body.has_active_subscription === 'true';
  if (typeof body.is_seeking_job === 'string') body.is_seeking_job = body.is_seeking_job === 'true';
  if (typeof body.is_open_to_internship === 'string') body.is_open_to_internship = body.is_open_to_internship === 'true';
  if (typeof body.is_open_to_freelance === 'string') body.is_open_to_freelance = body.is_open_to_freelance === 'true';

  // Numbers (BIGINT / INT)
  if (typeof body.education_level_id === 'string') body.education_level_id = parseInt(body.education_level_id) || null;
  if (typeof body.learning_goal_id === 'string') body.learning_goal_id = parseInt(body.learning_goal_id) || null;
  if (typeof body.specialization_id === 'string') body.specialization_id = parseInt(body.specialization_id) || null;
  if (typeof body.preferred_learning_language_id === 'string') body.preferred_learning_language_id = parseInt(body.preferred_learning_language_id) || null;
  if (typeof body.referred_by_user_id === 'string') body.referred_by_user_id = parseInt(body.referred_by_user_id) || null;
  if (typeof body.weekly_available_days === 'string') body.weekly_available_days = parseInt(body.weekly_available_days) || null;
  if (typeof body.courses_enrolled === 'string') body.courses_enrolled = parseInt(body.courses_enrolled) || null;
  if (typeof body.courses_completed === 'string') body.courses_completed = parseInt(body.courses_completed) || null;
  if (typeof body.courses_in_progress === 'string') body.courses_in_progress = parseInt(body.courses_in_progress) || null;
  if (typeof body.certificates_earned === 'string') body.certificates_earned = parseInt(body.certificates_earned) || null;
  if (typeof body.current_streak_days === 'string') body.current_streak_days = parseInt(body.current_streak_days) || null;
  if (typeof body.longest_streak_days === 'string') body.longest_streak_days = parseInt(body.longest_streak_days) || null;
  if (typeof body.xp_points === 'string') body.xp_points = parseInt(body.xp_points) || null;
  if (typeof body.level === 'string') body.level = parseInt(body.level) || null;

  // Empty strings to null
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// GET /student-profiles?page=1&limit=20&search=foo&sort=enrollment_number&order=asc
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });

  let q = supabase.from('student_profiles').select(SELECT_QUERY, { count: 'exact' });

  // Search
  if (search) q = q.or(`enrollment_number.ilike.%${search}%,user.full_name.ilike.%${search}%`);

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filters
  if (req.query.enrollment_type) q = q.eq('enrollment_type', req.query.enrollment_type);
  if (req.query.subscription_plan) q = q.eq('subscription_plan', req.query.subscription_plan);
  if (req.query.difficulty_preference) q = q.eq('difficulty_preference', req.query.difficulty_preference);
  if (req.query.is_active === 'true') q = q.eq('is_active', true);
  else if (req.query.is_active === 'false') q = q.eq('is_active', false);
  if (req.query.education_level_id) q = q.eq('education_level_id', req.query.education_level_id);
  if (req.query.specialization_id) q = q.eq('specialization_id', req.query.specialization_id);

  // Sort + paginate
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// GET /student-profiles/:id
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('student_profiles').select(SELECT_QUERY).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Student profile not found', 404);
  return ok(res, data);
}

// POST /student-profiles
export async function create(req: Request, res: Response) {
  const body = parseBody(req);

  // Verify user_id exists
  if (!body.user_id) return err(res, 'user_id is required', 400);
  const { data: user } = await supabase.from('users').select('id').eq('id', body.user_id).single();
  if (!user) return err(res, 'User not found', 404);

  // Verify user has no existing student profile
  const { data: existing } = await supabase.from('student_profiles').select('id').eq('user_id', body.user_id).single();
  if (existing) return err(res, 'Student profile already exists for this user', 409);

  // Verify foreign keys if provided
  if (body.education_level_id) {
    const { data: ref } = await supabase.from('education_levels').select('id').eq('id', body.education_level_id).single();
    if (!ref) return err(res, 'Education level not found', 404);
  }

  if (body.learning_goal_id) {
    const { data: ref } = await supabase.from('learning_goals').select('id').eq('id', body.learning_goal_id).single();
    if (!ref) return err(res, 'Learning goal not found', 404);
  }

  if (body.specialization_id) {
    const { data: ref } = await supabase.from('specializations').select('id').eq('id', body.specialization_id).single();
    if (!ref) return err(res, 'Specialization not found', 404);
  }

  if (body.preferred_learning_language_id) {
    const { data: ref } = await supabase.from('languages').select('id').eq('id', body.preferred_learning_language_id).single();
    if (!ref) return err(res, 'Language not found', 404);
  }

  if (body.referred_by_user_id) {
    const { data: ref } = await supabase.from('users').select('id').eq('id', body.referred_by_user_id).single();
    if (!ref) return err(res, 'Referred-by user not found', 404);
  }

  body.created_by = req.user!.id;

  const { data, error: e } = await supabase.from('student_profiles').insert(body).select(SELECT_QUERY).single();
  if (e) {
    if (e.code === '23505') return err(res, 'Enrollment number already exists', 409);
    return err(res, e.message, 500);
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'student_profile_created', targetType: 'student_profile', targetId: data.id, targetName: data.enrollment_number, ip: getClientIp(req) });
  return ok(res, data, 'Student profile created', 201);
}

// PATCH /student-profiles/:id
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('student_profiles').select('*').eq('id', id).single();
  if (!old) return err(res, 'Student profile not found', 404);

  const updates = parseBody(req);

  if (Object.keys(updates).length === 0) return err(res, 'Nothing to update', 400);

  // Verify foreign keys if changed
  if ('education_level_id' in updates && updates.education_level_id !== old.education_level_id && updates.education_level_id) {
    const { data: ref } = await supabase.from('education_levels').select('id').eq('id', updates.education_level_id).single();
    if (!ref) return err(res, 'Education level not found', 404);
  }

  if ('learning_goal_id' in updates && updates.learning_goal_id !== old.learning_goal_id && updates.learning_goal_id) {
    const { data: ref } = await supabase.from('learning_goals').select('id').eq('id', updates.learning_goal_id).single();
    if (!ref) return err(res, 'Learning goal not found', 404);
  }

  if ('specialization_id' in updates && updates.specialization_id !== old.specialization_id && updates.specialization_id) {
    const { data: ref } = await supabase.from('specializations').select('id').eq('id', updates.specialization_id).single();
    if (!ref) return err(res, 'Specialization not found', 404);
  }

  if ('preferred_learning_language_id' in updates && updates.preferred_learning_language_id !== old.preferred_learning_language_id && updates.preferred_learning_language_id) {
    const { data: ref } = await supabase.from('languages').select('id').eq('id', updates.preferred_learning_language_id).single();
    if (!ref) return err(res, 'Language not found', 404);
  }

  if ('referred_by_user_id' in updates && updates.referred_by_user_id !== old.referred_by_user_id && updates.referred_by_user_id) {
    const { data: ref } = await supabase.from('users').select('id').eq('id', updates.referred_by_user_id).single();
    if (!ref) return err(res, 'Referred-by user not found', 404);
  }

  updates.updated_by = req.user!.id;

  const { data, error: e } = await supabase.from('student_profiles').update(updates).eq('id', id).select(SELECT_QUERY).single();
  if (e) {
    if (e.code === '23505') return err(res, 'Enrollment number already exists', 409);
    return err(res, e.message, 500);
  }

  const changes: any = {};
  for (const k of Object.keys(updates)) {
    if (JSON.stringify((old as any)[k]) !== JSON.stringify(updates[k])) {
      changes[k] = { old: (old as any)[k], new: updates[k] };
    }
  }

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'student_profile_updated', targetType: 'student_profile', targetId: id, targetName: old.enrollment_number, changes, ip: getClientIp(req) });
  return ok(res, data, 'Student profile updated');
}

// DELETE /student-profiles/:id (soft delete)
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('student_profiles').select('enrollment_number, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Student profile not found', 404);
  if (old.deleted_at) return err(res, 'Student profile is already in trash', 400);

  const { data, error: e } = await supabase
    .from('student_profiles')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'student_profile_soft_deleted', targetType: 'student_profile', targetId: id, targetName: old.enrollment_number, ip: getClientIp(req) });
  return ok(res, data, 'Student profile moved to trash');
}

// PATCH /student-profiles/:id/restore
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('student_profiles').select('enrollment_number, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Student profile not found', 404);
  if (!old.deleted_at) return err(res, 'Student profile is not in trash', 400);

  const { data, error: e } = await supabase
    .from('student_profiles')
    .update({ deleted_at: null, is_active: true })
    .eq('id', id).select().single();
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'student_profile_restored', targetType: 'student_profile', targetId: id, targetName: old.enrollment_number, ip: getClientIp(req) });
  return ok(res, data, 'Student profile restored');
}

// DELETE /student-profiles/:id/permanent
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('student_profiles').select('enrollment_number').eq('id', id).single();
  if (!old) return err(res, 'Student profile not found', 404);

  const { error: e } = await supabase.from('student_profiles').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  await clearCache();
  logAdmin({ actorId: req.user!.id, action: 'student_profile_deleted', targetType: 'student_profile', targetId: id, targetName: old.enrollment_number, ip: getClientIp(req) });
  return ok(res, null, 'Student profile deleted');
}

// GET /student-profiles/user/:userId
export async function getByUserId(req: Request, res: Response) {
  const userId = parseInt(req.params.userId);
  const { data, error: e } = await supabase.from('student_profiles')
    .select(SELECT_QUERY)
    .eq('user_id', userId)
    .maybeSingle();
  if (e) return err(res, e.message, 500);
  return ok(res, data);
}

// PUT /student-profiles/user/:userId (upsert by user ID)
export async function upsertByUserId(req: Request, res: Response) {
  const userId = parseInt(req.params.userId);
  const { data: user } = await supabase.from('users').select('id, full_name').eq('id', userId).single();
  if (!user) return err(res, 'User not found', 404);

  const body = parseBody(req);
  const { data: existing } = await supabase.from('student_profiles').select('id').eq('user_id', userId).maybeSingle();

  let data: any;
  let action: string;

  if (existing) {
    const { data: updated, error: e } = await supabase.from('student_profiles')
      .update({ ...body, updated_by: req.user!.id })
      .eq('user_id', userId)
      .select(SELECT_QUERY)
      .single();
    if (e) return err(res, e.message, 500);
    data = updated;
    action = 'student_profile_updated';
  } else {
    const { data: created, error: e } = await supabase.from('student_profiles')
      .insert({ ...body, user_id: userId, created_by: req.user!.id })
      .select(SELECT_QUERY)
      .single();
    if (e) {
      if (e.code === '23505') return err(res, 'Student profile already exists for this user', 409);
      return err(res, e.message, 500);
    }
    data = created;
    action = 'student_profile_created';
  }

  logAdmin({ actorId: req.user!.id, action, targetType: 'student_profile', targetId: userId, targetName: user.full_name, ip: getClientIp(req) });
  return ok(res, data, existing ? 'Profile updated' : 'Profile created');
}
