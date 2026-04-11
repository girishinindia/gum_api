// ═══════════════════════════════════════════════════════════════
// Auth-related shared types.
// AuthUser is what the authenticate middleware attaches to req.user
// after verifying the JWT and loading the user via udf_get_users.
// ═══════════════════════════════════════════════════════════════

export interface AuthUser {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  roles: string[];        // role codes: ['admin', 'user']
  permissions: string[];  // permission codes: ['users.read', 'roles.write']
}

export interface JwtPayload {
  sub: number;            // user id
  email: string;
  roles: string[];
  permissions: string[];
  iat?: number;
  exp?: number;
  /**
   * Session identifier. Minted once at login and **preserved across
   * refresh** so session-level revocation (redisRevoked.add(jti, ttl))
   * can kill all tokens belonging to a session in a single operation.
   */
  jti?: string;
  /**
   * Access-token identifier. Minted fresh on **every** call to
   * `signAccessToken`, guaranteeing each issuance is uniquely
   * identifiable even when refresh fires inside the same clock second
   * as the previous issuance.
   *
   * Why we need it (commercial requirement):
   *   1. Audit — logs can distinguish "which access token was actually
   *      used" without depending on byte-diffs of the signed blob.
   *   2. Per-issuance revocation — future work can blocklist a single
   *      ati without killing the whole session (jti-level revocation
   *      remains the default).
   *   3. OAuth 2.0 Security BCP (RFC 6819 §5.2.2) — distinguishable
   *      issuances are a recommended practice for access tokens.
   *
   * Optional in the type only for backward compatibility with already-
   * issued tokens in flight during rollout. All new tokens signed by
   * `signAccessToken` include it.
   */
  ati?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: string;
  refreshExpiresIn: string;
}
