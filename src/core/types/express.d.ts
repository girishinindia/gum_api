// ═══════════════════════════════════════════════════════════════
// Express type augmentation.
// Allows authenticated handlers to read req.user without casting.
// The authenticate middleware populates this after JWT verification.
// ═══════════════════════════════════════════════════════════════

import type { AuthUser } from './auth.types';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId?: string;
    }
  }
}

export {};
