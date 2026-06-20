import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp, generatePendingId } from '../../utils/helpers';
import { config } from '../../config';
import { sendNotification } from '../../services/notification.service';
import { applySearch } from '../../utils/search';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

const TABLE = 'chat_invites';
const ROOM_TABLE = 'chat_rooms';
const MEMBER_TABLE = 'chat_room_members';
const CACHE_KEY = 'chat_invites:all';

const FK_SELECT = '*, chat_rooms(id, name, room_type), users!chat_invites_created_by_fkey(id, first_name, last_name, email)';

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  for (const k of ['room_id', 'max_uses', 'invited_user_id']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// ══════════════════════════════════════════════════════════
// ADMIN CRUD
// ══════════════════════════════════════════════════════════

// ── GET /chat-invites ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });
  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  // chat_invites has no soft-delete (deleted_at) column — its lifecycle is
  // status ('active'/'revoked') + is_active, so there is no deleted_at filter.
  if (search) q = applySearch(q, search, { ilike: ['invite_token'] });
  if (req.query.room_id) q = q.eq('room_id', parseInt(req.query.room_id as string));
  if (req.query.status) q = q.eq('status', req.query.status as string);
  if (req.query.invite_type) q = q.eq('invite_type', req.query.invite_type as string);

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);
  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  // Surface the shareable invite URL alongside the raw token.
  const rows = (data || []).map((r: any) => ({ ...r, invite_url: r.invite_token ? `${config.frontendUrl}/chat/join/${r.invite_token}` : null }));
  return paginated(res, rows, count || 0, page, limit);
}

// ── GET /chat-invites/:id ──
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Invite not found', 404);
  return ok(res, { ...data, invite_url: (data as any).invite_token ? `${config.frontendUrl}/chat/join/${(data as any).invite_token}` : null });
}

// ── POST /chat-invites ── (Generate invite link or direct invite)
export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  if (!body.room_id) return err(res, 'Room ID is required', 400);

  // Check room exists and invite links allowed
  const { data: room } = await supabase.from(ROOM_TABLE).select('id, name, allow_invite_link').eq('id', body.room_id).single();
  if (!room) return err(res, 'Chat room not found', 404);

  body.invite_type = body.invite_type || 'link';

  if (body.invite_type === 'link' && !room.allow_invite_link) {
    return err(res, 'Invite links are disabled for this room', 400);
  }

  // Generate unique token (64-char hex)
  body.invite_token = generatePendingId() + generatePendingId();
  body.created_by = req.user!.id;
  body.status = 'active';

  // Default expiry: 7 days from now
  if (!body.expires_at) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7);
    body.expires_at = expiryDate.toISOString();
  }

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  // Build the invite URL
  const inviteUrl = `${config.frontendUrl}/chat/join/${data.invite_token}`;

  // If direct invite, notify the invited user
  if (body.invite_type === 'direct' && body.invited_user_id) {
    sendNotification({
      userId: body.invited_user_id,
      notificationType: 'chat_invite',
      title: `Chat Room Invitation`,
      message: `You've been invited to join the chat room "${room.name}".`,
      channels: ['in_app', 'email'],
      referenceType: 'chat_invite',
      referenceId: data.id,
    }).catch(() => {});
  }

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'chat_invite_created', targetType: 'chat_invite', targetId: data.id, targetName: `Invite for ${room.name}`, ip: getClientIp(req) });
  return ok(res, { ...data, invite_url: inviteUrl }, 'Invite created', 201);
}

// ── PATCH /chat-invites/:id/revoke ── (Revoke an invite)
export async function revoke(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('id, status, room_id').eq('id', id).single();
  if (!old) return err(res, 'Invite not found', 404);
  if (old.status === 'revoked') return err(res, 'Invite already revoked', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ status: 'revoked' }).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'chat_invite_revoked', targetType: 'chat_invite', targetId: id, ip: getClientIp(req) });
  return ok(res, data, 'Invite revoked');
}

// ── DELETE /chat-invites/:id ── (Permanent delete)
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('id').eq('id', id).single();
  if (!old) return err(res, 'Invite not found', 404);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'chat_invite_deleted', targetType: 'chat_invite', targetId: id, ip: getClientIp(req) });
  return ok(res, null, 'Invite permanently deleted');
}

// ══════════════════════════════════════════════════════════
// PUBLIC INVITE ENDPOINTS (auth-only, no RBAC)
// ══════════════════════════════════════════════════════════

