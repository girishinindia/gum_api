import { Socket } from 'socket.io';
import { verifyAccess } from '../services/token.service';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

/**
 * Socket.io JWT handshake middleware.
 * Expects: auth.token = "<jwt>" sent during connection.
 * Attaches userId and user metadata to socket.data.
 */
export async function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void) {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));

    const payload = verifyAccess(token);
    const userId = payload.sub;

    // Fetch minimal user data for presence
    const { data: user, error } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, profile_picture')
      .eq('id', userId)
      .single();

    if (error || !user) return next(new Error('User not found'));

    socket.data.userId = userId;
    socket.data.user = user;

    logger.debug({ userId, socketId: socket.id }, '[Socket] Authenticated');
    next();
  } catch (err: any) {
    logger.warn({ err: err.message, socketId: socket.id }, '[Socket] Auth failed');
    next(new Error(err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token'));
  }
}

/**
 * Admin-only namespace middleware.
 * Runs AFTER socketAuthMiddleware. Checks if user has admin role.
 */
export async function adminOnlyMiddleware(socket: Socket, next: (err?: Error) => void) {
  try {
    const userId = socket.data.userId;
    if (!userId) return next(new Error('Not authenticated'));

    // Check if user has any admin role (role_id 1=Super Admin, or role with admin permissions)
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role_id, roles!inner(name)')
      .eq('user_id', userId);

    const isAdmin = userRoles?.some((ur: any) =>
      ur.role_id === 1 || ur.roles?.name?.toLowerCase().includes('admin')
    );

    if (!isAdmin) return next(new Error('Admin access required'));

    socket.data.isAdmin = true;
    next();
  } catch (err: any) {
    next(new Error('Authorization check failed'));
  }
}
