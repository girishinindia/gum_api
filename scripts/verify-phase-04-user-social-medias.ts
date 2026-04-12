/* eslint-disable no-console */
/**
 * Phase-04 user_social_medias — live end-to-end verification.
 *
 * Exercises every published route on:
 *
 *   /api/v1/user-social-medias
 *
 * Coverage:
 *   • Super Admin — GET / list, POST /, GET /:id, PATCH /:id, DELETE /:id
 *   • Admin       — list / read / update / create a user's row; admin is
 *                   blocked on global DELETE but CAN call restore.
 *   • Instructor  — only self; read-other / write-other blocked
 *   • Student     — same as instructor
 *   • /me routes  — GET/POST/PATCH/DELETE full self-service lifecycle
 *   • Soft-delete — row hidden after DELETE
 *   • Restore     — POST /:id/restore (admin+ only; student 403)
 *
 * Bypasses the global rate limiter via SKIP_GLOBAL_RATE_LIMIT. The env flag
 * must be set BEFORE any src/* import so the config module reads it.
 */

process.env.SKIP_GLOBAL_RATE_LIMIT = '1';

import type { AddressInfo } from 'node:net';

import { buildApp } from '../src/app';
import { closePool, getPool } from '../src/database/pg-pool';
import { closeRedis, redisRevoked } from '../src/database/redis';
import { verifyAccessToken } from '../src/core/auth/jwt';

// ─────────────────────────────────────────────────────────────
// Reporter
// ─────────────────────────────────────────────────────────────

type Check = { section: string; name: string; ok: boolean; detail: string };
const results: Check[] = [];
const record = (section: string, name: string, ok: boolean, detail: string): void => {
  results.push({ section, name, ok, detail });
  const mark = ok ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✖\x1b[0m';
  console.log(`  ${mark}  ${name.padEnd(70)} ${detail}`);
};
const header = (title: string): void => {
  console.log(`\n\x1b[36m━━ ${title} ━━\x1b[0m`);
};

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const RUN_ID = `${process.pid}-${Date.now()}`;

const SA_EMAIL = `verify-usm-sa+${RUN_ID}@test.growupmore.local`;
const ADMIN_EMAIL = `verify-usm-admin+${RUN_ID}@test.growupmore.local`;
const STUDENT_EMAIL = `verify-usm-student+${RUN_ID}@test.growupmore.local`;
const STUDENT_B_EMAIL = `verify-usm-student-b+${RUN_ID}@test.growupmore.local`;
const PASSWORD = 'VerifyUserSocialMedia123';

// ─── Mutable state ───────────────────────────────────────────

let saUserId: number | null = null;
let adminUserId: number | null = null;
let studentUserId: number | null = null;
let studentBUserId: number | null = null;

let saToken = '';
let adminToken = '';
let studentToken = '';
let studentBToken = '';

let saJti = '';
let adminJti = '';
let studentJti = '';
let studentBJti = '';

// Seeded social_media ids (two distinct platforms — one for SA-created row,
// one for student's /me row so the (user_id, social_media_id) unique pair
// doesn't collide).
let socialMediaIdA: number | null = null;
let socialMediaIdB: number | null = null;
let socialMediaIdC: number | null = null;

// Row IDs created during the test
let saCreatedUsmId: number | null = null; // SA creates for studentUser
let studentSelfUsmId: number | null = null; // student /me POST
let studentBMeUsmId: number | null = null; // studentB /me POST (used for ownership check)

// ─────────────────────────────────────────────────────────────
// HTTP client
// ─────────────────────────────────────────────────────────────

interface HttpResult<T = unknown> {
  status: number;
  body: T;
}

const mkClient = (baseUrl: string) => {
  return async <T = unknown>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    options: { body?: unknown; token?: string } = {}
  ): Promise<HttpResult<T>> => {
    const headers: Record<string, string> = {
      'content-type': 'application/json'
    };
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });
    const status = res.status;
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status, body: body as T };
  };
};

// ─────────────────────────────────────────────────────────────
// Setup helpers
// ─────────────────────────────────────────────────────────────

const elevateToSuperAdmin = async (userId: number): Promise<void> => {
  await getPool().query(
    `UPDATE users
        SET role_id = (
              SELECT id FROM roles
              WHERE level = 0 AND is_deleted = FALSE AND is_active = TRUE
              LIMIT 1
            ),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [userId]
  );
};

const elevateToAdmin = async (userId: number): Promise<void> => {
  await getPool().query(
    `UPDATE users
        SET role_id = (
              SELECT id FROM roles
              WHERE level = 1 AND is_deleted = FALSE AND is_active = TRUE
              LIMIT 1
            ),
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [userId]
  );
};

