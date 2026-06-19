import { Namespace, Socket } from 'socket.io';
import { supabase } from '../config/supabase';
import { redis } from '../config/redis';
import { config } from '../config';
import { logger } from '../utils/logger';
import { notifyNewMessage } from '../services/chatNotify.service';

const MSG_SELECT = `*, users!chat_messages_sender_id_fkey(id, first_name, last_name, email, profile_picture:avatar_url), chat_attachments(*), chat_message_reactions(id, emoji, user_id, users!chat_message_reactions_user_id_fkey(id, first_name, last_name))`;

// ── Types ──
interface JoinRoomPayload { roomId: number }
interface LeaveRoomPayload { roomId: number }
interface SendMessagePayload {
  roomId: number;
  content: string;
  messageType?: 'text' | 'image' | 'file' | 'sticker' | 'emoji' | 'quick_reply';
  replyToId?: number | null;
  metadata?: Record<string, any> | null;
}
interface TypingPayload { roomId: number }

/**
 * Register /chat namespace event handlers on a connected socket.
 */
export function registerChatHandlers(chatNs: Namespace, socket: Socket) {
  const userId: number = socket.data.userId;
  const user = socket.data.user;

  // ── join_room ──
  socket.on('join_room', async (payload: JoinRoomPayload, ack?: (res: any) => void) => {
    try {
      const { roomId } = payload;
      if (!roomId) return ack?.({ success: false, error: 'roomId required' });

      // Verify membership
      const { data: member } = await supabase
        .from('chat_room_members')
        .select('id, role')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();

      if (!member) return ack?.({ success: false, error: 'Not a member of this room' });

      const roomKey = `room:${roomId}`;
      socket.join(roomKey);

      // Notify room that user joined (for presence)
      socket.to(roomKey).emit('user_joined_room', {
        roomId,
        userId,
        user: { id: user.id, name: `${user.first_name} ${user.last_name}`.trim(), avatar: user.profile_picture },
      });

      logger.debug({ userId, roomId }, '[Chat] Joined room');
      ack?.({ success: true, roomId, role: member.role });
    } catch (err: any) {
      logger.error({ err: err.message, userId }, '[Chat] join_room error');
      ack?.({ success: false, error: 'Failed to join room' });
    }
  });

  // ── leave_room ──
  socket.on('leave_room', async (payload: LeaveRoomPayload, ack?: (res: any) => void) => {
    try {
      const { roomId } = payload;
      const roomKey = `room:${roomId}`;

      socket.leave(roomKey);

      socket.to(roomKey).emit('user_left_room', {
        roomId,
        userId,
        user: { id: user.id, name: `${user.first_name} ${user.last_name}`.trim() },
      });

      logger.debug({ userId, roomId }, '[Chat] Left room');
      ack?.({ success: true });
    } catch (err: any) {
      logger.error({ err: err.message, userId }, '[Chat] leave_room error');
      ack?.({ success: false, error: 'Failed to leave room' });
    }
  });

  // ── send_message ──
  socket.on('send_message', async (payload: SendMessagePayload, ack?: (res: any) => void) => {
    try {
      const { roomId, content, messageType = 'text', replyToId, metadata } = payload;

      if (!roomId) return ack?.({ success: false, error: 'roomId required' });
      if (messageType === 'text' && !content?.trim()) return ack?.({ success: false, error: 'Content required for text messages' });
      if (content && content.length > 4000) return ack?.({ success: false, error: 'Message is too long (max 4000 characters)' });

      // Rate limit: ~30 messages / 10s per user (cluster-safe via Redis). Fail-open on a Redis hiccup.
      if (!config.rateLimit.disabled) {
        try {
          const rlKey = `chatrate:${userId}`;
          const n = await redis.incr(rlKey);
          if (n === 1) await redis.expire(rlKey, 10);
          if (n > 30) return ack?.({ success: false, error: 'You are sending messages too fast. Please slow down.' });
        } catch { /* ignore limiter errors */ }
      }

      // Verify membership (and mute status)
      const { data: member } = await supabase
        .from('chat_room_members')
        .select('id, is_muted')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();

      if (!member) return ack?.({ success: false, error: 'Not a member of this room' });
      if (member.is_muted) return ack?.({ success: false, error: 'You are muted in this room' });

      // Persist to DB
      const insertData: Record<string, any> = {
        room_id: roomId,
        sender_id: userId,
        message_type: messageType,
        content: content?.trim() || null,
      };
      if (replyToId) insertData.reply_to_id = replyToId;
      if (metadata) insertData.metadata = metadata;

      const { data: message, error: dbErr } = await supabase
        .from('chat_messages')
        .insert(insertData)
        .select(MSG_SELECT)
        .single();

      if (dbErr || !message) {
        logger.error({ dbErr }, '[Chat] DB insert failed');
        return ack?.({ success: false, error: 'Failed to save message' });
      }

      // Broadcast to room (including sender for confirmation)
      const roomKey = `room:${roomId}`;
      chatNs.to(roomKey).emit('new_message', {
        roomId,
        message,
      });

      // Also emit to /admin namespace for live monitoring
      try {
        const adminNs = chatNs.server.of('/admin');
        adminNs.to('admin:monitor').emit('chat_activity', {
          type: 'new_message',
          roomId,
          message,
          timestamp: new Date().toISOString(),
        });
      } catch { /* admin ns may not have listeners */ }

      // Alert away/offline members (in-app + push wake-up). Fire-and-forget.
      notifyNewMessage(chatNs, {
        roomId,
        messageId: message.id,
        senderId: userId,
        senderName: `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim() || 'Someone',
        messageType,
        content: message.content,
      });

      logger.debug({ userId, roomId, messageId: message.id }, '[Chat] Message sent');
      ack?.({ success: true, message });
    } catch (err: any) {
      logger.error({ err: err.message, userId }, '[Chat] send_message error');
      ack?.({ success: false, error: 'Failed to send message' });
    }
  });

  // ── typing_start ──
  socket.on('typing_start', (payload: TypingPayload) => {
    const { roomId } = payload;
    if (!roomId) return;

    socket.to(`room:${roomId}`).emit('user_typing', {
      roomId,
      userId,
      user: { id: user.id, name: `${user.first_name} ${user.last_name}`.trim() },
      isTyping: true,
    });
  });

  // ── typing_stop ──
  socket.on('typing_stop', (payload: TypingPayload) => {
    const { roomId } = payload;
    if (!roomId) return;

    socket.to(`room:${roomId}`).emit('user_typing', {
      roomId,
      userId,
      user: { id: user.id, name: `${user.first_name} ${user.last_name}`.trim() },
      isTyping: false,
    });
  });

  // ── message_edited ── (listen for edit events from client)
  socket.on('edit_message', async (payload: { messageId: number; content: string }, ack?: (res: any) => void) => {
    try {
      const { messageId, content } = payload;
      if (!messageId || !content?.trim()) return ack?.({ success: false, error: 'messageId and content required' });

      // Verify sender owns this message
      const { data: msg } = await supabase
        .from('chat_messages')
        .select('id, room_id, sender_id')
        .eq('id', messageId)
        .single();

      if (!msg) return ack?.({ success: false, error: 'Message not found' });
      if (msg.sender_id !== userId) return ack?.({ success: false, error: 'Can only edit your own messages' });

      const { data: updated, error: dbErr } = await supabase
        .from('chat_messages')
        .update({ content: content.trim(), is_edited: true, edited_at: new Date().toISOString() })
        .eq('id', messageId)
        .select(MSG_SELECT)
        .single();

      if (dbErr || !updated) return ack?.({ success: false, error: 'Failed to update message' });

      const roomKey = `room:${msg.room_id}`;
      chatNs.to(roomKey).emit('message_edited', { roomId: msg.room_id, message: updated });

      ack?.({ success: true, message: updated });
    } catch (err: any) {
      logger.error({ err: err.message, userId }, '[Chat] edit_message error');
      ack?.({ success: false, error: 'Failed to edit message' });
    }
  });

  // ── delete_message ── (soft delete)
  socket.on('delete_message', async (payload: { messageId: number }, ack?: (res: any) => void) => {
    try {
      const { messageId } = payload;
      if (!messageId) return ack?.({ success: false, error: 'messageId required' });

      const { data: msg } = await supabase
        .from('chat_messages')
        .select('id, room_id, sender_id')
        .eq('id', messageId)
        .single();

      if (!msg) return ack?.({ success: false, error: 'Message not found' });
      if (msg.sender_id !== userId) return ack?.({ success: false, error: 'Can only delete your own messages' });

      const now = new Date().toISOString();
      await supabase
        .from('chat_messages')
        .update({ deleted_at: now, is_active: false })
        .eq('id', messageId);

      const roomKey = `room:${msg.room_id}`;
      chatNs.to(roomKey).emit('message_deleted', { roomId: msg.room_id, messageId });

      ack?.({ success: true });
    } catch (err: any) {
      logger.error({ err: err.message, userId }, '[Chat] delete_message error');
      ack?.({ success: false, error: 'Failed to delete message' });
    }
  });

  // ── react_to_message ──
  socket.on('react_to_message', async (payload: { messageId: number; emoji: string }, ack?: (res: any) => void) => {
    try {
      const { messageId, emoji } = payload;
      if (!messageId || !emoji) return ack?.({ success: false, error: 'messageId and emoji required' });

      const { data: msg } = await supabase
        .from('chat_messages')
        .select('id, room_id')
        .eq('id', messageId)
        .is('deleted_at', null)
        .single();

      if (!msg) return ack?.({ success: false, error: 'Message not found' });

      // Upsert reaction (toggle — if exists, remove; if not, add)
      const { data: existing } = await supabase
        .from('chat_message_reactions')
        .select('id')
        .eq('message_id', messageId)
        .eq('user_id', userId)
        .eq('emoji', emoji)
        .maybeSingle();

      if (existing) {
        await supabase.from('chat_message_reactions').delete().eq('id', existing.id);
        chatNs.to(`room:${msg.room_id}`).emit('reaction_removed', { roomId: msg.room_id, messageId, userId, emoji });
        ack?.({ success: true, action: 'removed' });
      } else {
        const { data: reaction } = await supabase
          .from('chat_message_reactions')
          .insert({ message_id: messageId, user_id: userId, emoji })
          .select('id, emoji, user_id')
          .single();
        chatNs.to(`room:${msg.room_id}`).emit('reaction_added', { roomId: msg.room_id, messageId, userId, emoji, reaction });
        ack?.({ success: true, action: 'added' });
      }
    } catch (err: any) {
      logger.error({ err: err.message, userId }, '[Chat] react_to_message error');
      ack?.({ success: false, error: 'Failed to react' });
    }
  });

  // ── pin_message ── (owner-only pin/unpin)
  socket.on('pin_message', async (payload: { messageId: number; roomId: number; pin?: boolean }, ack?: (res: any) => void) => {
    try {
      const { messageId, roomId, pin } = payload;
      if (!messageId || !roomId) return ack?.({ success: false, error: 'messageId and roomId required' });

      // Only the room owner may pin/unpin.
      const { data: room } = await supabase
        .from('chat_rooms')
        .select('id, created_by')
        .eq('id', roomId)
        .single();

      if (!room) return ack?.({ success: false, error: 'Room not found' });
      if (room.created_by !== userId) return ack?.({ success: false, error: 'Only the room owner can pin messages' });

      // Load the message (scoped to the room) to resolve the toggle target.
      const { data: msg } = await supabase
        .from('chat_messages')
        .select('id, room_id, is_pinned')
        .eq('id', messageId)
        .eq('room_id', roomId)
        .single();

      if (!msg) return ack?.({ success: false, error: 'Message not found' });

      const isPinned = typeof pin === 'boolean' ? pin : !msg.is_pinned;

      const { error: dbErr } = await supabase
        .from('chat_messages')
        .update({ is_pinned: isPinned })
        .eq('id', messageId)
        .eq('room_id', roomId);

      if (dbErr) return ack?.({ success: false, error: 'Failed to update message' });

      const roomKey = `room:${roomId}`;
      chatNs.to(roomKey).emit('message_pin_toggled', { roomId, messageId, isPinned });

      ack?.({ success: true, messageId, isPinned });
    } catch (err: any) {
      logger.error({ err: err.message, userId }, '[Chat] pin_message error');
      ack?.({ success: false, error: 'Failed to pin message' });
    }
  });
}
