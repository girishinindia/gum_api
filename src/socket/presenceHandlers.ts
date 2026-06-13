import { Namespace, Socket } from 'socket.io';
import { redis } from '../config/redis';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

// Redis key patterns
const PRESENCE_KEY = (userId: number) => `presence:${userId}`;
const PRESENCE_TTL = 300; // 5 minutes — refreshed on heartbeat

// BUG-31: authoritative online-user roster. A Redis SET is cluster-safe on
// Upstash (unlike redis.keys('presence:*'), which is unreliable there). One
// member per online user; the COUNT for admin dashboards comes from SCARD.
const ONLINE_SET = 'online_users';

// ── Types ──
interface PresenceData {
  userId: number;
  socketId: string;
  name: string;
  avatar: string | null;
  rooms: number[];
  connectedAt: string;
  lastSeen: string;
}

interface MarkReadPayload {
  roomId: number;
  lastReadMessageId: number;
}

/**
 * Register presence + read receipt handlers on a connected socket.
 */
export function registerPresenceHandlers(chatNs: Namespace, socket: Socket) {
  const userId: number = socket.data.userId;
  const user = socket.data.user;
  const userName = `${user.first_name} ${user.last_name}`.trim();

  // ── On connect: set online presence ──
  setOnline(chatNs, socket, userId, userName, user.profile_picture);

  // ── heartbeat — client pings to keep presence alive ──
  socket.on('heartbeat', async () => {
    try {
      const key = PRESENCE_KEY(userId);
      const raw = await redis.get(key);
      if (raw) {
        const data: PresenceData = JSON.parse(raw);
        data.lastSeen = new Date().toISOString();
        await redis.set(key, JSON.stringify(data), 'EX', PRESENCE_TTL);
      } else {
        // Re-establish if expired
        await setOnline(chatNs, socket, userId, userName, user.profile_picture);
      }
    } catch (err: any) {
      logger.error({ err: err.message, userId }, '[Presence] heartbeat error');
    }
  });

  // ── get_online_users — for a specific room ──
  socket.on('get_online_users', async (payload: { roomId: number }, ack?: (res: any) => void) => {
    try {
      const { roomId } = payload;
      if (!roomId) return ack?.({ success: false, error: 'roomId required' });

      const onlineUsers = await getOnlineUsersInRoom(chatNs, roomId);
      ack?.({ success: true, users: onlineUsers });
    } catch (err: any) {
      logger.error({ err: err.message, userId }, '[Presence] get_online_users error');
      ack?.({ success: false, error: 'Failed to get online users' });
    }
  });

  // ── mark_read — persist read receipt + broadcast ──
  socket.on('mark_read', async (payload: MarkReadPayload, ack?: (res: any) => void) => {
    try {
      const { roomId, lastReadMessageId } = payload;
      if (!roomId || !lastReadMessageId) return ack?.({ success: false, error: 'roomId and lastReadMessageId required' });

      // Upsert read receipt (matches existing REST controller pattern)
      const { data, error: dbErr } = await supabase
        .from('chat_read_receipts')
        .upsert(
          {
            room_id: roomId,
            user_id: userId,
            last_read_message_id: lastReadMessageId,
            read_at: new Date().toISOString(),
          },
          { onConflict: 'room_id,user_id' }
        )
        .select('*')
        .single();

      if (dbErr) {
        logger.error({ dbErr }, '[Presence] mark_read DB error');
        return ack?.({ success: false, error: 'Failed to update read receipt' });
      }

      // Broadcast to room so others see the read indicator
      chatNs.to(`room:${roomId}`).emit('read_receipt_updated', {
        roomId,
        userId,
        lastReadMessageId,
        readAt: data?.read_at,
        user: { id: userId, name: userName },
      });

      ack?.({ success: true, receipt: data });
    } catch (err: any) {
      logger.error({ err: err.message, userId }, '[Presence] mark_read error');
      ack?.({ success: false, error: 'Failed to mark read' });
    }
  });

  // ── get_unread_counts — per room for current user ──
  socket.on('get_unread_counts', async (_payload: any, ack?: (res: any) => void) => {
    try {
      // Get all rooms user is in
      const { data: memberships } = await supabase
        .from('chat_room_members')
        .select('room_id')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (!memberships || memberships.length === 0) return ack?.({ success: true, counts: [] });

      const counts: { room_id: number; unread_count: number }[] = [];

      for (const m of memberships) {
        const { data: receipt } = await supabase
          .from('chat_read_receipts')
          .select('last_read_message_id')
          .eq('room_id', m.room_id)
          .eq('user_id', userId)
          .maybeSingle();

        let q = supabase
          .from('chat_messages')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', m.room_id)
          .is('deleted_at', null);

        if (receipt?.last_read_message_id) {
          q = q.gt('id', receipt.last_read_message_id);
        }

        const { count } = await q;
        if ((count || 0) > 0) {
          counts.push({ room_id: m.room_id, unread_count: count || 0 });
        }
      }

      ack?.({ success: true, counts });
    } catch (err: any) {
      logger.error({ err: err.message, userId }, '[Presence] get_unread_counts error');
      ack?.({ success: false, error: 'Failed to get unread counts' });
    }
  });

  // ── On disconnect: remove presence ──
  socket.on('disconnect', async () => {
    await setOffline(chatNs, socket, userId, userName);
  });
}

