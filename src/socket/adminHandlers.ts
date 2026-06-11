import { Namespace, Socket } from 'socket.io';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { getAllOnlineUsers, getOnlineUserCount } from './presenceHandlers';

/**
 * Register /admin namespace event handlers on a connected socket.
 * All callers are already verified as admin via adminOnlyMiddleware.
 */
export function registerAdminHandlers(adminNs: Namespace, chatNs: Namespace, socket: Socket) {
  const userId: number = socket.data.userId;

  // ── get_online_count — total online users ──
  socket.on('get_online_count', async (_payload: any, ack?: (res: any) => void) => {
    try {
      const count = await getOnlineUserCount();
      ack?.({ success: true, count });
    } catch (err: any) {
      logger.error({ err: err.message, userId }, '[Admin] get_online_count error');
      ack?.({ success: false, error: 'Failed to get online count' });
    }
  });

  // ── get_online_users — full list with presence data ──
  socket.on('get_online_users', async (_payload: any, ack?: (res: any) => void) => {
    try {
      const users = await getAllOnlineUsers();
      ack?.({ success: true, users });
    } catch (err: any) {
      logger.error({ err: err.message, userId }, '[Admin] get_online_users error');
      ack?.({ success: false, error: 'Failed to get online users' });
    }
  });

  // ── get_chat_stats — aggregate stats for dashboard ──
  socket.on('get_chat_stats', async (_payload: any, ack?: (res: any) => void) => {
    try {
      // Run queries in parallel
      const [roomsRes, messagesRes, onlineCount, activeMembersRes] = await Promise.all([
        supabase.from('chat_rooms').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('chat_messages').select('*', { count: 'exact', head: true }).is('deleted_at', null),
        getOnlineUserCount(),
        supabase.from('chat_room_members').select('user_id', { count: 'exact', head: true }).eq('is_active', true),
      ]);

      // Messages today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: messagesToday } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .gte('created_at', todayStart.toISOString());

      ack?.({
        success: true,
        stats: {
          activeRooms: roomsRes.count || 0,
          totalMessages: messagesRes.count || 0,
          messagesToday: messagesToday || 0,
          onlineUsers: onlineCount,
          activeMembers: activeMembersRes.count || 0,
        },
      });
    } catch (err: any) {
      logger.error({ err: err.message, userId }, '[Admin] get_chat_stats error');
      ack?.({ success: false, error: 'Failed to get chat stats' });
    }
  });

  // ── get_room_activity — recent activity per room ──
  socket.on('get_room_activity', async (payload: { limit?: number }, ack?: (res: any) => void) => {
    try {
      const limit = Math.min(payload?.limit || 20, 50);

      // Get rooms with latest message info
      const { data: rooms, error: e } = await supabase
        .from('chat_rooms')
        .select('id, name, room_type, is_active, created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (e) return ack?.({ success: false, error: e.message });

      // For each room, get member count and last message timestamp
      const activity = await Promise.all(
        (rooms || []).map(async (room: any) => {
          const [membersRes, lastMsgRes] = await Promise.all([
            supabase
              .from('chat_room_members')
              .select('*', { count: 'exact', head: true })
              .eq('room_id', room.id)
              .eq('is_active', true),
            supabase
              .from('chat_messages')
              .select('id, created_at, content, sender_id, users!chat_messages_sender_id_fkey(first_name, last_name)')
              .eq('room_id', room.id)
              .is('deleted_at', null)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);

          // Get online users in this room from chat namespace
          const roomKey = `room:${room.id}`;
          let onlineInRoom = 0;
          try {
            const sockets = await chatNs.in(roomKey).fetchSockets();
            const uniqueUsers = new Set(sockets.map(s => s.data.userId));
            onlineInRoom = uniqueUsers.size;
          } catch { /* room may not exist in socket */ }

          return {
            ...room,
            memberCount: membersRes.count || 0,
            onlineCount: onlineInRoom,
            lastMessage: lastMsgRes.data
              ? {
                  id: lastMsgRes.data.id,
                  content: (lastMsgRes.data.content || '').substring(0, 80),
                  senderName: lastMsgRes.data.users
                    ? `${(lastMsgRes.data.users as any).first_name} ${(lastMsgRes.data.users as any).last_name}`.trim()
                    : 'Unknown',
                  timestamp: lastMsgRes.data.created_at,
                }
              : null,
          };
        })
      );

      ack?.({ success: true, rooms: activity });
    } catch (err: any) {
      logger.error({ err: err.message, userId }, '[Admin] get_room_activity error');
      ack?.({ success: false, error: 'Failed to get room activity' });
    }
  });

  // ── get_recent_messages — latest messages across all rooms (live feed) ──
  socket.on('get_recent_messages', async (payload: { limit?: number }, ack?: (res: any) => void) => {
    try {
      const limit = Math.min(payload?.limit || 30, 100);

      const { data, error: e } = await supabase
        .from('chat_messages')
        .select('id, room_id, content, message_type, created_at, sender_id, users!chat_messages_sender_id_fkey(id, first_name, last_name, profile_picture:avatar_url), chat_rooms!inner(id, name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (e) return ack?.({ success: false, error: e.message });

      ack?.({ success: true, messages: data || [] });
    } catch (err: any) {
      logger.error({ err: err.message, userId }, '[Admin] get_recent_messages error');
      ack?.({ success: false, error: 'Failed to get recent messages' });
    }
  });

  logger.debug({ userId }, '[Admin] Handlers registered');
}
