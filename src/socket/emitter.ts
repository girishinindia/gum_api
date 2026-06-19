import type { Namespace } from 'socket.io';
import { getIO } from './index';
import { logger } from '../utils/logger';

/**
 * Socket emitter utility — lets REST controllers push real-time events
 * after successful DB writes.
 *
 * All methods are fire-and-forget (never throws to caller).
 * If Socket.io isn't initialized yet the call is silently skipped.
 */

function chatNs() {
  try {
    return getIO().of('/chat');
  } catch {
    return null;
  }
}

function adminNs() {
  try {
    return getIO().of('/admin');
  } catch {
    return null;
  }
}

/** Expose the /chat namespace so services can inspect who is currently in a room. */
export function getChatNamespace(): Namespace | null {
  return chatNs();
}

// ═══════════════════════════════════════════════
// Messages
// ═══════════════════════════════════════════════

/** Broadcast a new message to everyone in the room */
export function emitNewMessage(roomId: number, message: any) {
  try {
    const ns = chatNs();
    if (!ns) return;

    ns.to(`room:${roomId}`).emit('new_message', { roomId, message });

    adminNs()?.to('admin:monitor').emit('chat_activity', {
      type: 'new_message',
      roomId,
      message,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error({ err: e.message }, '[SocketEmitter] emitNewMessage error');
  }
}

/** Broadcast that a message was edited */
export function emitMessageEdited(roomId: number, message: any) {
  try {
    chatNs()?.to(`room:${roomId}`).emit('message_edited', { roomId, message });

    adminNs()?.to('admin:monitor').emit('chat_activity', {
      type: 'message_edited',
      roomId,
      messageId: message.id,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error({ err: e.message }, '[SocketEmitter] emitMessageEdited error');
  }
}

/** Broadcast that a message was deleted */
export function emitMessageDeleted(roomId: number, messageId: number) {
  try {
    chatNs()?.to(`room:${roomId}`).emit('message_deleted', { roomId, messageId });

    adminNs()?.to('admin:monitor').emit('chat_activity', {
      type: 'message_deleted',
      roomId,
      messageId,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error({ err: e.message }, '[SocketEmitter] emitMessageDeleted error');
  }
}

/** Broadcast that a message was pinned/unpinned */
export function emitMessagePinToggled(roomId: number, messageId: number, isPinned: boolean) {
  try {
    chatNs()?.to(`room:${roomId}`).emit('message_pin_toggled', { roomId, messageId, isPinned });
  } catch (e: any) {
    logger.error({ err: e.message }, '[SocketEmitter] emitMessagePinToggled error');
  }
}

// ═══════════════════════════════════════════════
// Reactions
// ═══════════════════════════════════════════════

/** Broadcast that a reaction was added */
export function emitReactionAdded(roomId: number, messageId: number, userId: number, emoji: string, reaction?: any) {
  try {
    chatNs()?.to(`room:${roomId}`).emit('reaction_added', { roomId, messageId, userId, emoji, reaction });
  } catch (e: any) {
    logger.error({ err: e.message }, '[SocketEmitter] emitReactionAdded error');
  }
}

/** Broadcast that a reaction was removed */
export function emitReactionRemoved(roomId: number, messageId: number, userId: number, emoji: string) {
  try {
    chatNs()?.to(`room:${roomId}`).emit('reaction_removed', { roomId, messageId, userId, emoji });
  } catch (e: any) {
    logger.error({ err: e.message }, '[SocketEmitter] emitReactionRemoved error');
  }
}

// ═══════════════════════════════════════════════
// Read Receipts
// ═══════════════════════════════════════════════

/** Broadcast that a user's read receipt was updated */
export function emitReadReceiptUpdated(roomId: number, userId: number, lastReadMessageId: number, readAt: string, userName?: string) {
  try {
    chatNs()?.to(`room:${roomId}`).emit('read_receipt_updated', {
      roomId,
      userId,
      lastReadMessageId,
      readAt,
      user: { id: userId, name: userName },
    });
  } catch (e: any) {
    logger.error({ err: e.message }, '[SocketEmitter] emitReadReceiptUpdated error');
  }
}

// ═══════════════════════════════════════════════
// Rooms
// ═══════════════════════════════════════════════

/** Notify everyone in a room that it was closed / frozen (soft-deleted, hard-deleted, or deactivated). */
export function emitRoomClosed(roomId: number, reason?: string) {
  try {
    chatNs()?.to(`room:${roomId}`).emit('room_closed', { roomId, reason: reason ?? null });
    adminNs()?.to('admin:monitor').emit('chat_activity', {
      type: 'room_closed',
      roomId,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error({ err: e.message }, '[SocketEmitter] emitRoomClosed error');
  }
}
