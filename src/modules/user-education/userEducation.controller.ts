import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { config } from '../../config';
import { processAndUploadImage, deleteImage } from '../../services/storage.service';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { createUserEducationSchema, updateUserEducationSchema } from './userEducation.schema';

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

const SELECT_WITH_JOINS = `
  *,
  education_level:education_levels(id, name),
  user:users!user_education_user_id_fkey(id, full_name, email)
`;

// ── List ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'id' });

  let q = supabase.from('user_education').select(SELECT_WITH_JOINS, { count: 'exact' });

  // Soft-delete filter
  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Filter by user
  if (req.query.user_id) q = q.eq('user_id', Number(req.query.user_id));

  // Filter by education level
  if (req.query.education_level_id) q = q.eq('education_level_id', Number(req.query.education_level_id));

  // Search
  if (search) {
    q = q.or(`institution_name.ilike.%${search}%,field_of_study.ilike.%${search}%,board_or_university.ilike.%${search}%,specialization.ilike.%${search}%`);
  }

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// ── Get by ID ──
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from('user_education')
    .select(SELECT_WITH_JOINS)
    .eq('id', req.params.id)
    .single();
  if (e || !data) return err(res, 'Education record not found', 404);
  return ok(res, data);
}

// ── Create ──
export async function create(req: Request, res: Response) {
  const parsed = createUserEducationSchema.safeParse(req.body);
  if (!parsed.success) return err(res, parsed.error.errors.map(e => e.message).join(', '), 400);

  const payload: any = { ...parsed.data, created_by: req.user!.id };

  // Handle certificate upload
  if (req.file) {
    const path = `certificates/user-${payload.user_id}-edu-${Date.now()}.webp`;
    payload.certificate_url = await processAndUploadImage(req.file.buffer, path, { width: 1200, height: 1600, quality: 85 });
  }

  // If marking as highest, unset others for this user
  if (payload.is_highest_qualification) {
    await supabase.from('user_education')
      .update({ is_highest_qualification: false })
      .eq('user_id', payload.user_id)
      .eq('is_highest_qualification', true);
  }

  const { data, error: e } = await supabase.from('user_education')
    .insert(payload)
    .select(SELECT_WITH_JOINS)
    .single();
  if (e) return err(res, e.message, 500);

  logAdmin({ actorId: req.user!.id, action: 'user_education_created', targetType: 'user_education', targetId: data.id, targetName: data.institution_name, ip: getClientIp(req) });
  return ok(res, data, 'Education record created', 201);
}

// ── Update ──
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_education').select('*').eq('id', id).single();
  if (!old) return err(res, 'Education record not found', 404);

  const parsed = updateUserEducationSchema.safeParse(req.body);
  if (!parsed.success) return err(res, parsed.error.errors.map(e => e.message).join(', '), 400);

  const updates: any = { ...parsed.data, updated_by: req.user!.id };

  // Handle certificate upload
  if (req.file) {
    if (old.certificate_url) {
      try { await deleteImage(extractBunnyPath(old.certificate_url)); } catch {}
    }
    const path = `certificates/user-${old.user_id}-edu-${id}.webp`;
    updates.certificate_url = await processAndUploadImage(req.file.buffer, path, { width: 1200, height: 1600, quality: 85 });
  }

  // Explicit certificate removal
  if (!req.file && (req.body.certificate_url === 'null' || req.body.certificate_url === null)) {
    if (old.certificate_url) {
      try { await deleteImage(extractBunnyPath(old.certificate_url)); } catch {}
    }
    updates.certificate_url = null;
  }

  // If marking as highest, unset others for this user
  if (updates.is_highest_qualification === true) {
    await supabase.from('user_education')
      .update({ is_highest_qualification: false })
      .eq('user_id', old.user_id)
      .eq('is_highest_qualification', true)
      .neq('id', id);
  }

  const { data, error: e } = await supabase.from('user_education')
    .update(updates)
    .eq('id', id)
    .select(SELECT_WITH_JOINS)
    .single();
  if (e) return err(res, e.message, 500);

  logAdmin({ actorId: req.user!.id, action: 'user_education_updated', targetType: 'user_education', targetId: id, targetName: data.institution_name, ip: getClientIp(req) });
  return ok(res, data, 'Education record updated');
}

