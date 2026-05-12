import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { redis } from '../../config/redis';
import { logAdmin } from '../../services/activityLog.service';
import { ok, err, paginated } from '../../utils/response';
import { parseListParams } from '../../utils/pagination';
import { getClientIp, generatePendingId } from '../../utils/helpers';

const TABLE = 'chat_rooms';
const MEMBER_TABLE = 'chat_room_members';
const CACHE_KEY = 'chat_rooms:all';

const FK_SELECT = `*, users!chat_rooms_created_by_fkey(id, first_name, last_name, email), course_batches(id, name)`;

const clearCache = async () => { await redis.del(CACHE_KEY); };

function parseBody(req: Request): any {
  const body: any = { ...req.body };
  if (typeof body.is_active === 'string') body.is_active = body.is_active === 'true';
  if (typeof body.allow_invite_link === 'string') body.allow_invite_link = body.allow_invite_link === 'true';
  for (const k of ['max_members', 'batch_id']) {
    if (typeof body[k] === 'string') body[k] = body[k] ? parseInt(body[k]) || null : null;
  }
  for (const k of Object.keys(body)) { if (body[k] === '') body[k] = null; }
  return body;
}

/** Generate a unique 8-char invite code like ROOM-A3X9 */
async function generateInviteCode(): Promise<string> {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 5; attempt++) {
    let code = 'ROOM-';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    const { data } = await supabase.from(TABLE).select('id').eq('invite_code', code).single();
    if (!data) return code;
  }
  // Fallback: longer code
  return 'ROOM-' + generatePendingId().substring(0, 8).toUpperCase();
}

// ══════════════════════════════════════════════════════════
// ADMIN CRUD — full management with RBAC
// ══════════════════════════════════════════════════════════

// ── GET /chat-rooms ──
export async function list(req: Request, res: Response) {
  const { page, limit, offset, search, sort, ascending } = parseListParams(req, { sort: 'created_at' });
  let q = supabase.from(TABLE).select(FK_SELECT, { count: 'exact' });

  if (req.query.show_deleted === 'true') q = q.not('deleted_at', 'is', null);
  else q = q.is('deleted_at', null);

  if (search) q = q.or(`name.ilike.%${search}%,description.ilike.%${search}%,invite_code.ilike.%${search}%`);
  if (req.query.room_type) q = q.eq('room_type', req.query.room_type as string);
  if (req.query.is_active !== undefined) q = q.eq('is_active', req.query.is_active === 'true');
  if (req.query.batch_id) q = q.eq('batch_id', parseInt(req.query.batch_id as string));
  if (req.query.created_by) q = q.eq('created_by', parseInt(req.query.created_by as string));

  q = q.order(sort, { ascending }).range(offset, offset + limit - 1);
  const { data, count, error: e } = await q;
  if (e) return err(res, e.message, 500);
  return paginated(res, data || [], count || 0, page, limit);
}

// ── GET /chat-rooms/:id ──
export async function getById(req: Request, res: Response) {
  const { data, error: e } = await supabase.from(TABLE).select(FK_SELECT).eq('id', req.params.id).single();
  if (e || !data) return err(res, 'Chat room not found', 404);

  // Also fetch member count
  const { count: memberCount } = await supabase
    .from(MEMBER_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('room_id', data.id)
    .eq('is_active', true);

  return ok(res, { ...data, member_count: memberCount || 0 });
}

// ── POST /chat-rooms ──
export async function create(req: Request, res: Response) {
  const body = parseBody(req);
  if (!body.name?.trim()) return err(res, 'Room name is required', 400);
  if (!body.room_type) return err(res, 'Room type is required', 400);

  body.created_by = req.user!.id;
  body.invite_code = await generateInviteCode();

  const { data, error: e } = await supabase.from(TABLE).insert(body).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  // Auto-add creator as owner member
  await supabase.from(MEMBER_TABLE).insert({
    room_id: data.id,
    user_id: req.user!.id,
    role: 'owner',
    is_active: true,
  });

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'chat_room_created', targetType: 'chat_room', targetId: data.id, targetName: body.name, ip: getClientIp(req) });
  return ok(res, data, 'Chat room created', 201);
}

// ── PATCH /chat-rooms/:id ──
export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('name').eq('id', id).single();
  if (!old) return err(res, 'Chat room not found', 404);

  const body = parseBody(req);
  const { data, error: e } = await supabase.from(TABLE).update(body).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'chat_room_updated', targetType: 'chat_room', targetId: id, targetName: body.name || old.name, ip: getClientIp(req) });
  return ok(res, data, 'Chat room updated');
}

// ── DELETE /chat-rooms/:id (soft) ──
export async function softDelete(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Chat room not found', 404);
  if (old.deleted_at) return err(res, 'Already in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'chat_room_soft_deleted', targetType: 'chat_room', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Chat room moved to trash');
}

