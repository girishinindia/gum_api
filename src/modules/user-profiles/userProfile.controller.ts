import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { config } from '../../config';
import { processAndUploadImage, deleteImage } from '../../services/storage.service';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { upsertUserProfileSchema } from './userProfile.schema';

function extractBunnyPath(cdnUrl: string): string {
  return cdnUrl.replace(config.bunny.cdnUrl + '/', '').split('?')[0];
}

// Fields used for profile completion calculation
const COMPLETION_FIELDS = [
  'date_of_birth', 'gender', 'blood_group', 'marital_status',
  'profile_image_url',
  'permanent_address_line1', 'permanent_city_id', 'permanent_state_id', 'permanent_country_id', 'permanent_postal_code',
  'current_address_line1', 'current_city_id', 'current_state_id', 'current_country_id', 'current_postal_code',
  'alternate_email', 'alternate_phone',
  'emergency_contact_name', 'emergency_contact_phone',
  'aadhar_number', 'pan_number',
  'bank_account_name', 'bank_account_number', 'bank_ifsc_code', 'bank_name',
  'preferred_language_id',
];

function calculateCompletion(profile: any): number {
  let filled = 0;
  for (const f of COMPLETION_FIELDS) {
    if (profile[f] !== null && profile[f] !== undefined && profile[f] !== '') filled++;
  }
  return Math.round((filled / COMPLETION_FIELDS.length) * 100);
}

// SELECT columns for profile queries (with joined names)
const PROFILE_SELECT = `
  *,
  permanent_country:countries!user_profiles_permanent_country_id_fkey(id, name),
  permanent_state:states!user_profiles_permanent_state_id_fkey(id, name),
  permanent_city:cities!user_profiles_permanent_city_id_fkey(id, name),
  current_country:countries!user_profiles_current_country_id_fkey(id, name),
  current_state:states!user_profiles_current_state_id_fkey(id, name),
  current_city:cities!user_profiles_current_city_id_fkey(id, name),
  preferred_language:languages!user_profiles_preferred_language_id_fkey(id, name),
  user:users!user_profiles_user_id_fkey(id, full_name, email, mobile, avatar_url, status)
`;

// ── List all profiles (admin) ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'id' });

  let q = supabase.from('user_profiles').select(PROFILE_SELECT, { count: 'exact' });

  if (req.query.show_deleted === 'true') {
    q = q.not('deleted_at', 'is', null);
  } else {
    q = q.is('deleted_at', null);
  }

  // Search by user info — we search through the user relation
  if (search) {
    // Get user IDs matching search
    const { data: users } = await supabase.from('users')
      .select('id')
      .or(`full_name.ilike.%${search}%,email.ilike.%${search}%,mobile.ilike.%${search}%`);
    if (users && users.length > 0) {
      q = q.in('user_id', users.map(u => u.id));
    } else {
      return paginated(res, [], 0, page, limit);
    }
  }

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);

  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// ── Get profile by user ID (admin) ──
export async function getByUserId(req: Request, res: Response) {
  const userId = parseInt(req.params.userId);
  const { data, error: e } = await supabase.from('user_profiles')
    .select(PROFILE_SELECT)
    .eq('user_id', userId)
    .maybeSingle();
  if (e) return err(res, e.message, 500);
  // Return null data if no profile yet (not an error — profile will be created on first save)
  return ok(res, data);
}

