import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

const TABLE = 'chat_room_members';
const CACHE_KEY = 'chat_members:all';
const FK_SELECT = '*, chat_rooms(id, name, room_type), users!chat_room_members_user_id_fkey(id, first_name, last_name, email, profile_picture:avatar_url)';

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.is_muted === 'string') body.is_muted = body.is_muted === 'true';
  for (const k of ['room_id', 'user_id', 'invited_by', 'invite_id']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// ── GET /chat-members ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'joined_at' });
  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (search) q = q.or(`users.first_name.ilike.%${search}%,users.last_name.ilike.%${search}%,users.email.ilike.%${search}%`);
  if (req.query.room_id) q = q.eq('room_id', parseInt(req.query.room_id as string));
  if (req.query.user_id) q = q.eq('user_id', parseInt(req.query.user_id as string));
  if (req.query.role) q = q.eq('role', req.query.role as string);
  if (req.query.is_active !== undefined) q = q.eq('is_active', req.query.is_active === 'true');

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);
  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// ── GET /chat-members/:id ──
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Chat member not found', 404);
  return ok(res, data);
}

// ── POST /chat-members ── (Admin adds member to room)
export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  if (!body.room_id) return err(res, 'Room ID is required', 400);
  if (!body.user_id) return err(res, 'User ID is required', 400);

  // Check room exists
  const { data: room } = await supabase.from('chat_rooms').select('id, max_members').eq('id', body.room_id).single();
  if (!room) return err(res, 'Chat room not found', 404);

  // Check if already a member
  const { data: existing } = await supabase
    .from(TABLE)
    .select('id')
    .eq('room_id', body.room_id)
    .eq('user_id', body.user_id)
    .single();
  if (existing) return err(res, 'User is already a member of this room', 400);

  // Check max members
  if (room.max_members) {
    const { count } = await supabase.from(TABLE).select('*', { count: 'exact', head: true }).eq('room_id', body.room_id).eq('is_active', true);
    if ((count || 0) >= room.max_members) return err(res, 'Room has reached maximum members', 400);
  }

  body.invited_by = body.invited_by || req.user!.id;
  body.role = body.role || 'member';
  body.is_active = true;

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'chat_member_added', targetType: 'chat_room_member', targetId: data.id, targetName: `User ${body.user_id} → Room ${body.room_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Member added to room', 201);
}

// ── PATCH /chat-members/:id ── (Update role, mute status, etc.)
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('room_id, user_id').eq('id', id).single();
  if (!old) return err(res, 'Chat member not found', 404);

  const body = parseBody(req);
  const { data, error: e } = await supabase.from(TABLE).update(body).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'chat_member_updated', targetType: 'chat_room_member', targetId: id, targetName: `User ${old.user_id} in Room ${old.room_id}`, ip: getClientIp(req) });
  return ok(res, data, 'Member updated');
}

// ── DELETE /chat-members/:id ── (Remove member from room)
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('room_id, user_id').eq('id', id).single();
  if (!old) return err(res, 'Chat member not found', 404);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'chat_member_removed', targetType: 'chat_room_member', targetId: id, targetName: `User ${old.user_id} from Room ${old.room_id}`, ip: getClientIp(req) });
  return ok(res, null, 'Member removed from room');
}

// ── POST /chat-members/bulk ── (Add multiple members at once)
export async function bulkAdd(req: Request, res: Response) {
  const { room_id, user_ids } = req.body;
  if (!room_id) return err(res, 'Room ID is required', 400);
  if (!Array.isArray(user_ids) || user_ids.length === 0) return err(res, 'User IDs array is required', 400);

  // Check room exists
  const { data: room } = await supabase.from('chat_rooms').select('id').eq('id', room_id).single();
  if (!room) return err(res, 'Chat room not found', 404);

  // Get existing members
  const { data: existing } = await supabase.from(TABLE).select('user_id').eq('room_id', room_id);
  const existingIds = new Set((existing || []).map((m: any) => m.user_id));

  const newUserIds = user_ids.filter((uid: number) => !existingIds.has(uid));
  if (newUserIds.length === 0) return ok(res, { added: 0 }, 'All users are already members');

  const inserts = newUserIds.map((uid: number) => ({
    room_id,
    user_id: uid,
    role: 'member',
    invited_by: req.user!.id,
    is_active: true,
  }));

  const { error: e } = await supabase.from(TABLE).insert(inserts);
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'chat_members_bulk_added', targetType: 'chat_room', targetId: room_id, targetName: `${newUserIds.length} members`, ip: getClientIp(req) });
  return ok(res, { added: newUserIds.length, skipped: user_ids.length - newUserIds.length }, `${newUserIds.length} members added`, 201);
}
