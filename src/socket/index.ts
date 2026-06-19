import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';
import { socketAuthMiddleware, adminOnlyMiddleware } from './auth';
import { registerChatHandlers } from './chatHandlers';
import { registerPresenceHandlers } from './presenceHandlers';
import { registerAdminHandlers } from './adminHandlers';

let io: Server;

/**
 * Initialize Socket.io server.
 * - Attaches to the existing HTTP server (shared port with Express).
 * - Sets up Redis adapter for horizontal scaling via Upstash pub/sub.
 * - Creates two namespaces: /chat (users) and /admin (admin monitoring).
 */
export function initSocket(httpServer: HttpServer): Server {
  // Mirror the Express CORS logic so the Socket.io handshake accepts the same
  // origins (incl. first-party growupmore.com sub-domains + dev hosts). A
  // blocked handshake silently kills live chat (typing, new messages).
  const socketCorsOpen = config.cors.origins.includes('*');
  const socketCorsWhitelist = new Set(config.cors.origins.map((o) => o.trim().replace(/\/+$/, '').toLowerCase()));
  const SOCKET_FIRST_PARTY = /^https:\/\/([a-z0-9-]+\.)*growupmore\.com$/i;
  const SOCKET_DEV_ORIGINS = [
    /^https?:\/\/localhost(?::\d+)?$/i,
    /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i,
    /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(?::\d+)?$/i,
    /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?$/i,
  ];

  io = new Server(httpServer, {
    cors: {
      origin(origin, cb) {
        if (!origin || socketCorsOpen) return cb(null, true);
        const n = origin.trim().replace(/\/+$/, '').toLowerCase();
        if (socketCorsWhitelist.has(n) || SOCKET_FIRST_PARTY.test(n) || SOCKET_DEV_ORIGINS.some((re) => re.test(origin))) {
          return cb(null, true);
        }
        return cb(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
    transports: ['websocket', 'polling'],
  });

  // ── Redis Adapter ──
  // Use separate pub/sub clients (required by @socket.io/redis-adapter)
  const pubClient = new Redis(config.redis.url, { maxRetriesPerRequest: 3, lazyConnect: true });
  const subClient = pubClient.duplicate();

  Promise.all([pubClient.connect(), subClient.connect()])
    .then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      logger.info('[Socket] Redis adapter connected');
    })
    .catch((err) => {
      logger.error({ err }, '[Socket] Redis adapter failed — falling back to in-memory');
    });

  // ── /chat namespace — authenticated users ──
  const chatNs = io.of('/chat');
  chatNs.use(socketAuthMiddleware);
  chatNs.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;
    logger.info({ userId, socketId: socket.id }, '[Socket] /chat connected');

    // Auto-join user's personal channel for DMs / notifications
    socket.join(`user:${userId}`);

    // Register chat event handlers (messages, typing, reactions, etc.)
    registerChatHandlers(chatNs, socket);

    // Register presence + read receipt handlers
    registerPresenceHandlers(chatNs, socket);

    socket.on('disconnect', (reason) => {
      logger.debug({ userId, socketId: socket.id, reason }, '[Socket] /chat disconnected');
    });

    socket.on('error', (err) => {
      logger.error({ userId, socketId: socket.id, err }, '[Socket] /chat error');
    });
  });

  // ── /admin namespace — admin-only monitoring ──
  const adminNs = io.of('/admin');
  adminNs.use(socketAuthMiddleware);
  adminNs.use(adminOnlyMiddleware);
  adminNs.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;
    logger.info({ userId, socketId: socket.id }, '[Socket] /admin connected');

    socket.join('admin:monitor');

    // Register admin monitoring event handlers
    registerAdminHandlers(adminNs, chatNs, socket);

    socket.on('disconnect', (reason) => {
      logger.debug({ userId, socketId: socket.id, reason }, '[Socket] /admin disconnected');
    });
  });

  logger.info('[Socket] Server initialized — namespaces: /chat, /admin');
  return io;
}

/**
 * Get the Socket.io server instance.
 * Use this to emit events from REST controllers.
 */
export function getIO(): Server {
  if (!io) throw new Error('Socket.io not initialized — call initSocket() first');
  return io;
}