// ── Upsert profile for a user (admin) ──
export async function upsert(req: Request, res: Response) {
  const userId = parseInt(req.params.userId);

  // Verify user exists
  const { data: user } = await supabase.from('users').select('id, email').eq('id', userId).single();
  if (!user) return err(res, 'User not found', 404);

  const parsed = upsertUserProfileSchema.safeParse(req.body);
  if (!parsed.success) return err(res, parsed.error.errors.map(e => e.message).join(', '), 400);

  const updates: any = { ...parsed.data, updated_by: req.user!.id };

  // Handle profile image upload — upload NEW image first, then delete old one
  let uploadedProfileImage = false;
  let uploadedCoverImage = false;
  if (req.files && typeof req.files === 'object') {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    if (files.profile_image?.[0]) {
      const file = files.profile_image[0];
      try {
        const path = `profiles/user-${userId}-profile-${Date.now()}.webp`;
        const newUrl = await processAndUploadImage(file.buffer, path, { width: 500, height: 500, quality: 85 });
        // Upload succeeded — now safe to delete old image
        const { data: existing } = await supabase.from('user_profiles').select('profile_image_url').eq('user_id', userId).maybeSingle();
        if (existing?.profile_image_url) {
          try { await deleteImage(extractBunnyPath(existing.profile_image_url)); } catch {}
        }
        updates.profile_image_url = newUrl;
        uploadedProfileImage = true;
      } catch (e: any) {
        console.error('[PROFILE] Failed to upload profile image:', e.message);
        return err(res, 'Failed to upload profile image', 500);
      }
    }
    if (files.cover_image?.[0]) {
      const file = files.cover_image[0];
      try {
        const path = `profiles/user-${userId}-cover-${Date.now()}.webp`;
        const newUrl = await processAndUploadImage(file.buffer, path, { width: 1200, height: 400, quality: 85 });
        // Upload succeeded — now safe to delete old image
        const { data: existing } = await supabase.from('user_profiles').select('cover_image_url').eq('user_id', userId).maybeSingle();
        if (existing?.cover_image_url) {
          try { await deleteImage(extractBunnyPath(existing.cover_image_url)); } catch {}
        }
        updates.cover_image_url = newUrl;
        uploadedCoverImage = true;
      } catch (e: any) {
        console.error('[PROFILE] Failed to upload cover image:', e.message);
        return err(res, 'Failed to upload cover image', 500);
      }
    }
  }

  // Handle explicit image removal (only if no new file was uploaded for that field)
  if (!uploadedProfileImage && (req.body.profile_image_url === 'null' || req.body.profile_image_url === null)) {
    const { data: existing } = await supabase.from('user_profiles').select('profile_image_url').eq('user_id', userId).maybeSingle();
    if (existing?.profile_image_url) {
      try { await deleteImage(extractBunnyPath(existing.profile_image_url)); } catch {}
    }
    updates.profile_image_url = null;
  }
  if (!uploadedCoverImage && (req.body.cover_image_url === 'null' || req.body.cover_image_url === null)) {
    const { data: existing } = await supabase.from('user_profiles').select('cover_image_url').eq('user_id', userId).maybeSingle();
    if (existing?.cover_image_url) {
      try { await deleteImage(extractBunnyPath(existing.cover_image_url)); } catch {}
    }
    updates.cover_image_url = null;
  }

  // Check if profile exists
  const { data: existing } = await supabase.from('user_profiles').select('id').eq('user_id', userId).maybeSingle();

  let data: any;
  let action: string;

  if (existing) {
    // Update
    const { data: updated, error: e } = await supabase.from('user_profiles')
      .update(updates)
      .eq('user_id', userId)
      .select(PROFILE_SELECT)
      .single();
    if (e) return err(res, e.message, 500);
    data = updated;
    action = 'user_profile_updated';
  } else {
    // Create
    updates.user_id = userId;
    updates.created_by = req.user!.id;
    const { data: created, error: e } = await supabase.from('user_profiles')
      .insert(updates)
      .select(PROFILE_SELECT)
      .single();
    if (e) return err(res, e.message, 500);
    data = created;
    action = 'user_profile_created';
  }

  // Update profile completion percentage
  const completion = calculateCompletion(data);
  if (completion !== data.profile_completion_percentage) {
    await supabase.from('user_profiles').update({ profile_completion_percentage: completion }).eq('user_id', userId);
    data.profile_completion_percentage = completion;
  }

  logAdmin({
    actorId: req.user!.id,
    action,
    targetType: 'user_profile',
    targetId: userId,
    targetName: user.email,
    ip: getClientIp(req),
  });

  return ok(res, data, existing ? 'Profile updated' : 'Profile created');
}

// ── Get my profile (logged-in user) ──
export async function getMyProfile(req: Request, res: Response) {
  const userId = req.user!.id;
  const { data, error: e } = await supabase.from('user_profiles')
    .select(PROFILE_SELECT)
    .eq('user_id', userId)
    .maybeSingle();
  if (e) return err(res, e.message, 500);
  return ok(res, data);
}

// ── Update my profile (logged-in user) ──
export async function updateMyProfile(req: Request, res: Response) {
  req.params.userId = String(req.user!.id);
  return upsert(req, res);
}

// ── Soft delete profile (admin) ──
export async function softDelete(req: Request, res: Response) {
  const userId = parseInt(req.params.userId);
  const { data: profile } = await supabase.from('user_profiles').select('id, deleted_at').eq('user_id', userId).maybeSingle();
  if (!profile) return err(res, 'Profile not found', 404);
  if (profile.deleted_at) return err(res, 'Profile is already in trash', 400);

  const { error: e } = await supabase.from('user_profiles')
    .update({ deleted_at: new Date().toISOString(), deleted_by: req.user!.id })
    .eq('user_id', userId);
  if (e) return err(res, e.message, 500);

  logAdmin({ actorId: req.user!.id, action: 'user_profile_soft_deleted', targetType: 'user_profile', targetId: userId, ip: getClientIp(req) });
  return ok(res, null, 'Profile moved to trash');
}

// ── Restore profile (admin) ──
export async function restore(req: Request, res: Response) {
  const userId = parseInt(req.params.userId);
  const { data: profile } = await supabase.from('user_profiles').select('id, deleted_at').eq('user_id', userId).maybeSingle();
  if (!profile) return err(res, 'Profile not found', 404);
  if (!profile.deleted_at) return err(res, 'Profile is not in trash', 400);

  const { error: e } = await supabase.from('user_profiles')
    .update({ deleted_at: null, deleted_by: null })
    .eq('user_id', userId);
  if (e) return err(res, e.message, 500);

  logAdmin({ actorId: req.user!.id, action: 'user_profile_restored', targetType: 'user_profile', targetId: userId, ip: getClientIp(req) });
  return ok(res, null, 'Profile restored');
}

// ── Permanent delete (admin) ──
export async function remove(req: Request, res: Response) {
  const userId = parseInt(req.params.userId);
  const { data: profile } = await supabase.from('user_profiles').select('id, profile_image_url, cover_image_url').eq('user_id', userId).maybeSingle();
  if (!profile) return err(res, 'Profile not found', 404);

  // Clean up images
  if (profile.profile_image_url) {
    try { await deleteImage(extractBunnyPath(profile.profile_image_url)); } catch {}
  }
  if (profile.cover_image_url) {
    try { await deleteImage(extractBunnyPath(profile.cover_image_url)); } catch {}
  }

  const { error: e } = await supabase.from('user_profiles').delete().eq('user_id', userId);
  if (e) return err(res, e.message, 500);

  logAdmin({ actorId: req.user!.id, action: 'user_profile_deleted', targetType: 'user_profile', targetId: userId, ip: getClientIp(req) });
  return ok(res, null, 'Profile permanently deleted');
}
