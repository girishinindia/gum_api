import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp } from '../../utils/helpers';
import { processAndUploadImage, uploadRawFile } from '../../services/storage.service';
import { emitNewMessage, emitMessageEdited, emitMessageDeleted, emitMessagePinToggled, getChatNamespace } from '../../socket/emitter';
import { notifyNewMessage } from '../../services/chatNotify.service';
import { applySearch, SEARCH_CONFIGS } from '../../utils/search';
import { toIntOrNull, toNumOrNull } from '../../utils/coerce';

const TABLE = 'chat_messages';
const ATTACHMENT_TABLE = 'chat_attachments';
const CACHE_KEY = 'chat_messages:all';

const FK_SELECT = '*, users!chat_messages_sender_id_fkey(id, first_name, last_name, email, profile_picture:avatar_url), chat_rooms(id, name)';
const MSG_WITH_REPLIES = `*, users!chat_messages_sender_id_fkey(id, first_name, last_name, email, profile_picture:avatar_url), chat_attachments(*), chat_message_reactions(id, emoji, user_id, users!chat_message_reactions_user_id_fkey(id, first_name, last_name))`;

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_pinned === 'string') body.is_pinned = body.is_pinned === 'true';
  if (typeof body.is_edited === 'string') body.is_edited = body.is_edited === 'true';
  for (const k of ['room_id', 'sender_id', 'reply_to_id']) {
    if (typeof body[k] === 'string') body[k] = toIntOrNull(body[k]);
  }
  // Parse metadata JSONB
  if (typeof body.metadata === 'string') {
    try { body.metadata = JSON.parse(body.metadata); } catch { /* leave as-is */ }
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

// ══════════════════════════════════════════════════════════
// ADMIN CRUD — full management
// ══════════════════════════════════════════════════════════

// ── GET /chat-messages ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });
  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (req.query.show_deleted === 'true') q = q.not('deleted_at', 'is', null);
  else q = q.is('deleted_at', null);

  if (search) q = applySearch(q, search, SEARCH_CONFIGS.chat_messages);
  if (req.query.room_id) q = q.eq('room_id', parseInt(req.query.room_id as string));
  if (req.query.sender_id) q = q.eq('sender_id', parseInt(req.query.sender_id as string));
  if (req.query.message_type) q = q.eq('message_type', req.query.message_type as string);
  if (req.query.is_pinned !== undefined) q = q.eq('is_pinned', req.query.is_pinned === 'true');

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);
  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// ── GET /chat-messages/:id ──
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select(MSG_WITH_REPLIES).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Message not found', 404);
  return ok(res, data);
}