// ── GET /chat-invites/preview/:token ── (Preview invite before accepting)
export async function previewInvite(req: Request, res: Response) {
  const token = req.params.token;

  const { data: invite } = await supabase
    .from(TABLE)
    .select('id, invite_type, status, max_uses, use_count, expires_at, chat_rooms(id, name, description, room_type, avatar_url), users!chat_invites_created_by_fkey(first_name, last_name)')
    .eq('invite_token', token)
    .single();

  if (!invite) return err(res, 'Invalid invite link', 404);

  // Check validity
  if (invite.status !== 'active') return err(res, 'This invite has been revoked', 400);
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) return err(res, 'This invite has expired', 400);
  if (invite.max_uses && invite.use_count >= invite.max_uses) return err(res, 'This invite has reached its maximum uses', 400);

  // Get member count
  const room = invite.chat_rooms as any;
  const { count: memberCount } = await supabase
    .from(MEMBER_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('room_id', room.id)
    .eq('is_active', true);

  return ok(res, {
    room_name: room.name,
    room_description: room.description,
    room_type: room.room_type,
    avatar_url: room.avatar_url,
    invited_by: invite.users,
    member_count: memberCount || 0,
  });
}

// ── POST /chat-invites/accept/:token ── (Accept invite and join room)
export async function acceptInvite(req: Request, res: Response) {
  const userId = req.user!.id;
  const token = req.params.token;

  const { data: invite } = await supabase
    .from(TABLE)
    .select('id, room_id, invite_type, invited_user_id, status, max_uses, use_count, expires_at, created_by')
    .eq('invite_token', token)
    .single();

  if (!invite) return err(res, 'Invalid invite link', 404);

  // Validate invite
  if (invite.status !== 'active') return err(res, 'This invite has been revoked', 400);
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) return err(res, 'This invite has expired', 400);
  if (invite.max_uses && invite.use_count >= invite.max_uses) return err(res, 'This invite has reached its maximum uses', 400);

  // If direct invite, verify it's for this user
  if (invite.invite_type === 'direct' && invite.invited_user_id && invite.invited_user_id !== userId) {
    return err(res, 'This invite is not for you', 403);
  }

  // Check room exists
  const { data: room } = await supabase.from(ROOM_TABLE).select('id, name, max_members').eq('id', invite.room_id).single();
  if (!room) return err(res, 'Chat room no longer exists', 404);

  // Check if already a member
  const { data: existing } = await supabase
    .from(MEMBER_TABLE)
    .select('id, is_active')
    .eq('room_id', invite.room_id)
    .eq('user_id', userId)
    .single();

  if (existing) {
    if (existing.is_active) return err(res, 'You are already a member of this room', 400);
    // Re-activate if previously deactivated
    await supabase.from(MEMBER_TABLE).update({ is_active: true }).eq('id', existing.id);
  } else {
    // Check max members
    if (room.max_members) {
      const { count } = await supabase.from(MEMBER_TABLE).select('*', { count: 'exact', head: true }).eq('room_id', invite.room_id).eq('is_active', true);
      if ((count || 0) >= room.max_members) return err(res, 'This room has reached its maximum members', 400);
    }

    // Add as member
    await supabase.from(MEMBER_TABLE).insert({
      room_id: invite.room_id,
      user_id: userId,
      role: 'member',
      invited_by: invite.created_by || null,
      invite_id: invite.id,
      is_active: true,
    });
  }

  // Increment use count
  await supabase.from(TABLE).update({ use_count: (invite.use_count || 0) + 1 }).eq('id', invite.id);

  clearCache();
  return ok(res, { room_id: invite.room_id, room_name: room.name }, 'You have joined the room');
}

// ── POST /chat-invites/join-by-code ── (Join room via invite code)
export async function joinByCode(req: Request, res: Response) {
  const userId = req.user!.id;
  const { invite_code } = req.body;

  if (!invite_code?.trim()) return err(res, 'Invite code is required', 400);

  // Find room by invite code
  const { data: room } = await supabase
    .from(ROOM_TABLE)
    .select('id, name, max_members, is_active, allow_invite_link')
    .eq('invite_code', invite_code.trim().toUpperCase())
    .is('deleted_at', null)
    .single();

  if (!room) return err(res, 'Invalid invite code', 404);
  if (!room.is_active) return err(res, 'This room is no longer active', 400);
  if (!room.allow_invite_link) return err(res, 'This room does not accept invite codes', 400);

  // Check if already a member
  const { data: existing } = await supabase
    .from(MEMBER_TABLE)
    .select('id, is_active')
    .eq('room_id', room.id)
    .eq('user_id', userId)
    .single();

  if (existing) {
    if (existing.is_active) return err(res, 'You are already a member of this room', 400);
    await supabase.from(MEMBER_TABLE).update({ is_active: true }).eq('id', existing.id);
  } else {
    // Check max members
    if (room.max_members) {
      const { count } = await supabase.from(MEMBER_TABLE).select('*', { count: 'exact', head: true }).eq('room_id', room.id).eq('is_active', true);
      if ((count || 0) >= room.max_members) return err(res, 'This room has reached its maximum members', 400);
    }

    await supabase.from(MEMBER_TABLE).insert({
      room_id: room.id,
      user_id: userId,
      role: 'member',
      is_active: true,
    });
  }

  return ok(res, { room_id: room.id, room_name: room.name }, 'You have joined the room');
}