// ═══════════════════════════════════════════════
// Presence helpers
// ═══════════════════════════════════════════════

async function setOnline(chatNs: Namespace, socket: Socket, userId: number, name: string, avatar: string | null) {
  try {
    // Get rooms this user is a member of
    const { data: memberships } = await supabase
      .from('chat_room_members')
      .select('room_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    const roomIds = memberships?.map((m: any) => m.room_id) || [];

    const presence: PresenceData = {
      userId,
      socketId: socket.id,
      name,
      avatar,
      rooms: roomIds,
      connectedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };

    await redis.set(PRESENCE_KEY(userId), JSON.stringify(presence), 'EX', PRESENCE_TTL);
    // BUG-31: add to the cluster-safe online roster (idempotent across tabs).
    await redis.sadd(ONLINE_SET, String(userId));

    // Notify all rooms this user belongs to
    for (const roomId of roomIds) {
      socket.to(`room:${roomId}`).emit('user_online', {
        userId,
        user: { id: userId, name, avatar },
        roomId,
      });
    }

    // Notify admin namespace
    try {
      const adminNs = chatNs.server.of('/admin');
      adminNs.to('admin:monitor').emit('presence_change', {
        type: 'online',
        userId,
        user: { id: userId, name, avatar },
        rooms: roomIds,
        timestamp: new Date().toISOString(),
      });
    } catch { /* admin ns may not have listeners */ }

    logger.debug({ userId, rooms: roomIds.length }, '[Presence] User online');
  } catch (err: any) {
    logger.error({ err: err.message, userId }, '[Presence] setOnline error');
  }
}

async function setOffline(chatNs: Namespace, socket: Socket, userId: number, name: string) {
  try {
    // Check if user has other active sockets (multi-tab)
    const sockets = await chatNs.fetchSockets();
    const otherSockets = sockets.filter(s => s.data.userId === userId && s.id !== socket.id);

    if (otherSockets.length > 0) {
      // User still connected via another tab — don't mark offline
      logger.debug({ userId, remainingSockets: otherSockets.length }, '[Presence] User still connected on other sockets');
      return;
    }

    // Get rooms before deleting presence
    const raw = await redis.get(PRESENCE_KEY(userId));
    const roomIds = raw ? (JSON.parse(raw) as PresenceData).rooms : [];

    await redis.del(PRESENCE_KEY(userId));
    // BUG-31: last socket for this user closed — drop from the online roster.
    await redis.srem(ONLINE_SET, String(userId));

    // Notify all rooms
    for (const roomId of roomIds) {
      socket.to(`room:${roomId}`).emit('user_offline', {
        userId,
        user: { id: userId, name },
        roomId,
      });
    }

    // Notify admin namespace
    try {
      const adminNs = chatNs.server.of('/admin');
      adminNs.to('admin:monitor').emit('presence_change', {
        type: 'offline',
        userId,
        user: { id: userId, name },
        rooms: roomIds,
        timestamp: new Date().toISOString(),
      });
    } catch { /* admin ns may not have listeners */ }

    logger.debug({ userId }, '[Presence] User offline');
  } catch (err: any) {
    logger.error({ err: err.message, userId }, '[Presence] setOffline error');
  }
}

/**
 * Get all online users in a specific room.
 * Scans connected sockets in the room and cross-references Redis presence.
 */
async function getOnlineUsersInRoom(chatNs: Namespace, roomId: number): Promise<{ userId: number; name: string; avatar: string | null }[]> {
  const roomKey = `room:${roomId}`;
  const sockets = await chatNs.in(roomKey).fetchSockets();

  const seen = new Set<number>();
  const users: { userId: number; name: string; avatar: string | null }[] = [];

  for (const s of sockets) {
    const uid = s.data.userId;
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);

    const user = s.data.user;
    users.push({
      userId: uid,
      name: `${user?.first_name || ''} ${user?.last_name || ''}`.trim(),
      avatar: user?.profile_picture || null,
    });
  }

  return users;
}

/**
 * Get total online user count (for admin dashboard).
 * BUG-31: counts via SCARD on the online_users SET — cluster-safe on Upstash,
 * unlike the previous redis.keys('presence:*') scan.
 */
export async function getOnlineUserCount(): Promise<number> {
  return redis.scard(ONLINE_SET);
}

/**
 * Get all online users (for admin dashboard).
 */
export async function getAllOnlineUsers(): Promise<PresenceData[]> {
  const keys = await redis.keys('presence:*');
  if (keys.length === 0) return [];

  const values = await redis.mget(...keys);
  return values
    .filter((v): v is string => v !== null)
    .map(v => JSON.parse(v) as PresenceData);
}