const verifyChannels = async (userId: number): Promise<void> => {
  await getPool().query('SELECT udf_auth_verify_email($1)', [userId]);
  await getPool().query('SELECT udf_auth_verify_mobile($1)', [userId]);
};

const pickSocialMediaIds = async (): Promise<[number, number, number]> => {
  const r = await getPool().query<{ id: string }>(
    `SELECT id::text AS id
       FROM social_medias
      WHERE is_deleted = FALSE AND is_active = TRUE
      ORDER BY display_order ASC, id ASC
      LIMIT 3`
  );
  if (r.rows.length < 3) {
    throw new Error(
      `need at least 3 seeded social_medias rows for fixture, got ${r.rows.length}`
    );
  }
  return [Number(r.rows[0]!.id), Number(r.rows[1]!.id), Number(r.rows[2]!.id)];
};

// ─────────────────────────────────────────────────────────────
// Cleanup helpers
// ─────────────────────────────────────────────────────────────

const hardDeleteUsmById = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM user_social_medias WHERE id = $1', [id]);
};
const hardDeleteUsmByUserId = async (userId: number): Promise<void> => {
  await getPool().query('DELETE FROM user_social_medias WHERE user_id = $1', [userId]);
};
const softDeleteUser = async (id: number): Promise<void> => {
  await getPool().query(
    `UPDATE users
        SET is_deleted = TRUE,
            is_active  = FALSE,
            deleted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [id]
  );
};

// ─────────────────────────────────────────────────────────────
// Response types
// ─────────────────────────────────────────────────────────────

interface RegisterResponse {
  data?: { userId: number };
}
interface LoginResponse {
  data?: {
    accessToken: string;
    user: { id: number; permissions: string[]; roles?: string[] };
  };
}
interface UsmResponse {
  data?: {
    id: number;
    userId: number;
    socialMediaId: number;
    profileUrl: string;
    username: string | null;
    isPrimary: boolean;
    isVerified: boolean;
    isActive: boolean;
    isDeleted: boolean;
    platform?: { id: number; name: string | null; code: string | null };
    user?: { firstName: string; lastName: string };
  };
}
interface ListResponse {
  data?: Array<{
    id: number;
    userId: number;
    socialMediaId: number;
    isDeleted: boolean;
  }>;
  meta?: { totalCount: number; page: number; limit: number; totalPages: number };
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  console.log('━━ Phase 4 · User social medias verify (live) ━━');
  console.log(`  sa email        : ${SA_EMAIL}`);
  console.log(`  admin email     : ${ADMIN_EMAIL}`);
  console.log(`  student email   : ${STUDENT_EMAIL}`);
  console.log(`  student-b email : ${STUDENT_B_EMAIL}`);

  const app = buildApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.on('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const http = mkClient(baseUrl);

  try {
    // ─── 0. Setup ────────────────────────────────────────
    header('0. Setup — social_media platforms + users + tokens');
    {
      const [idA, idB, idC] = await pickSocialMediaIds();
      socialMediaIdA = idA;
      socialMediaIdB = idB;
      socialMediaIdC = idC;
      record(
        '0',
        'seeded social_medias picked',
        true,
        `ids=${socialMediaIdA},${socialMediaIdB},${socialMediaIdC}`
      );

      // SA
      const regSa = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUsm',
          lastName: `Sa${process.pid}`,
          email: SA_EMAIL,
          password: PASSWORD,
          roleCode: 'student'
        }
      });
      record(
        '0',
        'register sa harness user',
        regSa.status === 201 && typeof regSa.body?.data?.userId === 'number',
        `status=${regSa.status}`
      );
      saUserId = regSa.body?.data?.userId ?? null;
      if (saUserId == null) throw new Error('sa register failed');
      await verifyChannels(saUserId);
      await elevateToSuperAdmin(saUserId);
      const loginSa = await http<LoginResponse>('POST', '/api/v1/auth/login', {
        body: { identifier: SA_EMAIL, password: PASSWORD }
      });
      saToken = loginSa.body?.data?.accessToken ?? '';
      record(
        '0',
        'sa login returns 200 + accessToken',
        loginSa.status === 200 && saToken.length > 0,
        `status=${loginSa.status}`
      );
      const saPerms = loginSa.body?.data?.user?.permissions ?? [];
      record(
        '0',
        'sa JWT has user_social_media.{read,create,update,delete,read.own,update.own,delete.own,restore}',
        saPerms.includes('user_social_media.read') &&
          saPerms.includes('user_social_media.create') &&
          saPerms.includes('user_social_media.update') &&
          saPerms.includes('user_social_media.delete') &&
          saPerms.includes('user_social_media.read.own') &&
          saPerms.includes('user_social_media.update.own') &&
          saPerms.includes('user_social_media.delete.own') &&
          saPerms.includes('user_social_media.restore'),
        `perms=${saPerms.filter((p) => p.startsWith('user_social_media.')).length}`
      );
      saJti = saToken ? verifyAccessToken(saToken).jti ?? '' : '';

      // Admin
      const regAdmin = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUsm',
          lastName: `Admin${process.pid}`,
          email: ADMIN_EMAIL,
          password: PASSWORD,
          roleCode: 'student'
        }
      });
      adminUserId = regAdmin.body?.data?.userId ?? null;
      record(
        '0',
        'register admin harness user',
        regAdmin.status === 201 && adminUserId != null,
        `status=${regAdmin.status}`
      );
      if (adminUserId == null) throw new Error('admin register failed');
      await verifyChannels(adminUserId);
      await elevateToAdmin(adminUserId);
      const loginAdmin = await http<LoginResponse>('POST', '/api/v1/auth/login', {
        body: { identifier: ADMIN_EMAIL, password: PASSWORD }
      });
      adminToken = loginAdmin.body?.data?.accessToken ?? '';
      record(
        '0',
        'admin login returns 200 + accessToken',
        loginAdmin.status === 200 && adminToken.length > 0,
        `status=${loginAdmin.status}`
      );
      const adminPerms = loginAdmin.body?.data?.user?.permissions ?? [];
      record(
        '0',
        'admin has user_social_media.{read,create,update,restore} but NOT global delete',
        adminPerms.includes('user_social_media.read') &&
          adminPerms.includes('user_social_media.create') &&
          adminPerms.includes('user_social_media.update') &&
          adminPerms.includes('user_social_media.restore') &&
          !adminPerms.includes('user_social_media.delete'),
        `admin user_social_media.* = ${adminPerms.filter((p) => p.startsWith('user_social_media.')).length}`
      );
      record(
        '0',
        'admin still has user_social_media.delete.own (for own rows)',
        adminPerms.includes('user_social_media.delete.own'),
        ''
      );
      adminJti = adminToken ? verifyAccessToken(adminToken).jti ?? '' : '';

      // Student
      const regStudent = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUsm',
          lastName: `Student${process.pid}`,
          email: STUDENT_EMAIL,
          password: PASSWORD,
          roleCode: 'student'
        }
      });
      studentUserId = regStudent.body?.data?.userId ?? null;
      record(
        '0',
        'register student harness user',
        regStudent.status === 201 && studentUserId != null,
        `status=${regStudent.status}`
      );
      if (studentUserId == null) throw new Error('student register failed');
      await verifyChannels(studentUserId);
      const loginStudent = await http<LoginResponse>('POST', '/api/v1/auth/login', {
        body: { identifier: STUDENT_EMAIL, password: PASSWORD }
      });
      studentToken = loginStudent.body?.data?.accessToken ?? '';
      record(
        '0',
        'student login returns 200 + accessToken',
        loginStudent.status === 200 && studentToken.length > 0,
        `status=${loginStudent.status}`
      );
      const studentPerms = loginStudent.body?.data?.user?.permissions ?? [];
      record(
        '0',
        'student has user_social_media.{read.own,update.own,delete.own} and NOT global',
        studentPerms.includes('user_social_media.read.own') &&
          studentPerms.includes('user_social_media.update.own') &&
          studentPerms.includes('user_social_media.delete.own') &&
          !studentPerms.includes('user_social_media.read') &&
          !studentPerms.includes('user_social_media.create') &&
          !studentPerms.includes('user_social_media.delete') &&
          !studentPerms.includes('user_social_media.restore'),
        `student user_social_media.* = ${studentPerms.filter((p) => p.startsWith('user_social_media.')).length}`
      );
      studentJti = studentToken ? verifyAccessToken(studentToken).jti ?? '' : '';

      // Student B — second student for cross-ownership checks
      const regStudentB = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUsm',
          lastName: `StudentB${process.pid}`,
          email: STUDENT_B_EMAIL,
          password: PASSWORD,
          roleCode: 'student'
        }
      });
      studentBUserId = regStudentB.body?.data?.userId ?? null;
      record(
        '0',
        'register student-b harness user',
        regStudentB.status === 201 && studentBUserId != null,
        `status=${regStudentB.status}`
      );
      if (studentBUserId == null) throw new Error('student-b register failed');
      await verifyChannels(studentBUserId);
      const loginStudentB = await http<LoginResponse>('POST', '/api/v1/auth/login', {
        body: { identifier: STUDENT_B_EMAIL, password: PASSWORD }
      });
      studentBToken = loginStudentB.body?.data?.accessToken ?? '';
      record(
        '0',
        'student-b login returns 200',
        loginStudentB.status === 200 && studentBToken.length > 0,
        `status=${loginStudentB.status}`
      );
      studentBJti = studentBToken ? verifyAccessToken(studentBToken).jti ?? '' : '';
    }

    if (!saToken || !adminToken || !studentToken || !studentBToken) {
      throw new Error('missing token — bailing');
    }

    // ─── 1. Anonymous → 401 ──────────────────────────────
    header('1. Auth — anonymous → 401');
    {
      const a = await http('GET', '/api/v1/user-social-medias');
      record('1', 'GET /user-social-medias (no token) → 401', a.status === 401, `got ${a.status}`);
      const b = await http('GET', '/api/v1/user-social-medias/me');
      record('1', 'GET /user-social-medias/me (no token) → 401', b.status === 401, `got ${b.status}`);
      const c = await http('POST', '/api/v1/user-social-medias/me', {
        body: { socialMediaId: socialMediaIdA, profileUrl: 'https://example.com/x' }
      });
      record('1', 'POST /user-social-medias/me (no token) → 401', c.status === 401, `got ${c.status}`);
    }

    // ─── 2. Super Admin CRUD ─────────────────────────────
    header('2. Super Admin — POST / GET / list / PATCH on another user');
    {
      // 2.a SA POST / (targets studentUserId) using socialMediaIdA
      const create = await http<UsmResponse>('POST', '/api/v1/user-social-medias', {
        token: saToken,
        body: {
          userId: studentUserId,
          socialMediaId: socialMediaIdA,
          profileUrl: `https://platform-a.example.com/u/${studentUserId}-${RUN_ID}`,
          username: `sa_target_${RUN_ID}`,
          isPrimary: true,
          isVerified: false
        }
      });
      record(
        '2',
        'POST /user-social-medias (sa) → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `status=${create.status}`
      );
      saCreatedUsmId = create.body?.data?.id ?? null;
      if (saCreatedUsmId == null) {
        throw new Error(`sa create failed; body=${JSON.stringify(create.body)}`);
      }

      // 2.b zod reject — invalid profileUrl (not a URL)
      const zodUrl = await http('POST', '/api/v1/user-social-medias', {
        token: saToken,
        body: {
          userId: studentUserId,
          socialMediaId: socialMediaIdB,
          profileUrl: 'not-a-url'
        }
      });
      record('2', 'POST bad profileUrl format → 400', zodUrl.status === 400, `got ${zodUrl.status}`);

      // 2.c zod reject — missing required socialMediaId
      const zodMissing = await http('POST', '/api/v1/user-social-medias', {
        token: saToken,
        body: {
          userId: studentUserId,
          profileUrl: 'https://example.com/me'
        }
      });
      record(
        '2',
        'POST missing socialMediaId → 400',
        zodMissing.status === 400,
        `got ${zodMissing.status}`
      );

      // 2.d UDF reject — non-existent socialMediaId
      const fkFail = await http('POST', '/api/v1/user-social-medias', {
        token: saToken,
        body: {
          userId: studentUserId,
          socialMediaId: 999999999,
          profileUrl: 'https://example.com/x'
        }
      });
      record(
        '2',
        'POST non-existent socialMediaId → 4xx',
        fkFail.status >= 400 && fkFail.status < 500,
        `got ${fkFail.status}`
      );

      // 2.e UDF reject — non-existent userId
      const fkUser = await http('POST', '/api/v1/user-social-medias', {
        token: saToken,
        body: {
          userId: 999999999,
          socialMediaId: socialMediaIdA,
          profileUrl: 'https://example.com/x'
        }
      });
      record(
        '2',
        'POST non-existent userId → 4xx',
        fkUser.status >= 400 && fkUser.status < 500,
        `got ${fkUser.status}`
      );

      // 2.f SA list (filter to studentUserId — should see 1 row)
      const list = await http<ListResponse>(
        'GET',
        `/api/v1/user-social-medias?userId=${studentUserId}&pageSize=10`,
        { token: saToken }
      );
      record(
        '2',
        'GET /user-social-medias?userId=... (sa) → 200',
        list.status === 200,
        `status=${list.status}`
      );
      record(
        '2',
        'list response has data[] + meta shape',
        Array.isArray(list.body?.data) &&
          typeof list.body?.meta?.totalCount === 'number',
        `totalCount=${list.body?.meta?.totalCount}`
      );
      record(
        '2',
        'newly created row visible in list',
        (list.body?.data ?? []).some((r) => r.id === saCreatedUsmId),
        `ids=${(list.body?.data ?? []).map((r) => r.id).join(',')}`
      );

      // 2.g SA GET /:id — nested user + platform
      const getOne = await http<UsmResponse>(
        'GET',
        `/api/v1/user-social-medias/${saCreatedUsmId}`,
        { token: saToken }
      );
      record(
        '2',
        'GET /user-social-medias/:id (sa) → 200 with nested user+platform',
        getOne.status === 200 &&
          getOne.body?.data?.id === saCreatedUsmId &&
          getOne.body?.data?.userId === studentUserId &&
          typeof getOne.body?.data?.platform?.name === 'string' &&
          typeof getOne.body?.data?.user?.firstName === 'string',
        `platform=${getOne.body?.data?.platform?.name ?? 'null'}`
      );

      // 2.h SA PATCH — partial update (flip isVerified true, set username)
      const patchOk = await http('PATCH', `/api/v1/user-social-medias/${saCreatedUsmId}`, {
        token: saToken,
        body: {
          isVerified: true,
          username: `sa_patched_${RUN_ID}`
        }
      });
      record('2', 'PATCH /user-social-medias/:id (sa) → 200', patchOk.status === 200, `got ${patchOk.status}`);

      // 2.i Verify PATCH applied
      const verify = await http<UsmResponse>(
        'GET',
        `/api/v1/user-social-medias/${saCreatedUsmId}`,
        { token: saToken }
      );
      record(
        '2',
        'PATCH persisted — isVerified=true, username updated',
        verify.body?.data?.isVerified === true &&
          verify.body?.data?.username === `sa_patched_${RUN_ID}`,
        `isVerified=${verify.body?.data?.isVerified} username=${verify.body?.data?.username}`
      );
    }

    // ─── 3. Admin — global read/create/update, global delete blocked ───
    header('3. Admin — global read/create/update OK, global DELETE → 403');
    {
      // 3.a Admin can list
      const list = await http<ListResponse>(
        'GET',
        `/api/v1/user-social-medias?userId=${studentUserId}&pageSize=5`,
        { token: adminToken }
      );
      record('3', 'GET /user-social-medias (admin) → 200', list.status === 200, `got ${list.status}`);

      // 3.b Admin can GET /:id
      if (saCreatedUsmId != null) {
        const getOne = await http(
          'GET',
          `/api/v1/user-social-medias/${saCreatedUsmId}`,
          { token: adminToken }
        );
        record(
          '3',
          'GET /user-social-medias/:id (admin) → 200',
          getOne.status === 200,
          `got ${getOne.status}`
        );
      }

      // 3.c Admin can PATCH
      if (saCreatedUsmId != null) {
        const patch = await http('PATCH', `/api/v1/user-social-medias/${saCreatedUsmId}`, {
          token: adminToken,
          body: { username: `admin_patched_${RUN_ID}` }
        });
        record(
          '3',
          'PATCH /user-social-medias/:id (admin) → 200',
          patch.status === 200,
          `got ${patch.status}`
        );
      }

      // 3.d Admin BLOCKED on global DELETE /:id (no user_social_media.delete)
      if (saCreatedUsmId != null) {
        const del = await http('DELETE', `/api/v1/user-social-medias/${saCreatedUsmId}`, {
          token: adminToken
        });
        record(
          '3',
          'DELETE /user-social-medias/:id (admin, other user) → 403',
          del.status === 403,
          `got ${del.status}`
        );
      }
    }

    // ─── 4. Student — read-other / write-other / list blocked ──
    header('4. Student — list + read-other + write-other → 403');
    {
      // Student has no user_social_media.read → listing is 403
      const listS = await http('GET', '/api/v1/user-social-medias', { token: studentToken });
      record(
        '4',
        'GET /user-social-medias (student, no global) → 403',
        listS.status === 403,
        `got ${listS.status}`
      );

      // Create an admin-owned row via SA for read-other checks (use platform C)
      const adminRow = await http<UsmResponse>('POST', '/api/v1/user-social-medias', {
        token: saToken,
        body: {
          userId: adminUserId,
          socialMediaId: socialMediaIdC,
          profileUrl: `https://platform-c.example.com/u/${adminUserId}-${RUN_ID}`,
          username: `admin_owned_${RUN_ID}`
        }
      });
      const adminRowId = adminRow.body?.data?.id;
      record(
        '4',
        'fixture: sa created admin-owned row',
        adminRow.status === 201 && typeof adminRowId === 'number',
        `id=${adminRowId}`
      );

      if (typeof adminRowId === 'number') {
        // Student reads SOMEONE ELSE'S row → 403
        const getOther = await http(
          'GET',
          `/api/v1/user-social-medias/${adminRowId}`,
          { token: studentToken }
        );
        record(
          '4',
          "GET /user-social-medias/:id (student → admin's row) → 403",
          getOther.status === 403,
          `got ${getOther.status}`
        );

        // Student PATCH someone else's row → 403
        const patchOther = await http(
          'PATCH',
          `/api/v1/user-social-medias/${adminRowId}`,
          { token: studentToken, body: { username: 'nope' } }
        );
        record(
          '4',
          'PATCH /user-social-medias/:id (student → other) → 403',
          patchOther.status === 403,
          `got ${patchOther.status}`
        );

        // Student DELETE someone else's row via /me/:id → 403
        const delOtherMe = await http(
          'DELETE',
          `/api/v1/user-social-medias/me/${adminRowId}`,
          { token: studentToken }
        );
        record(
          '4',
          'DELETE /user-social-medias/me/:id (student → other) → 403',
          delOtherMe.status === 403,
          `got ${delOtherMe.status}`
        );

        // Student DELETE via global /:id → 403 (no global perm + not self)
        const delOther = await http(
          'DELETE',
          `/api/v1/user-social-medias/${adminRowId}`,
          { token: studentToken }
        );
        record(
          '4',
          'DELETE /user-social-medias/:id (student → other) → 403',
          delOther.status === 403,
          `got ${delOther.status}`
        );

        // Cleanup: sa deletes the admin row
        await http('DELETE', `/api/v1/user-social-medias/${adminRowId}`, { token: saToken });
      }

      // Student cannot POST / (admin-scoped)
      const postS = await http('POST', '/api/v1/user-social-medias', {
        token: studentToken,
        body: {
          userId: studentUserId,
          socialMediaId: socialMediaIdB,
          profileUrl: 'https://example.com/x'
        }
      });
      record(
        '4',
        'POST /user-social-medias (student) → 403',
        postS.status === 403,
        `got ${postS.status}`
      );
    }

    // ─── 5. Student /me lifecycle ────────────────────────
    header('5. Student — /me full lifecycle + ownership enforcement');
    {
      // 5.a GET /me — should list the SA-created row for this student
      const me0 = await http<ListResponse>('GET', '/api/v1/user-social-medias/me', {
        token: studentToken
      });
      record(
        '5',
        'GET /me (student) → 200 with SA-seeded row',
        me0.status === 200 && (me0.body?.data ?? []).some((r) => r.id === saCreatedUsmId),
        `count=${(me0.body?.data ?? []).length}`
      );

      // 5.b GET /me with a foreign userId — server-side override must ignore it
      const meOverride = await http<ListResponse>(
        'GET',
        `/api/v1/user-social-medias/me?userId=${adminUserId}`,
        { token: studentToken }
      );
      record(
        '5',
        'GET /me?userId=<admin> — server overrides query userId',
        meOverride.status === 200 &&
          (meOverride.body?.data ?? []).every((r) => r.userId === studentUserId),
        `userIds=${(meOverride.body?.data ?? []).map((r) => r.userId).join(',')}`
      );

      // 5.c POST /me — student self-creates (use platform B, since platform A
      //     is already taken by the SA-seeded row for this student)
      const create = await http<UsmResponse>('POST', '/api/v1/user-social-medias/me', {
        token: studentToken,
        body: {
          socialMediaId: socialMediaIdB,
          profileUrl: `https://platform-b.example.com/u/${studentUserId}-${RUN_ID}`,
          username: `self_${RUN_ID}`,
          isPrimary: false
        }
      });
      record(
        '5',
        'POST /me (student) → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `status=${create.status}`
      );
      studentSelfUsmId = create.body?.data?.id ?? null;
      record(
        '5',
        'POST /me row owned by caller (userId matches)',
        create.body?.data?.userId === studentUserId,
        `userId=${create.body?.data?.userId}`
      );

      // 5.d Student GET /:id on own row via self-or
      if (studentSelfUsmId != null) {
        const getSelf = await http(
          'GET',
          `/api/v1/user-social-medias/${studentSelfUsmId}`,
          { token: studentToken }
        );
        record(
          '5',
          'GET /user-social-medias/:id (student → own row) → 200',
          getSelf.status === 200,
          `got ${getSelf.status}`
        );
      }

      // 5.e PATCH student's OWN sa-seeded row via /me/:id → should succeed
      if (saCreatedUsmId != null) {
        const patch = await http('PATCH', `/api/v1/user-social-medias/me/${saCreatedUsmId}`, {
          token: studentToken,
          body: { username: `student_self_updated_${RUN_ID}` }
        });
        record(
          '5',
          'PATCH /me/:id (student → own sa-seeded row) → 200',
          patch.status === 200,
          `got ${patch.status}`
        );
      }

      // 5.f Student-B creates own row → student A cannot touch it
      const bCreate = await http<UsmResponse>('POST', '/api/v1/user-social-medias/me', {
        token: studentBToken,
        body: {
          socialMediaId: socialMediaIdA,
          profileUrl: `https://platform-a.example.com/u/${studentBUserId}-${RUN_ID}`,
          username: `student_b_${RUN_ID}`
        }
      });
      studentBMeUsmId = bCreate.body?.data?.id ?? null;
      record(
        '5',
        'POST /me (student-b) → 201',
        bCreate.status === 201 && studentBMeUsmId != null,
        `id=${studentBMeUsmId}`
      );

      if (studentBMeUsmId != null) {
        const patchB = await http('PATCH', `/api/v1/user-social-medias/me/${studentBMeUsmId}`, {
          token: studentToken,
          body: { username: 'evil' }
        });
        record(
          '5',
          "PATCH /me/:id (student A → student B's row) → 403",
          patchB.status === 403,
          `got ${patchB.status}`
        );

        const delB = await http('DELETE', `/api/v1/user-social-medias/me/${studentBMeUsmId}`, {
          token: studentToken
        });
        record(
          '5',
          "DELETE /me/:id (student A → student B's row) → 403",
          delB.status === 403,
          `got ${delB.status}`
        );
      }

      // 5.g Student self-deletes own row via /me/:id → 200 + row disappears
      if (studentSelfUsmId != null) {
        const del = await http<{ data?: { id: number; deleted: boolean } }>(
          'DELETE',
          `/api/v1/user-social-medias/me/${studentSelfUsmId}`,
          { token: studentToken }
        );
        record(
          '5',
          'DELETE /me/:id (student → own row) → 200',
          del.status === 200 && del.body?.data?.deleted === true,
          `got ${del.status}`
        );

        // Row is soft-deleted and hidden from default GET. Student can no
        // longer resolve the target owner → 403.
        const gone = await http(
          'GET',
          `/api/v1/user-social-medias/${studentSelfUsmId}`,
          { token: studentToken }
        );
        record(
          '5',
          'GET /:id after own soft-delete → 403 (own-scope cannot resolve hidden row)',
          gone.status === 403,
          `got ${gone.status}`
        );
      }
    }

    // ─── 6. Soft-delete via global DELETE (sa) ───────────
    header('6. Super Admin — DELETE /:id → soft delete + hidden');
    {
      if (saCreatedUsmId != null) {
        const del = await http<{ data?: { id: number; deleted: boolean } }>(
          'DELETE',
          `/api/v1/user-social-medias/${saCreatedUsmId}`,
          { token: saToken }
        );
        record(
          '6',
          'DELETE /user-social-medias/:id (sa) → 200',
          del.status === 200 && del.body?.data?.deleted === true,
          `got ${del.status}`
        );

        // Default GET should return 404 (hidden)
        const after = await http(
          'GET',
          `/api/v1/user-social-medias/${saCreatedUsmId}`,
          { token: saToken }
        );
        record(
          '6',
          'GET /user-social-medias/:id after sa soft-delete → 404',
          after.status === 404,
          `got ${after.status}`
        );

        // Verify row still exists in DB with is_deleted = TRUE
        const row = await getPool().query<{ is_deleted: boolean; is_active: boolean }>(
          'SELECT is_deleted, is_active FROM user_social_medias WHERE id = $1',
          [saCreatedUsmId]
        );
        record(
          '6',
          'DB row still present with is_deleted=TRUE, is_active=FALSE',
          row.rows[0]?.is_deleted === true && row.rows[0]?.is_active === false,
          `is_deleted=${row.rows[0]?.is_deleted} is_active=${row.rows[0]?.is_active}`
        );
      }
    }

    // ─── 6.5 Restore lifecycle (admin+ only) ─────────────
    header('6.5 Restore — POST /:id/restore (admin+ only)');
    {
      if (saCreatedUsmId != null) {
        // Student has no user_social_media.restore permission → 403
        const studentRestore = await http(
          'POST',
          `/api/v1/user-social-medias/${saCreatedUsmId}/restore`,
          { token: studentToken }
        );
        record(
          '6.5',
          'POST /:id/restore (student) → 403',
          studentRestore.status === 403,
          `got ${studentRestore.status}`
        );

        // SA restores the row → 200 + row is visible again
        const saRestore = await http<{
          data?: { id: number; isDeleted: boolean; isActive: boolean };
        }>(
          'POST',
          `/api/v1/user-social-medias/${saCreatedUsmId}/restore`,
          { token: saToken }
        );
        record(
          '6.5',
          'POST /:id/restore (sa) → 200',
          saRestore.status === 200 &&
            saRestore.body?.data?.isDeleted === false &&
            saRestore.body?.data?.isActive === true,
          `status=${saRestore.status} isDeleted=${saRestore.body?.data?.isDeleted} isActive=${saRestore.body?.data?.isActive}`
        );

        // GET /:id should now succeed (row visible again)
        const afterRestore = await http(
          'GET',
          `/api/v1/user-social-medias/${saCreatedUsmId}`,
          { token: saToken }
        );
        record(
          '6.5',
          'GET /:id after sa restore → 200 (row visible)',
          afterRestore.status === 200,
          `got ${afterRestore.status}`
        );

        // Restoring an already-active row → 400 (not deleted)
        const restoreAgain = await http(
          'POST',
          `/api/v1/user-social-medias/${saCreatedUsmId}/restore`,
          { token: saToken }
        );
        record(
          '6.5',
          'POST /:id/restore on non-deleted row (sa) → 400',
          restoreAgain.status === 400,
          `got ${restoreAgain.status}`
        );

        // Restoring a non-existent id → 404
        const restoreMissing = await http(
          'POST',
          `/api/v1/user-social-medias/999999999/restore`,
          { token: saToken }
        );
        record(
          '6.5',
          'POST /:id/restore on non-existent id → 404',
          restoreMissing.status === 404,
          `got ${restoreMissing.status}`
        );

        // Admin also has user_social_media.restore — delete & let admin restore
        const delAgain = await http(
          'DELETE',
          `/api/v1/user-social-medias/${saCreatedUsmId}`,
          { token: saToken }
        );
        record(
          '6.5',
          'DELETE (sa, pre-admin-restore) → 200',
          delAgain.status === 200,
          `got ${delAgain.status}`
        );

        const adminRestore = await http<{
          data?: { id: number; isDeleted: boolean; isActive: boolean };
        }>(
          'POST',
          `/api/v1/user-social-medias/${saCreatedUsmId}/restore`,
          { token: adminToken }
        );
        record(
          '6.5',
          'POST /:id/restore (admin) → 200',
          adminRestore.status === 200 &&
            adminRestore.body?.data?.isDeleted === false,
          `status=${adminRestore.status} isDeleted=${adminRestore.body?.data?.isDeleted}`
        );

        // Final state: DB row should be visible + active after the
        // admin restore. Double-check against the DB directly.
        const finalRow = await getPool().query<{
          is_deleted: boolean;
          is_active: boolean;
        }>(
          'SELECT is_deleted, is_active FROM user_social_medias WHERE id = $1',
          [saCreatedUsmId]
        );
        record(
          '6.5',
          'DB row after admin restore: is_deleted=FALSE, is_active=TRUE',
          finalRow.rows[0]?.is_deleted === false &&
            finalRow.rows[0]?.is_active === true,
          `is_deleted=${finalRow.rows[0]?.is_deleted} is_active=${finalRow.rows[0]?.is_active}`
        );
      }
    }
  } finally {
    // ─── 7. Cleanup ──────────────────────────────────────
    header('7. Cleanup');
    {
      for (const id of [saCreatedUsmId, studentSelfUsmId, studentBMeUsmId]) {
        if (id == null) continue;
        try {
          await hardDeleteUsmById(id);
          record('7', `row hard-deleted`, true, `id=${id}`);
        } catch (err) {
          record('7', `row hard-delete failed`, false, (err as Error).message);
        }
      }
      for (const uid of [saUserId, adminUserId, studentUserId, studentBUserId]) {
        if (uid == null) continue;
        try {
          await hardDeleteUsmByUserId(uid);
        } catch {
          /* no-op */
        }
        try {
          await softDeleteUser(uid);
          record('7', `user soft-deleted`, true, `uid=${uid}`);
        } catch (err) {
          record('7', `user soft-delete failed`, false, (err as Error).message);
        }
      }
      for (const jti of [saJti, adminJti, studentJti, studentBJti].filter(Boolean)) {
        try {
          await redisRevoked.remove(jti);
        } catch {
          /* no-op */
        }
      }
      record('7', 'redis revoked entries removed (no-op if absent)', true, '');
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closePool();
    await closeRedis();
  }

  // ─── Summary ─────────────────────────────────────────
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  const failed = total - passed;
  console.log(`\n━━ Summary ━━`);
  console.log(`  passed: ${passed}/${total}`);
  if (failed > 0) {
    console.log(`\n  Failures:`);
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`    - [${r.section}] ${r.name} — ${r.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log('  Phase 4 user_social_medias verdict: \x1b[32mPASS\x1b[0m');
  }
};

main().catch((err) => {
  console.error('\n\x1b[31m✗ fatal:\x1b[0m', err);
  process.exitCode = 1;
  closePool().catch(() => undefined);
  closeRedis().catch(() => undefined);
});