// ── GET /chat-messages/room/:roomId ── (Get messages for a room with pagination)
export async function listByRoom(req: Request, res: Response) {
  const roomId = parseInt(req.params.roomId);
  const { page, limit, offset } = parseListParams(req, { sort: 'created_at' });

  // Block access to a deleted/inactive room — its messages must not be
  // reachable by direct URL after the room is removed.
  const { data: room } = await supabase
    .from('chat_rooms')
    .select('id, is_active, deleted_at')
    .eq('id', roomId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!room || (room as any).is_active === false) return err(res, 'Chat room not found', 404);

  const { data, count, error: e } = await supabase
    .from(TABLE)
    .select(MSG_WITH_REPLIES, { count: 'exact' })
    .eq('room_id', roomId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// ── POST /chat-messages ──
export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  if (!body.room_id) return err(res, 'Room ID is required', 400);
  if (!body.content?.trim() && body.message_type === 'text') return err(res, 'Content is required for text messages', 400);
  if (typeof body.content === 'string' && body.content.length > 4000) return err(res, 'Message is too long (max 4000 characters)', 400);

  body.sender_id = body.sender_id || req.user!.id;
  body.message_type = body.message_type || 'text';

  // When a user sends as themselves, enforce active membership + mute.
  // (Admins/system posting on behalf of another sender_id bypass this.)
  if (body.sender_id === req.user!.id) {
    const { data: member } = await supabase
      .from('chat_room_members')
      .select('id, is_muted')
      .eq('room_id', body.room_id)
      .eq('user_id', body.sender_id)
      .eq('is_active', true)
      .maybeSingle();
    if (!member) return err(res, 'You are not a member of this room', 403);
    if (member.is_muted) return err(res, 'You are muted in this room', 403);
  }

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(MSG_WITH_REPLIES).single();
  if (e) return err(res, e.message, 500);

  // Handle file attachment if uploaded (images → webp pipeline, others → raw upload)
  if (req.file) {
    const isImage = (req.file.mimetype || '').startsWith('image/');
    const safeName = (req.file.originalname || 'file').replace(/[^\w.\-]+/g, '_');
    const path = `chat/attachments/${body.room_id}/${Date.now()}-${safeName}`;
    let cdnUrl: string | null = null;
    try {
      cdnUrl = isImage
        ? await processAndUploadImage(req.file.buffer, path)
        : await uploadRawFile(req.file.buffer, path);
    } catch { cdnUrl = null; }
    if (cdnUrl) {
      await supabase.from(ATTACHMENT_TABLE).insert({
        message_id: data.id,
        file_name: req.file.originalname,
        file_url: cdnUrl,
        file_size: req.file.size,
        file_type: req.file.mimetype,
        uploaded_by: req.user!.id,
      });
    }
  }

  clearCache();
  emitNewMessage(body.room_id, data);

  // Alert away/offline members (in-app + push wake-up). Fire-and-forget.
  const sender = (data as any)?.users;
  const senderName = sender ? `${sender.first_name ?? ''} ${sender.last_name ?? ''}`.trim() : '';
  notifyNewMessage(getChatNamespace(), {
    roomId: body.room_id,
    messageId: data.id,
    senderId: data.sender_id,
    senderName: senderName || 'Someone',
    messageType: data.message_type,
    content: data.content,
  });

  return ok(res, data, 'Message sent', 201);
}

// ── PATCH /chat-messages/:id ── (Edit message)
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('id, sender_id, content').eq('id', id).single();
  if (!old) return err(res, 'Message not found', 404);

  const body = parseBody(req);
  body.is_edited = true;
  body.edited_at = new Date().toISOString();

  const { data, error: e } = await supabase.from(TABLE).update(body).eq('id', id).select(MSG_WITH_REPLIES).single();
  if (e) return err(res, e.message, 500);

  clearCache();
  emitMessageEdited(data.room_id, data);
  return ok(res, data, 'Message updated');
}

// ── PATCH /chat-messages/:id/pin ── (Toggle pin)
export async function togglePin(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: msg } = await supabase.from(TABLE).select('id, is_pinned, room_id, content').eq('id', id).single();
  if (!msg) return err(res, 'Message not found', 404);

  const newPinned = !msg.is_pinned;
  const { data, error: e } = await supabase.from(TABLE).update({ is_pinned: newPinned }).eq('id', id).select(MSG_WITH_REPLIES).single();
  if (e) return err(res, e.message, 500);

  clearCache();
  emitMessagePinToggled(msg.room_id, id, newPinned);
  logAdmin({ actorId: req.user!.id, action: newPinned ? 'chat_message_pinned' : 'chat_message_unpinned', targetType: 'chat_message', targetId: id, targetName: (msg.content || '').substring(0, 50), ip: getClientIp(req) });
  return ok(res, data, newPinned ? 'Message pinned' : 'Message unpinned');
}

// ── DELETE /chat-messages/:id (soft) ──
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('id, room_id, content, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Message not found', 404);
  if (old.deleted_at) return err(res, 'Already deleted', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: new Date().toISOString() }).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  clearCache();
  emitMessageDeleted(old.room_id, id);
  logAdmin({ actorId: req.user!.id, action: 'chat_message_soft_deleted', targetType: 'chat_message', targetId: id, targetName: (old.content || '').substring(0, 50), ip: getClientIp(req) });
  return ok(res, data, 'Message deleted');
}

// ── DELETE /chat-messages/:id/permanent ──
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('id, content').eq('id', id).single();
  if (!old) return err(res, 'Message not found', 404);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'chat_message_deleted', targetType: 'chat_message', targetId: id, targetName: (old.content || '').substring(0, 50), ip: getClientIp(req) });
  return ok(res, null, 'Message permanently deleted');
}

