/**
 * Chat notification fan-out (Phase 1)
 * ───────────────────────────────────
 * When a new chat message is created, alert room members who are NOT currently
 * viewing the room:
 *   • online elsewhere  → in-app notification only
 *   • offline           → in-app + push (FCM / web-push) so the device wakes up
 * The sender and any muted members are excluded. Members who are actively in the
 * room socket already receive the live `new_message` event, so they are skipped.
 *
 * Fire-and-forget: `notifyNewMessage` never throws to the caller and is not
 * awaited on the send path, so message latency is unaffected.
 */

import type { Namespace } from 'socket.io';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';
import { getOnlineUserIds } from '../socket/presenceHandlers';
import { sendNotification } from './notification.service';

interface NotifyNewMessageArgs {
  roomId: number;
  messageId: number;
  senderId: number;
  senderName: string;
  messageType: string;
  content?: string | null;
  /** Optional — looked up if omitted. */
  roomName?: string | null;
}

const PREVIEW_MAX = 140;

function previewFor(messageType: string, content?: string | null): string {
  if (messageType === 'text') {
    const t = (content || '').trim();
    if (!t) return 'New message';
    return t.length > PREVIEW_MAX ? `${t.slice(0, PREVIEW_MAX)}…` : t;
  }
  switch (messageType) {
    case 'image':   return 'Sent an image';
    case 'sticker': return 'Sent a sticker';
    case 'emoji':   return 'Sent an emoji';
    case 'file':    return 'Sent a file';
    default:        return 'New message';
  }
}

async function usersInRoom(ns: Namespace | null, roomId: number): Promise<Set<number>> {
  const inRoom = new Set<number>();
  if (!ns) return inRoom;
  try {
    const sockets = await ns.in(`room:${roomId}`).fetchSockets();
    for (const s of sockets) {
      const uid = (s.data as any)?.userId;
      if (uid) inRoom.add(uid);
    }
  } catch (e: any) {
    logger.debug({ err: e?.message, roomId }, '[chatNotify] usersInRoom lookup failed');
  }
  return inRoom;
}

async function run(ns: Namespace | null, args: NotifyNewMessageArgs): Promise<void> {
  const { roomId, messageId, senderId, senderName, messageType, content } = args;

  // 1. Active members, minus the sender and any muted members
  const { data: members } = await supabase
    .from('chat_room_members')
    .select('user_id, is_muted')
    .eq('room_id', roomId)
    .eq('is_active', true);

  if (!members || members.length === 0) return;

  const candidates = members
    .filter((m: any) => m.user_id !== senderId && !m.is_muted)
    .map((m: any) => m.user_id as number);
  if (candidates.length === 0) return;

  // 2. Skip anyone currently viewing the room — they get the live socket event
  const inRoom = await usersInRoom(ns, roomId);
  const targets = candidates.filter((id) => !inRoom.has(id));
  if (targets.length === 0) return;

  // 3. Online targets → in-app only; offline → in-app + push
  const online = await getOnlineUserIds(targets);

  // Room name for the notification title (best-effort)
  let roomName = args.roomName ?? null;
  if (roomName === null) {
    const { data: room } = await supabase.from('chat_rooms').select('name').eq('id', roomId).maybeSingle();
    roomName = room?.name ?? null;
  }

  const title = roomName ? `${senderName} • ${roomName}` : senderName;
  const body = previewFor(messageType, content);

  await Promise.allSettled(
    targets.map((uid) => {
      const channels: ('in_app' | 'push')[] = online.has(uid) ? ['in_app'] : ['in_app', 'push'];
      return sendNotification({
        userId: uid,
        notificationType: 'chat_message',
        title,
        message: body,
        channels,
        referenceType: 'chat_room',
        referenceId: roomId,
        pushUrl: `/chat/${roomId}`,
        metadata: { room_id: roomId, message_id: messageId, sender_id: senderId },
        createdBy: senderId,
      });
    }),
  );
}

/** Fire-and-forget: alert away/offline room members about a new message. */
export function notifyNewMessage(ns: Namespace | null, args: NotifyNewMessageArgs): void {
  run(ns, args).catch((e) =>
    logger.error({ err: e?.message, roomId: args.roomId }, '[chatNotify] notifyNewMessage failed'),
  );
}