// ── Soft Delete ──
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_education').select('id, institution_name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Record not found', 404);
  if (old.deleted_at) return err(res, 'Record is already in trash', 400);

  const { error: e } = await supabase.from('user_education')
    .update({ deleted_at: new Date().toISOString(), deleted_by: req.user!.id })
    .eq('id', id);
  if (e) return err(res, e.message, 500);

  logAdmin({ actorId: req.user!.id, action: 'user_education_soft_deleted', targetType: 'user_education', targetId: id, targetName: old.institution_name, ip: getClientIp(req) });
  return ok(res, null, 'Education record moved to trash');
}

// ── Restore ──
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_education').select('id, institution_name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Record not found', 404);
  if (!old.deleted_at) return err(res, 'Record is not in trash', 400);

  const { error: e } = await supabase.from('user_education')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', id);
  if (e) return err(res, e.message, 500);

  logAdmin({ actorId: req.user!.id, action: 'user_education_restored', targetType: 'user_education', targetId: id, targetName: old.institution_name, ip: getClientIp(req) });
  return ok(res, null, 'Education record restored');
}

// ── Permanent Delete ──
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_education').select('id, institution_name, certificate_url').eq('id', id).single();
  if (!old) return err(res, 'Record not found', 404);

  if (old.certificate_url) {
    try { await deleteImage(extractBunnyPath(old.certificate_url)); } catch {}
  }

  const { error: e } = await supabase.from('user_education').delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  logAdmin({ actorId: req.user!.id, action: 'user_education_deleted', targetType: 'user_education', targetId: id, targetName: old.institution_name, ip: getClientIp(req) });
  return ok(res, null, 'Education record permanently deleted');
}

// ════════════════════════════════════════════════════════════
// ── Self-service "My Education" endpoints ──
// ════════════════════════════════════════════════════════════

// ── List My Education ──
export async function listMyEducation(req: Request, res: Response) {
  const userId = req.user!.id;
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'start_date' });

  let q = supabase.from('user_education').select(SELECT_WITH_JOINS, { count: 'exact' }).eq('user_id', userId);

  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }
  if (req.query.education_level_id) q = q.eq('education_level_id', Number(req.query.education_level_id));
  if (search) {
    q = q.or(`institution_name.ilike.%${search}%,field_of_study.ilike.%${search}%,board_or_university.ilike.%${search}%,specialization.ilike.%${search}%`);
  }
  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// ── Get My Education by ID ──
export async function getMyEducationById(req: Request, res: Response) {
  const userId = req.user!.id;
  const { data, error: e } = await supabase.from('user_education')
    .select(SELECT_WITH_JOINS)
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();
  if (e || !data) return err(res, 'Education record not found', 404);
  return ok(res, data);
}

// ── Create My Education ──
export async function createMyEducation(req: Request, res: Response) {
  const userId = req.user!.id;
  // Override user_id to current user regardless of what was sent
  req.body.user_id = userId;

  const parsed = createUserEducationSchema.safeParse(req.body);
  if (!parsed.success) return err(res, parsed.error.errors.map(e => e.message).join(', '), 400);

  const payload: any = { ...parsed.data, user_id: userId, created_by: userId };

  if (req.file) {
    const path = `certificates/user-${userId}-edu-${Date.now()}.webp`;
    payload.certificate_url = await processAndUploadImage(req.file.buffer, path, { width: 1200, height: 1600, quality: 85 });
  }

  if (payload.is_highest_qualification) {
    await supabase.from('user_education')
      .update({ is_highest_qualification: false })
      .eq('user_id', userId)
      .eq('is_highest_qualification', true);
  }

  const { data, error: e } = await supabase.from('user_education')
    .insert(payload)
    .select(SELECT_WITH_JOINS)
    .single();
  if (e) return err(res, e.message, 500);

  logAdmin({ actorId: userId, action: 'user_education_created', targetType: 'user_education', targetId: data.id, targetName: data.institution_name, ip: getClientIp(req) });
  return ok(res, data, 'Education record created', 201);
}