// ── GET /chat-messages/room/:roomId/pinned ── (Get pinned messages for a room)
export async function listPinned(req: Request, res: Response) {
  const roomId = parseInt(req.params.roomId);
  const { data: room } = await supabase
    .from('chat_rooms')
    .select('id, is_active, deleted_at')
    .eq('id', roomId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!room || (room as any).is_active === false) return err(res, 'Chat room not found', 404);

  const { data, error: e } = await supabase
    .from(TABLE)
    .select(MSG_WITH_REPLIES)
    .eq('room_id', roomId)
    .eq('is_pinned', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (e) return err(res, e.message, 500);
  return ok(res, data || []);
}

// ── GET /chat-messages/:id/thread ── (Get reply thread for a message)
export async function getThread(req: Request, res: Response) {
  const parentId = parseInt(req.params.id);

  // Get the parent message
  const { data: parent } = await supabase.from(TABLE).select(MSG_WITH_REPLIES).eq('id', parentId).single();
  if (!parent) return err(res, 'Message not found', 404);

  // Get all replies to this message
  const { data: replies } = await supabase
    .from(TABLE)
    .select(MSG_WITH_REPLIES)
    .eq('reply_to_id', parentId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  return ok(res, { parent, replies: replies || [] });
}

// ══════════════════════════════════════════════════════════
// MEMBER-FACING SEND (text or attachment) — membership-gated, spoof-safe
// ══════════════════════════════════════════════════════════

// ── POST /chat-messages/room/:roomId ──
// A learner/member sends to a room they belong to. Unlike the admin POST /, this
// requires no `chat_message:create` RBAC; the sender is always forced to the
// caller (no spoofing) and active membership + mute are enforced.
export async function createInRoom(req: Request, res: Response) {
  const roomId = parseInt(req.params.roomId);
  const senderId = req.user!.id;
  if (!roomId) return err(res, 'Room ID is required', 400);

  const body = parseBody(req);
  const messageType = body.message_type
    || (req.file ? ((req.file.mimetype || '').startsWith('image/') ? 'image' : 'file') : 'text');
  if (messageType === 'text' && !body.content?.trim()) return err(res, 'Content is required for text messages', 400);
  if (typeof body.content === 'string' && body.content.length > 4000) return err(res, 'Message is too long (max 4000 characters)', 400);

  // Membership + mute (sender is always the caller — spoof-safe)
  const { data: member } = await supabase
    .from('chat_room_members')
    .select('id, is_muted')
    .eq('room_id', roomId)
    .eq('user_id', senderId)
    .eq('is_active', true)
    .maybeSingle();
  if (!member) return err(res, 'You are not a member of this room', 403);
  if (member.is_muted) return err(res, 'You are muted in this room', 403);

  const insert: any = {
    room_id: roomId,
    sender_id: senderId,
    message_type: messageType,
    content: body.content?.trim() || null,
  };
  if (body.reply_to_id) insert.reply_to_id = body.reply_to_id;
  if (body.metadata) insert.metadata = body.metadata;

  const { data, error: e } = await supabase.from(TABLE).insert(insert).select(MSG_WITH_REPLIES).single();
  if (e) return err(res, e.message, 500);

  let finalMsg: any = data;

  if (req.file) {
    const isImage = (req.file.mimetype || '').startsWith('image/');
    const safeName = (req.file.originalname || 'file').replace(/[^\w.\-]+/g, '_');
    const path = `chat/attachments/${roomId}/${Date.now()}-${safeName}`;
    let cdnUrl: string | null = null;
    try {
      cdnUrl = isImage
        ? await processAndUploadImage(req.file.buffer, path)
        : await uploadRawFile(req.file.buffer, path);
    } catch { cdnUrl = null; }
    if (cdnUrl) {
      await supabase.from(ATTACHMENT_TABLE).insert({
        message_id: data.id,
        file_name: req.file.originalname,
        file_url: cdnUrl,
        file_size: req.file.size,
        file_type: req.file.mimetype,
        uploaded_by: senderId,
      });
      // Re-fetch so the broadcast carries the attachment
      const { data: withAtt } = await supabase.from(TABLE).select(MSG_WITH_REPLIES).eq('id', data.id).single();
      if (withAtt) finalMsg = withAtt;
    }
  }

  clearCache();
  emitNewMessage(roomId, finalMsg);
  const s = finalMsg?.users;
  const senderName = s ? `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() : '';
  notifyNewMessage(getChatNamespace(), {
    roomId,
    messageId: finalMsg.id,
    senderId,
    senderName: senderName || 'Someone',
    messageType: finalMsg.message_type,
    content: finalMsg.content,
  });
  return ok(res, finalMsg, 'Message sent', 201);
}
