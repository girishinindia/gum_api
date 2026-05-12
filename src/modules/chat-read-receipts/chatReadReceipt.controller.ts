import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { ok, err } from '../../utils/response';

const TABLE = 'chat_read_receipts';

// ── GET /chat-read-receipts/room/:roomId ── (Get read receipts for a room)
export async function listByRoom(req: Request, res: Response) {
  const roomId = parseInt(req.params.roomId);
  const { data, error: e } = await supabase
    .from(TABLE)
    .select('*, users!chat_read_receipts_user_id_fkey(id, first_name, last_name, profile_picture)')
    .eq('room_id', roomId)
    .order('read_at', { ascending: false });

  if (e) return err(res, e.message, 500);
  return ok(res, data || []);
}

// ── POST /chat-read-receipts ── (Mark messages as read — upserts)
export async function markRead(req: Request, res: Response) {
  const userId = req.user!.id;
  const { room_id, last_read_message_id } = req.body;

  if (!room_id) return err(res, 'Room ID is required', 400);
  if (!last_read_message_id) return err(res, 'Last read message ID is required', 400);

  // Upsert read receipt (unique on room_id + user_id)
  const { data, error: e } = await supabase
    .from(TABLE)
    .upsert(
      {
        room_id: parseInt(room_id),
        user_id: userId,
        last_read_message_id: parseInt(last_read_message_id),
        read_at: new Date().toISOString(),
      },
      { onConflict: 'room_id,user_id' }
    )
    .select('*')
    .single();

  if (e) return err(res, e.message, 500);
  return ok(res, data, 'Read receipt updated');
}

// ── GET /chat-read-receipts/unread-count ── (Get unread count per room for current user)
export async function unreadCounts(req: Request, res: Response) {
  const userId = req.user!.id;

  // Get all rooms the user is a member of
  const { data: memberships } = await supabase
    .from('chat_room_members')
    .select('room_id')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!memberships || memberships.length === 0) return ok(res, []);

  const roomIds = memberships.map((m: any) => m.room_id);

  // For each room, get the last read message ID and count messages after it
  const counts: any[] = [];
  for (const roomId of roomIds) {
    const { data: receipt } = await supabase
      .from(TABLE)
      .select('last_read_message_id')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .single();

    let countQuery = supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .is('deleted_at', null);

    if (receipt?.last_read_message_id) {
      countQuery = countQuery.gt('id', receipt.last_read_message_id);
    }

    const { count } = await countQuery;
    if ((count || 0) > 0) {
      counts.push({ room_id: roomId, unread_count: count || 0 });
    }
  }

  return ok(res, counts);
}
