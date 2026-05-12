import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { ok, err } from '../../utils/response';
import { emitReactionAdded, emitReactionRemoved } from '../../socket/emitter';

const TABLE = 'chat_message_reactions';
const FK_SELECT = '*, users!chat_message_reactions_user_id_fkey(id, first_name, last_name, email)';

// ── GET /chat-reactions/message/:messageId ── (Get reactions for a message)
export async function listByMessage(req: Request, res: Response) {
  const messageId = parseInt(req.params.messageId);
  const { data, error: e } = await supabase
    .from(TABLE)
    .select(FK_SELECT)
    .eq('message_id', messageId)
    .order('created_at', { ascending: true });

  if (e) return err(res, e.message, 500);
  return ok(res, data || []);
}

// ── POST /chat-reactions ── (Add reaction — toggle: if exists, remove it)
export async function toggleReaction(req: Request, res: Response) {
  const userId = req.user!.id;
  const { message_id, emoji } = req.body;

  if (!message_id) return err(res, 'Message ID is required', 400);
  if (!emoji?.trim()) return err(res, 'Emoji is required', 400);

  // Look up room_id for socket emission
  const { data: msg } = await supabase
    .from('chat_messages')
    .select('room_id')
    .eq('id', parseInt(message_id))
    .single();

  // Check if reaction already exists
  const { data: existing } = await supabase
    .from(TABLE)
    .select('id')
    .eq('message_id', parseInt(message_id))
    .eq('user_id', userId)
    .eq('emoji', emoji.trim())
    .single();

  if (existing) {
    // Remove existing reaction (toggle off)
    await supabase.from(TABLE).delete().eq('id', existing.id);
    if (msg) emitReactionRemoved(msg.room_id, parseInt(message_id), userId, emoji.trim());
    return ok(res, null, 'Reaction removed');
  }

  // Add new reaction
  const { data, error: e } = await supabase
    .from(TABLE)
    .insert({ message_id: parseInt(message_id), user_id: userId, emoji: emoji.trim() })
    .select(FK_SELECT)
    .single();

  if (e) return err(res, e.message, 500);
  if (msg) emitReactionAdded(msg.room_id, parseInt(message_id), userId, emoji.trim(), data);
  return ok(res, data, 'Reaction added', 201);
}

// ── DELETE /chat-reactions/:id ── (Remove specific reaction)
export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const { error: e } = await supabase.from(TABLE).delete().eq('id', id);
  if (e) return err(res, e.message, 500);
  return ok(res, null, 'Reaction removed');
}
