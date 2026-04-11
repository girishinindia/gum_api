/* eslint-disable no-console */
/**
 * Step 6 — Core middleware stack verification.
 *
 * Spins up an in-memory Express app that mounts the real authenticate
 * + authorize middlewares (backed by live Redis for the blocklist)
 * and the real errorHandler. Then hits it over HTTP and asserts wire
 * responses. No mocks of the middleware under test.
 *
 * Sections:
 *   1. authenticate — missing / malformed / valid / wrong-secret / expired
 *   2. authenticate — revoked via redisRevoked
 *   3. authorize(single permission) — allow / deny
 *   4. authorize([a, b]) — ALL required
 *   5. authorizeAny — at least one
 *   6. authorizeRole — by role code
 *   7. authenticateOptional — anonymous pass, valid decorates, bad ignored
 *   8. Error envelope shape — code/message/details present for 401/403
 *   9. Cleanup Redis test keys
 */

import type { Server } from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import 'express-async-errors';
import jwt from 'jsonwebtoken';

import { env } from '../src/config/env';
import { signAccessToken, signTokenPair, secondsUntilExpiry } from '../src/core/auth/jwt';
import { errorHandler, notFoundHandler } from '../src/core/errors/error-handler';
import { authenticate, authenticateOptional } from '../src/core/middlewares/authenticate';
import { authorize, authorizeAny, authorizeRole } from '../src/core/middlewares/authorize';
import { getRedisClient, redisRevoked } from '../src/database/redis';
import type { AuthUser } from '../src/core/types/auth.types';

// ─────────────────────────────────────────────────────────────
// Reporter
// ─────────────────────────────────────────────────────────────