// ── PATCH /chat-rooms/:id/restore ──
export async function restore(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('name, deleted_at').eq('id', id).single();
  if (!old) return err(res, 'Chat room not found', 404);
  if (!old.deleted_at) return err(res, 'Not in trash', 400);

  const { data, error: e } = await supabase.from(TABLE).update({ deleted_at: null, is_active: true }).eq('id', id).select(FK_SELECT).single();
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'chat_room_restored', targetType: 'chat_room', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, data, 'Chat room restored');
}

// ── DELETE /chat-rooms/:id/permanent ──
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { data: old } = await supabase.from(TABLE).select('name').eq('id', id).single();
  if (!old) return err(res, 'Chat room not found', 404);

  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);

  clearCache();
  logAdmin({ actorId: req.user!.id, action: 'chat_room_deleted', targetType: 'chat_room', targetId: id, targetName: old.name, ip: getClientIp(req) });
  return ok(res, null, 'Chat room permanently deleted');
}

// ══════════════════════════════════════════════════════════
// BATCH-SCOPED ROOM CREATION (Instructor feature)
// ══════════════════════════════════════════════════════════

// ── POST /chat-rooms/batch-room ──
// Instructor creates a room for their batch; auto-populates enrolled students
export async function createBatchRoom(req: Request, res: Response) {
  const userId = req.user!.id;
  const body = parseBody(req);

  if (!body.batch_id) return err(res, 'Batch ID is required', 400);
  if (!body.name?.trim()) return err(res, 'Room name is required', 400);

  // Verify the instructor owns this batch
  const { data: batch } = await supabase
    .from('course_batches')
    .select('id, name, instructor_id')
    .eq('id', body.batch_id)
    .single();

  if (!batch) return err(res, 'Batch not found', 404);
  if (batch.instructor_id !== userId) return err(res, 'You are not the instructor for this batch', 403);

  // Create the room
  const roomData: any = {
    name: body.name.trim(),
    description: body.description?.trim() || null,
    room_type: body.room_type || 'public',
    batch_id: body.batch_id,
    created_by: userId,
    invite_code: await generateInviteCode(),
    allow_invite_link: body.allow_invite_link ?? true,
    max_members: body.max_members || null,
    is_active: true,
  };

  const { data: room, error: roomErr } = await supabase.from(TABLE).insert(roomData).select(FK_SELECT).single();
  if (roomErr) return err(res, roomErr.message, 500);

  // Add instructor as owner
  await supabase.from(MEMBER_TABLE).insert({
    room_id: room.id,
    user_id: userId,
    role: 'owner',
    is_active: true,
  });

  // Auto-populate enrolled students from this batch
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('user_id')
    .eq('item_type', 'batch')
    .eq('item_id', body.batch_id)
    .eq('enrollment_status', 'active');

  if (enrollments && enrollments.length > 0) {
    const memberInserts = enrollments.map((e: any) => ({
      room_id: room.id,
      user_id: e.user_id,
      role: 'member' as const,
      invited_by: userId,
      is_active: true,
    }));
    await supabase.from(MEMBER_TABLE).insert(memberInserts);
  }

  clearCache();
  logAdmin({ actorId: userId, action: 'chat_room_batch_created', targetType: 'chat_room', targetId: room.id, targetName: body.name, ip: getClientIp(req) });
  return ok(res, room, `Batch room created with ${enrollments?.length || 0} students`, 201);
}

// ── POST /chat-rooms/:id/sync-batch ──
// Sync room members with current batch enrollments (add new students, don't remove existing)
export async function syncBatchMembers(req: Request, res: Response) {
  const roomId = parseInt(req.params.id);

  const { data: room } = await supabase.from(TABLE).select('id, batch_id, created_by, name').eq('id', roomId).single();
  if (!room) return err(res, 'Chat room not found', 404);
  if (!room.batch_id) return err(res, 'This room is not linked to a batch', 400);

  // Get current enrolled students
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('user_id')
    .eq('item_type', 'batch')
    .eq('item_id', room.batch_id)
    .eq('enrollment_status', 'active');

  if (!enrollments || enrollments.length === 0) return ok(res, { added: 0 }, 'No enrolled students found');

  // Get existing room members
  const { data: existingMembers } = await supabase
    .from(MEMBER_TABLE)
    .select('user_id')
    .eq('room_id', roomId);

  const existingIds = new Set((existingMembers || []).map((m: any) => m.user_id));
  const newMembers = enrollments.filter((e: any) => !existingIds.has(e.user_id));

  if (newMembers.length > 0) {
    const inserts = newMembers.map((e: any) => ({
      room_id: roomId,
      user_id: e.user_id,
      role: 'member' as const,
      invited_by: req.user!.id,
      is_active: true,
    }));
    await supabase.from(MEMBER_TABLE).insert(inserts);
  }

  clearCache();
  return ok(res, { added: newMembers.length }, `${newMembers.length} new members synced`);
}