// ── Update My Education ──
export async function updateMyEducation(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = parseInt(req.params.id);

  // Ensure the record belongs to the current user
  const { data: old } = await supabase.from('user_education').select('*').eq('id', id).eq('user_id', userId).single();
  if (!old) return err(res, 'Education record not found', 404);

  const parsed = updateUserEducationSchema.safeParse(req.body);
  if (!parsed.success) return err(res, parsed.error.errors.map(e => e.message).join(', '), 400);

  const updates: any = { ...parsed.data, updated_by: userId };

  if (req.file) {
    if (old.certificate_url) {
      try { await deleteImage(extractBunnyPath(old.certificate_url)); } catch {}
    }
    const path = `certificates/user-${userId}-edu-${id}.webp`;
    updates.certificate_url = await processAndUploadImage(req.file.buffer, path, { width: 1200, height: 1600, quality: 85 });
  }

  if (!req.file && (req.body.certificate_url === 'null' || req.body.certificate_url === null)) {
    if (old.certificate_url) {
      try { await deleteImage(extractBunnyPath(old.certificate_url)); } catch {}
    }
    updates.certificate_url = null;
  }

  if (updates.is_highest_qualification === true) {
    await supabase.from('user_education')
      .update({ is_highest_qualification: false })
      .eq('user_id', userId)
      .eq('is_highest_qualification', true)
      .neq('id', id);
  }

  const { data, error: e } = await supabase.from('user_education')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select(SELECT_WITH_JOINS)
    .single();
  if (e) return err(res, e.message, 500);

  logAdmin({ actorId: userId, action: 'user_education_updated', targetType: 'user_education', targetId: id, targetName: data.institution_name, ip: getClientIp(req) });
  return ok(res, data, 'Education record updated');
}

// ── Soft Delete My Education ──
export async function softDeleteMyEducation(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_education').select('id, institution_name, deleted_at').eq('id', id).eq('user_id', userId).single();
  if (!old) return err(res, 'Record not found', 404);
  if (old.deleted_at) return err(res, 'Record is already in trash', 400);

  const { error: e } = await supabase.from('user_education')
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq('id', id)
    .eq('user_id', userId);
  if (e) return err(res, e.message, 500);

  logAdmin({ actorId: userId, action: 'user_education_soft_deleted', targetType: 'user_education', targetId: id, targetName: old.institution_name, ip: getClientIp(req) });
  return ok(res, null, 'Education record moved to trash');
}

// ── Restore My Education ──
export async function restoreMyEducation(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_education').select('id, institution_name, deleted_at').eq('id', id).eq('user_id', userId).single();
  if (!old) return err(res, 'Record not found', 404);
  if (!old.deleted_at) return err(res, 'Record is not in trash', 400);

  const { error: e } = await supabase.from('user_education')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', id)
    .eq('user_id', userId);
  if (e) return err(res, e.message, 500);

  logAdmin({ actorId: userId, action: 'user_education_restored', targetType: 'user_education', targetId: id, targetName: old.institution_name, ip: getClientIp(req) });
  return ok(res, null, 'Education record restored');
}

// ── Permanent Delete My Education ──
export async function removeMyEducation(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from('user_education').select('id, institution_name, certificate_url').eq('id', id).eq('user_id', userId).single();
  if (!old) return err(res, 'Record not found', 404);

  if (old.certificate_url) {
    try { await deleteImage(extractBunnyPath(old.certificate_url)); } catch {}
  }

  const { error: e } = await supabase.from('user_education').delete().eq('id', id).eq('user_id', userId);
  if (e) return err(res, e.message, 500);

  logAdmin({ actorId: userId, action: 'user_education_deleted', targetType: 'user_education', targetId: id, targetName: old.institution_name, ip: getClientIp(req) });
  return ok(res, null, 'Education record permanently deleted');
}