type CheckResult = { section: string; name: string; ok: boolean; detail: string };
const results: CheckResult[] = [];
const record = (section: string, name: string, ok: boolean, detail: string): void => {
  results.push({ section, name, ok, detail });
  const mark = ok ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✖\x1b[0m';
  console.log(`  ${mark}  ${name.padEnd(62)} ${detail}`);
};

// ─────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────

const user: Pick<AuthUser, 'id' | 'email' | 'roles' | 'permissions'> = {
  id: 42,
  email: 'testuser@example.com',
  roles: ['instructor'],
  permissions: ['users.read', 'roles.read']
};

// Pre-minted tokens for the test session
const live = signAccessToken({ user });
const pair = signTokenPair(user);

// ─────────────────────────────────────────────────────────────
// App under test
// ─────────────────────────────────────────────────────────────

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = 'verify-middleware';
    next();
  });

  // 1/2. Strict authenticate → echoes back req.user
  app.get('/private', authenticate, (req, res) => {
    res.json({ success: true, message: 'ok', data: req.user });
  });

  // 3. Single permission
  app.get('/users', authenticate, authorize('users.read'), (_req, res) => {
    res.json({ success: true, message: 'ok', data: [] });
  });

  // 4. ALL required permissions
  app.delete('/users/:id', authenticate, authorize(['users.read', 'users.delete']), (_req, res) => {
    res.json({ success: true, message: 'deleted' });
  });

  // 5. Any-of (authorizeAny)
  app.get('/dashboard', authenticate, authorizeAny(['users.read', 'admin.dashboard']), (_req, res) => {
    res.json({ success: true, message: 'dashboard' });
  });

  // 6. Role-based
  app.get('/instructor', authenticate, authorizeRole('instructor'), (_req, res) => {
    res.json({ success: true, message: 'instructor area' });
  });
  app.get('/admin', authenticate, authorizeRole('admin'), (_req, res) => {
    res.json({ success: true, message: 'admin area' });
  });

  // 7. authenticateOptional
  app.get('/optional', authenticateOptional, (req, res) => {
    res.json({
      success: true,
      message: 'ok',
      data: { user: req.user ?? null }
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

// ─────────────────────────────────────────────────────────────
// HTTP client
// ─────────────────────────────────────────────────────────────

type WireResponse = { status: number; body: Record<string, unknown> };

async function call(base: string, method: string, path: string, headers: Record<string, string> = {}): Promise<WireResponse> {
  const res = await fetch(base + path, { method, headers });
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

const auth = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

// ─────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const app = buildApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('bad addr');
  const base = `http://127.0.0.1:${addr.port}`;

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Step 6 — Core middleware stack');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  App listening on ${base}\n`);

  // ── 1. authenticate happy + 401 paths ──────────────────────
  console.log('1. authenticate (token presence, shape, signature, expiry)\n');
  {
    const r = await call(base, 'GET', '/private');
    record('authN', 'no Authorization header → 401', r.status === 401 && r.body.code === 'UNAUTHORIZED', `status=${r.status}, code=${r.body.code}`);
  }
  {
    const r = await call(base, 'GET', '/private', { authorization: 'Basic abc' });
    record('authN', 'non-Bearer scheme → 401', r.status === 401, `status=${r.status}`);
  }
  {
    const r = await call(base, 'GET', '/private', { authorization: 'Bearer ' });
    record('authN', 'empty bearer → 401', r.status === 401, `status=${r.status}`);
  }
  {
    const r = await call(base, 'GET', '/private', auth('not-a-real-jwt'));
    record('authN', 'garbage token → 401 INVALID_TOKEN', r.status === 401 && r.body.code === 'INVALID_TOKEN', `code=${r.body.code}`);
  }
  {
    // Sign with wrong secret
    const badToken = jwt.sign({ sub: 1, email: 'x', roles: [], permissions: [], jti: 'x' }, 'wrong-secret-at-least-32-chars-long!!!!!', { expiresIn: '1m' });
    const r = await call(base, 'GET', '/private', auth(badToken));
    record('authN', 'wrong signing secret → 401 INVALID_TOKEN', r.status === 401 && r.body.code === 'INVALID_TOKEN', `code=${r.body.code}`);
  }
  {
    // Expired token (negative expiresIn not allowed — sign then backdate exp)
    const now = Math.floor(Date.now() / 1000);
    const expired = jwt.sign(
      { sub: 1, email: 'x@y.z', roles: [], permissions: [], jti: 'expired-jti', iat: now - 100, exp: now - 10 },
      env.JWT_ACCESS_SECRET
    );
    const r = await call(base, 'GET', '/private', auth(expired));
    record('authN', 'expired token → 401 TOKEN_EXPIRED', r.status === 401 && r.body.code === 'TOKEN_EXPIRED', `code=${r.body.code}`);
  }
  {
    const r = await call(base, 'GET', '/private', auth(live.token));
    const d = r.body.data as AuthUser;
    record(
      'authN',
      'valid token → 200 with req.user populated',
      r.status === 200 && d.id === 42 && d.email === 'testuser@example.com' && d.permissions.includes('users.read'),
      `id=${d?.id}, perms=${JSON.stringify(d?.permissions)}`
    );
  }

  // ── 2. revocation via redisRevoked ─────────────────────────
  console.log('\n2. authenticate — revocation via blocklist\n');
  {
    // Use the token pair so we have a shared jti
    const r1 = await call(base, 'GET', '/private', auth(pair.accessToken));
    record('revoke', 'pre-revoke: token works', r1.status === 200, `status=${r1.status}`);

    // Revoke the jti
    // We know the access token's remaining life is env.JWT_ACCESS_EXPIRES_IN.
    // Use a 60s TTL (shorter than the token itself) for the blocklist.
    await redisRevoked.add(pair.jti, 60);
    const r2 = await call(base, 'GET', '/private', auth(pair.accessToken));
    record(
      'revoke',
      'after add() → 401 TOKEN_REVOKED',
      r2.status === 401 && r2.body.code === 'TOKEN_REVOKED',
      `status=${r2.status}, code=${r2.body.code}`
    );

    // Remove and re-test
    await redisRevoked.remove(pair.jti);
    const r3 = await call(base, 'GET', '/private', auth(pair.accessToken));
    record('revoke', 'after remove() → 200', r3.status === 200, `status=${r3.status}`);
  }
  {
    // add() with ttl <= 0 should be a no-op
    const probeJti = `verify-probe-${crypto.randomUUID()}`;
    await redisRevoked.add(probeJti, 0);
    const isRevoked = await redisRevoked.isRevoked(probeJti);
    record('revoke', 'add(ttl=0) is a no-op', isRevoked === false, `isRevoked=${isRevoked}`);
  }

  // ── 3. authorize(single) ───────────────────────────────────
  console.log('\n3. authorize(single permission)\n');
  {
    const r = await call(base, 'GET', '/users', auth(live.token));
    record('authZ.single', 'user has users.read → 200', r.status === 200, `status=${r.status}`);
  }
  {
    // Sign a token without the required permission
    const { token } = signAccessToken({ user: { ...user, permissions: ['roles.read'] } });
    const r = await call(base, 'GET', '/users', auth(token));
    const d = r.body.details as { required: string[]; missing: string[] };
    record(
      'authZ.single',
      'missing users.read → 403 with details',
      r.status === 403 && r.body.code === 'FORBIDDEN' && d?.missing?.includes('users.read'),
      `code=${r.body.code}, missing=${JSON.stringify(d?.missing)}`
    );
  }
  {
    const r = await call(base, 'GET', '/users');
    record(
      'authZ.single',
      'no auth on protected route → 401 (not 403)',
      r.status === 401,
      `status=${r.status}`
    );
  }

  // ── 4. authorize([all]) ────────────────────────────────────
  console.log('\n4. authorize([a, b]) — ALL required\n');
  {
    const r = await call(base, 'DELETE', '/users/1', auth(live.token));
    // live token lacks users.delete
    record('authZ.all', 'missing one of two → 403', r.status === 403, `status=${r.status}`);
  }
  {
    const { token } = signAccessToken({
      user: { ...user, permissions: ['users.read', 'users.delete'] }
    });
    const r = await call(base, 'DELETE', '/users/1', auth(token));
    record('authZ.all', 'has both → 200', r.status === 200, `status=${r.status}`);
  }

  // ── 5. authorizeAny ────────────────────────────────────────
  console.log('\n5. authorizeAny — at least one\n');
  {
    const r = await call(base, 'GET', '/dashboard', auth(live.token));
    record('authZ.any', 'has users.read (one of two) → 200', r.status === 200, `status=${r.status}`);
  }
  {
    const { token } = signAccessToken({ user: { ...user, permissions: ['unrelated'] } });
    const r = await call(base, 'GET', '/dashboard', auth(token));
    record('authZ.any', 'has neither → 403', r.status === 403, `status=${r.status}`);
  }

  // ── 6. authorizeRole ───────────────────────────────────────
  console.log('\n6. authorizeRole\n');
  {
    const r = await call(base, 'GET', '/instructor', auth(live.token));
    record('authZ.role', 'role=instructor accesses /instructor → 200', r.status === 200, `status=${r.status}`);
  }
  {
    const r = await call(base, 'GET', '/admin', auth(live.token));
    const d = r.body.details as { requiredRoles: string[] };
    record(
      'authZ.role',
      'role mismatch → 403 with role info',
      r.status === 403 && d?.requiredRoles?.includes('admin'),
      `status=${r.status}, required=${JSON.stringify(d?.requiredRoles)}`
    );
  }

  // ── 7. authenticateOptional ────────────────────────────────
  console.log('\n7. authenticateOptional\n');
  {
    const r = await call(base, 'GET', '/optional');
    const d = r.body.data as { user: AuthUser | null };
    record('authN.optional', 'no token → 200 with user=null', r.status === 200 && d.user === null, `user=${d.user}`);
  }
  {
    const r = await call(base, 'GET', '/optional', auth(live.token));
    const d = r.body.data as { user: AuthUser };
    record('authN.optional', 'valid token → 200 with user populated', r.status === 200 && d.user?.id === 42, `id=${d.user?.id}`);
  }
  {
    const r = await call(base, 'GET', '/optional', auth('garbage.token.here'));
    const d = r.body.data as { user: AuthUser | null };
    record('authN.optional', 'bad token → 200 with user=null (soft-fail)', r.status === 200 && d.user === null, `user=${d.user}`);
  }

  // ── 8. Error envelope consistency ──────────────────────────
  console.log('\n8. Error envelope shape\n');
  {
    const r = await call(base, 'GET', '/private');
    const e = r.body;
    const ok = e.success === false && typeof e.message === 'string' && typeof e.code === 'string';
    record('envelope', '401 body is { success:false, message, code }', ok, `keys=${Object.keys(e).join(',')}`);
  }
  {
    const r = await call(base, 'GET', '/admin', auth(live.token));
    const e = r.body;
    const ok =
      e.success === false &&
      e.code === 'FORBIDDEN' &&
      typeof e.details === 'object' &&
      e.details !== null;
    record('envelope', '403 body has { details } payload', ok, `details=${JSON.stringify(e.details)}`);
  }

  // ── 9. Sanity: secondsUntilExpiry helper ───────────────────
  console.log('\n9. secondsUntilExpiry helper\n');
  {
    const now = Math.floor(Date.now() / 1000);
    const s1 = secondsUntilExpiry({ sub: 1, email: 'a', roles: [], permissions: [], jti: 'x', exp: now + 300, iat: now });
    record('helper', 'positive remaining ≈ 300s', s1 >= 298 && s1 <= 300, `got=${s1}`);
    const s2 = secondsUntilExpiry({ sub: 1, email: 'a', roles: [], permissions: [], jti: 'x', exp: now - 10, iat: now });
    record('helper', 'expired clamps to 0', s2 === 0, `got=${s2}`);
    const s3 = secondsUntilExpiry({ sub: 1, email: 'a', roles: [], permissions: [], jti: 'x' });
    record('helper', 'missing exp → 0', s3 === 0, `got=${s3}`);
  }

  // ── Cleanup ────────────────────────────────────────────────
  console.log('\n10. Cleanup\n');
  {
    const client = getRedisClient();
    // Our tests added exactly one key temporarily (removed). Just ensure pair.jti is gone.
    await client.del(`revoked:${pair.jti}`);
    record('cleanup', 'test jti removed from Redis', true, 'ok');
  }

  // ── Summary ────────────────────────────────────────────────
  const bySection = new Map<string, { ok: number; total: number }>();
  for (const r of results) {
    const s = bySection.get(r.section) ?? { ok: 0, total: 0 };
    s.total++;
    if (r.ok) s.ok++;
    bySection.set(r.section, s);
  }

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('══════════════════════════════════════════════════════');
  const labels: Record<string, string> = {
    authN: '1. authenticate       ',
    revoke: '2. revocation         ',
    'authZ.single': '3. authorize(single)  ',
    'authZ.all': '4. authorize([all])   ',
    'authZ.any': '5. authorizeAny       ',
    'authZ.role': '6. authorizeRole      ',
    'authN.optional': '7. authenticateOptional',
    envelope: '8. Error envelope     ',
    helper: '9. secondsUntilExpiry ',
    cleanup: '10. Cleanup            '
  };
  for (const [key, label] of Object.entries(labels)) {
    const s = bySection.get(key);
    if (s) console.log(`  ${label}: ${s.ok}/${s.total}`);
  }
  const okCount = results.filter((r) => r.ok).length;
  console.log('  ──────────────────────────────');
  console.log(`  Total                : ${okCount}/${results.length}`);
  console.log('══════════════════════════════════════════════════════\n');

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log('FAILED CHECKS:');
    for (const f of failed) console.log(`  - [${f.section}] ${f.name}: ${f.detail}`);
  } else {
    console.log('All Step 6 middleware stack checks passed.');
  }

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await getRedisClient().quit();
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\nFatal error in verify-middleware:', err);
  try {
    await getRedisClient().quit();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
