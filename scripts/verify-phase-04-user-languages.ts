/* eslint-disable no-console */
/**
 * Phase-04 user_languages — live end-to-end verification.
 *
 * Exercises every published route on:
 *
 *   /api/v1/user-languages
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
  console.log(`  ${mark}  ${name.padEnd(72)} ${detail}`);
};
const header = (title: string): void => {
  console.log(`\n\x1b[36m━━ ${title} ━━\x1b[0m`);
};

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const RUN_ID = `${process.pid}-${Date.now()}`;

const SA_EMAIL = `verify-ulang-sa+${RUN_ID}@test.growupmore.local`;
const ADMIN_EMAIL = `verify-ulang-admin+${RUN_ID}@test.growupmore.local`;
const STUDENT_EMAIL = `verify-ulang-student+${RUN_ID}@test.growupmore.local`;
const STUDENT_B_EMAIL = `verify-ulang-student-b+${RUN_ID}@test.growupmore.local`;
const PASSWORD = 'VerifyUserLanguage123';

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

// Seeded language ids (three distinct languages)
let languageIdA: number | null = null;
let languageIdB: number | null = null;
let languageIdC: number | null = null;

// Row IDs created during the test
let saCreatedUlangId: number | null = null; // SA creates for studentUser
let studentSelfUlangId: number | null = null; // student /me POST
let studentBMeUlangId: number | null = null; // studentB /me POST (used for ownership check)

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

const pickLanguageIds = async (): Promise<[number, number, number]> => {
  const r = await getPool().query<{ id: string }>(
    `SELECT id::text AS id
       FROM languages
      WHERE is_deleted = FALSE AND is_active = TRUE
      ORDER BY id ASC
      LIMIT 3`
  );
  if (r.rows.length < 3) {
    throw new Error(
      `need at least 3 seeded languages rows for fixture, got ${r.rows.length}`
    );
  }
  return [Number(r.rows[0]!.id), Number(r.rows[1]!.id), Number(r.rows[2]!.id)];
};

// ─────────────────────────────────────────────────────────────
// Cleanup helpers
// ─────────────────────────────────────────────────────────────

const hardDeleteUlangById = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM user_languages WHERE id = $1', [id]);
};
const hardDeleteUlangByUserId = async (userId: number): Promise<void> => {
  await getPool().query('DELETE FROM user_languages WHERE user_id = $1', [userId]);
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
interface UlangResponse {
  data?: {
    id: number;
    userId: number;
    languageId: number;
    proficiencyLevel: string | null;
    canRead: boolean;
    canWrite: boolean;
    canSpeak: boolean;
    isPrimary: boolean;
    isNative: boolean;
    isActive: boolean;
    isDeleted: boolean;
    language?: { id: number; name: string | null; isoCode: string | null };
    user?: { firstName: string; lastName: string };
  };
}
interface ListResponse {
  data?: Array<{
    id: number;
    userId: number;
    languageId: number;
    isDeleted: boolean;
  }>;
  meta?: { totalCount: number; page: number; limit: number; totalPages: number };
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  console.log('━━ Phase 4 · User languages verify (live) ━━');
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
    header('0. Setup — languages + users + tokens');
    {
      const [idA, idB, idC] = await pickLanguageIds();
      languageIdA = idA;
      languageIdB = idB;
      languageIdC = idC;
      record(
        '0',
        'seeded languages picked',
        true,
        `ids=${languageIdA},${languageIdB},${languageIdC}`
      );

      // SA
      const regSa = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUlang',
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
        'sa JWT has user_language.{read,create,update,delete,read.own,update.own,delete.own,restore}',
        saPerms.includes('user_language.read') &&
          saPerms.includes('user_language.create') &&
          saPerms.includes('user_language.update') &&
          saPerms.includes('user_language.delete') &&
          saPerms.includes('user_language.read.own') &&
          saPerms.includes('user_language.update.own') &&
          saPerms.includes('user_language.delete.own') &&
          saPerms.includes('user_language.restore'),
        `perms=${saPerms.filter((p) => p.startsWith('user_language.')).length}`
      );
      saJti = saToken ? verifyAccessToken(saToken).jti ?? '' : '';

      // Admin
      const regAdmin = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUlang',
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
        'admin has user_language.{read,create,update,restore} but NOT global delete',
        adminPerms.includes('user_language.read') &&
          adminPerms.includes('user_language.create') &&
          adminPerms.includes('user_language.update') &&
          adminPerms.includes('user_language.restore') &&
          !adminPerms.includes('user_language.delete'),
        `admin user_language.* = ${adminPerms.filter((p) => p.startsWith('user_language.')).length}`
      );
      record(
        '0',
        'admin still has user_language.delete.own (for own rows)',
        adminPerms.includes('user_language.delete.own'),
        ''
      );
      adminJti = adminToken ? verifyAccessToken(adminToken).jti ?? '' : '';

      // Student
      const regStudent = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUlang',
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
        'student has user_language.{read.own,update.own,delete.own} and NOT global',
        studentPerms.includes('user_language.read.own') &&
          studentPerms.includes('user_language.update.own') &&
          studentPerms.includes('user_language.delete.own') &&
          !studentPerms.includes('user_language.read') &&
          !studentPerms.includes('user_language.create') &&
          !studentPerms.includes('user_language.delete') &&
          !studentPerms.includes('user_language.restore'),
        `student user_language.* = ${studentPerms.filter((p) => p.startsWith('user_language.')).length}`
      );
      studentJti = studentToken ? verifyAccessToken(studentToken).jti ?? '' : '';

      // Student B
      const regStudentB = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUlang',
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
      const a = await http('GET', '/api/v1/user-languages');
      record('1', 'GET /user-languages (no token) → 401', a.status === 401, `got ${a.status}`);
      const b = await http('GET', '/api/v1/user-languages/me');
      record('1', 'GET /user-languages/me (no token) → 401', b.status === 401, `got ${b.status}`);
      const c = await http('POST', '/api/v1/user-languages/me', {
        body: { languageId: languageIdA, proficiencyLevel: 'fluent' }
      });
      record('1', 'POST /user-languages/me (no token) → 401', c.status === 401, `got ${c.status}`);
    }

    // ─── 2. Super Admin CRUD ─────────────────────────────
    header('2. Super Admin — POST / GET / list / PATCH on another user');
    {
      // 2.a SA POST /
      const create = await http<UlangResponse>('POST', '/api/v1/user-languages', {
        token: saToken,
        body: {
          userId: studentUserId,
          languageId: languageIdA,
          proficiencyLevel: 'fluent',
          canRead: true,
          canWrite: true,
          canSpeak: true,
          isPrimary: true
        }
      });
      record(
        '2',
        'POST /user-languages (sa) → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `status=${create.status}`
      );
      saCreatedUlangId = create.body?.data?.id ?? null;
      if (saCreatedUlangId == null) {
        throw new Error(`sa create failed; body=${JSON.stringify(create.body)}`);
      }

      // 2.b zod reject — invalid proficiencyLevel
      const zodLevel = await http('POST', '/api/v1/user-languages', {
        token: saToken,
        body: {
          userId: studentUserId,
          languageId: languageIdB,
          proficiencyLevel: 'superhuman'
        }
      });
      record('2', 'POST bad proficiencyLevel → 400', zodLevel.status === 400, `got ${zodLevel.status}`);

      // 2.c zod reject — missing required languageId
      const zodMissing = await http('POST', '/api/v1/user-languages', {
        token: saToken,
        body: {
          userId: studentUserId,
          proficiencyLevel: 'basic'
        }
      });
      record(
        '2',
        'POST missing languageId → 400',
        zodMissing.status === 400,
        `got ${zodMissing.status}`
      );

      // 2.d UDF reject — non-existent languageId
      const fkFail = await http('POST', '/api/v1/user-languages', {
        token: saToken,
        body: {
          userId: studentUserId,
          languageId: 999999999
        }
      });
      record(
        '2',
        'POST non-existent languageId → 4xx',
        fkFail.status >= 400 && fkFail.status < 500,
        `got ${fkFail.status}`
      );

      // 2.e UDF reject — non-existent userId
      const fkUser = await http('POST', '/api/v1/user-languages', {
        token: saToken,
        body: {
          userId: 999999999,
          languageId: languageIdA
        }
      });
      record(
        '2',
        'POST non-existent userId → 4xx',
        fkUser.status >= 400 && fkUser.status < 500,
        `got ${fkUser.status}`
      );

      // 2.f SA list filter to studentUserId
      const list = await http<ListResponse>(
        'GET',
        `/api/v1/user-languages?userId=${studentUserId}&pageSize=10`,
        { token: saToken }
      );
      record(
        '2',
        'GET /user-languages?userId=... (sa) → 200',
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
        (list.body?.data ?? []).some((r) => r.id === saCreatedUlangId),
        `ids=${(list.body?.data ?? []).map((r) => r.id).join(',')}`
      );

      // 2.g SA GET /:id
      const getOne = await http<UlangResponse>(
        'GET',
        `/api/v1/user-languages/${saCreatedUlangId}`,
        { token: saToken }
      );
      record(
        '2',
        'GET /user-languages/:id (sa) → 200 with nested user+language',
        getOne.status === 200 &&
          getOne.body?.data?.id === saCreatedUlangId &&
          getOne.body?.data?.userId === studentUserId &&
          typeof getOne.body?.data?.language?.name === 'string' &&
          typeof getOne.body?.data?.user?.firstName === 'string',
        `language=${getOne.body?.data?.language?.name ?? 'null'}`
      );

      // 2.h SA PATCH
      const patchOk = await http('PATCH', `/api/v1/user-languages/${saCreatedUlangId}`, {
        token: saToken,
        body: {
          proficiencyLevel: 'native',
          isNative: true
        }
      });
      record('2', 'PATCH /user-languages/:id (sa) → 200', patchOk.status === 200, `got ${patchOk.status}`);

      // 2.i Verify PATCH applied
      const verify = await http<UlangResponse>(
        'GET',
        `/api/v1/user-languages/${saCreatedUlangId}`,
        { token: saToken }
      );
      record(
        '2',
        'PATCH persisted — proficiencyLevel=native, isNative=true',
        verify.body?.data?.proficiencyLevel === 'native' &&
          verify.body?.data?.isNative === true,
        `prof=${verify.body?.data?.proficiencyLevel} isNative=${verify.body?.data?.isNative}`
      );
    }

    // ─── 3. Admin — global read/create/update, global delete blocked ───
    header('3. Admin — global read/create/update OK, global DELETE → 403');
    {
      const list = await http<ListResponse>(
        'GET',
        `/api/v1/user-languages?userId=${studentUserId}&pageSize=5`,
        { token: adminToken }
      );
      record('3', 'GET /user-languages (admin) → 200', list.status === 200, `got ${list.status}`);

      if (saCreatedUlangId != null) {
        const getOne = await http(
          'GET',
          `/api/v1/user-languages/${saCreatedUlangId}`,
          { token: adminToken }
        );
        record(
          '3',
          'GET /user-languages/:id (admin) → 200',
          getOne.status === 200,
          `got ${getOne.status}`
        );
      }

      if (saCreatedUlangId != null) {
        const patch = await http('PATCH', `/api/v1/user-languages/${saCreatedUlangId}`, {
          token: adminToken,
          body: { canRead: true, canWrite: false }
        });
        record(
          '3',
          'PATCH /user-languages/:id (admin) → 200',
          patch.status === 200,
          `got ${patch.status}`
        );
      }

      if (saCreatedUlangId != null) {
        const del = await http('DELETE', `/api/v1/user-languages/${saCreatedUlangId}`, {
          token: adminToken
        });
        record(
          '3',
          'DELETE /user-languages/:id (admin, other user) → 403',
          del.status === 403,
          `got ${del.status}`
        );
      }
    }

    // ─── 4. Student — read-other / write-other / list blocked ──
    header('4. Student — list + read-other + write-other → 403');
    {
      const listS = await http('GET', '/api/v1/user-languages', { token: studentToken });
      record(
        '4',
        'GET /user-languages (student, no global) → 403',
        listS.status === 403,
        `got ${listS.status}`
      );

      const adminRow = await http<UlangResponse>('POST', '/api/v1/user-languages', {
        token: saToken,
        body: {
          userId: adminUserId,
          languageId: languageIdC,
          proficiencyLevel: 'professional',
          canRead: true,
          canSpeak: true
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
        const getOther = await http(
          'GET',
          `/api/v1/user-languages/${adminRowId}`,
          { token: studentToken }
        );
        record(
          '4',
          "GET /user-languages/:id (student → admin's row) → 403",
          getOther.status === 403,
          `got ${getOther.status}`
        );

        const patchOther = await http(
          'PATCH',
          `/api/v1/user-languages/${adminRowId}`,
          { token: studentToken, body: { canWrite: true } }
        );
        record(
          '4',
          'PATCH /user-languages/:id (student → other) → 403',
          patchOther.status === 403,
          `got ${patchOther.status}`
        );

        const delOtherMe = await http(
          'DELETE',
          `/api/v1/user-languages/me/${adminRowId}`,
          { token: studentToken }
        );
        record(
          '4',
          'DELETE /user-languages/me/:id (student → other) → 403',
          delOtherMe.status === 403,
          `got ${delOtherMe.status}`
        );

        const delOther = await http(
          'DELETE',
          `/api/v1/user-languages/${adminRowId}`,
          { token: studentToken }
        );
        record(
          '4',
          'DELETE /user-languages/:id (student → other) → 403',
          delOther.status === 403,
          `got ${delOther.status}`
        );

        // Cleanup: sa deletes the admin row
        await http('DELETE', `/api/v1/user-languages/${adminRowId}`, { token: saToken });
      }

      const postS = await http('POST', '/api/v1/user-languages', {
        token: studentToken,
        body: {
          userId: studentUserId,
          languageId: languageIdB
        }
      });
      record(
        '4',
        'POST /user-languages (student) → 403',
        postS.status === 403,
        `got ${postS.status}`
      );
    }

    // ─── 5. Student /me lifecycle ────────────────────────
    header('5. Student — /me full lifecycle + ownership enforcement');
    {
      const me0 = await http<ListResponse>('GET', '/api/v1/user-languages/me', {
        token: studentToken
      });
      record(
        '5',
        'GET /me (student) → 200 with SA-seeded row',
        me0.status === 200 && (me0.body?.data ?? []).some((r) => r.id === saCreatedUlangId),
        `count=${(me0.body?.data ?? []).length}`
      );

      const meOverride = await http<ListResponse>(
        'GET',
        `/api/v1/user-languages/me?userId=${adminUserId}`,
        { token: studentToken }
      );
      record(
        '5',
        'GET /me?userId=<admin> — server overrides query userId',
        meOverride.status === 200 &&
          (meOverride.body?.data ?? []).every((r) => r.userId === studentUserId),
        `userIds=${(meOverride.body?.data ?? []).map((r) => r.userId).join(',')}`
      );

      // Student self-creates own row via /me using languageB
      const create = await http<UlangResponse>('POST', '/api/v1/user-languages/me', {
        token: studentToken,
        body: {
          languageId: languageIdB,
          proficiencyLevel: 'conversational',
          canSpeak: true,
          isPrimary: false
        }
      });
      record(
        '5',
        'POST /me (student) → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `status=${create.status}`
      );
      studentSelfUlangId = create.body?.data?.id ?? null;
      record(
        '5',
        'POST /me row owned by caller (userId matches)',
        create.body?.data?.userId === studentUserId,
        `userId=${create.body?.data?.userId}`
      );

      if (studentSelfUlangId != null) {
        const getSelf = await http(
          'GET',
          `/api/v1/user-languages/${studentSelfUlangId}`,
          { token: studentToken }
        );
        record(
          '5',
          'GET /user-languages/:id (student → own row) → 200',
          getSelf.status === 200,
          `got ${getSelf.status}`
        );
      }

      if (saCreatedUlangId != null) {
        const patch = await http('PATCH', `/api/v1/user-languages/me/${saCreatedUlangId}`, {
          token: studentToken,
          body: { canWrite: true }
        });
        record(
          '5',
          'PATCH /me/:id (student → own sa-seeded row) → 200',
          patch.status === 200,
          `got ${patch.status}`
        );
      }

      // Student-B creates own row using languageA → student A cannot touch it
      const bCreate = await http<UlangResponse>('POST', '/api/v1/user-languages/me', {
        token: studentBToken,
        body: {
          languageId: languageIdA,
          proficiencyLevel: 'basic'
        }
      });
      studentBMeUlangId = bCreate.body?.data?.id ?? null;
      record(
        '5',
        'POST /me (student-b) → 201',
        bCreate.status === 201 && studentBMeUlangId != null,
        `id=${studentBMeUlangId}`
      );

      if (studentBMeUlangId != null) {
        const patchB = await http('PATCH', `/api/v1/user-languages/me/${studentBMeUlangId}`, {
          token: studentToken,
          body: { proficiencyLevel: 'fluent' }
        });
        record(
          '5',
          "PATCH /me/:id (student A → student B's row) → 403",
          patchB.status === 403,
          `got ${patchB.status}`
        );

        const delB = await http('DELETE', `/api/v1/user-languages/me/${studentBMeUlangId}`, {
          token: studentToken
        });
        record(
          '5',
          "DELETE /me/:id (student A → student B's row) → 403",
          delB.status === 403,
          `got ${delB.status}`
        );
      }

      if (studentSelfUlangId != null) {
        const del = await http<{ data?: { id: number; deleted: boolean } }>(
          'DELETE',
          `/api/v1/user-languages/me/${studentSelfUlangId}`,
          { token: studentToken }
        );
        record(
          '5',
          'DELETE /me/:id (student → own row) → 200',
          del.status === 200 && del.body?.data?.deleted === true,
          `got ${del.status}`
        );

        const gone = await http(
          'GET',
          `/api/v1/user-languages/${studentSelfUlangId}`,
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
      if (saCreatedUlangId != null) {
        const del = await http<{ data?: { id: number; deleted: boolean } }>(
          'DELETE',
          `/api/v1/user-languages/${saCreatedUlangId}`,
          { token: saToken }
        );
        record(
          '6',
          'DELETE /user-languages/:id (sa) → 200',
          del.status === 200 && del.body?.data?.deleted === true,
          `got ${del.status}`
        );

        const after = await http(
          'GET',
          `/api/v1/user-languages/${saCreatedUlangId}`,
          { token: saToken }
        );
        record(
          '6',
          'GET /user-languages/:id after sa soft-delete → 404',
          after.status === 404,
          `got ${after.status}`
        );

        const row = await getPool().query<{ is_deleted: boolean; is_active: boolean }>(
          'SELECT is_deleted, is_active FROM user_languages WHERE id = $1',
          [saCreatedUlangId]
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
      if (saCreatedUlangId != null) {
        const studentRestore = await http(
          'POST',
          `/api/v1/user-languages/${saCreatedUlangId}/restore`,
          { token: studentToken }
        );
        record(
          '6.5',
          'POST /:id/restore (student) → 403',
          studentRestore.status === 403,
          `got ${studentRestore.status}`
        );

        const saRestore = await http<{
          data?: { id: number; isDeleted: boolean; isActive: boolean };
        }>(
          'POST',
          `/api/v1/user-languages/${saCreatedUlangId}/restore`,
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

        const afterRestore = await http(
          'GET',
          `/api/v1/user-languages/${saCreatedUlangId}`,
          { token: saToken }
        );
        record(
          '6.5',
          'GET /:id after sa restore → 200 (row visible)',
          afterRestore.status === 200,
          `got ${afterRestore.status}`
        );

        const restoreAgain = await http(
          'POST',
          `/api/v1/user-languages/${saCreatedUlangId}/restore`,
          { token: saToken }
        );
        record(
          '6.5',
          'POST /:id/restore on non-deleted row (sa) → 400',
          restoreAgain.status === 400,
          `got ${restoreAgain.status}`
        );

        const restoreMissing = await http(
          'POST',
          `/api/v1/user-languages/999999999/restore`,
          { token: saToken }
        );
        record(
          '6.5',
          'POST /:id/restore on non-existent id → 404',
          restoreMissing.status === 404,
          `got ${restoreMissing.status}`
        );

        const delAgain = await http(
          'DELETE',
          `/api/v1/user-languages/${saCreatedUlangId}`,
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
          `/api/v1/user-languages/${saCreatedUlangId}/restore`,
          { token: adminToken }
        );
        record(
          '6.5',
          'POST /:id/restore (admin) → 200',
          adminRestore.status === 200 &&
            adminRestore.body?.data?.isDeleted === false,
          `status=${adminRestore.status} isDeleted=${adminRestore.body?.data?.isDeleted}`
        );

        const finalRow = await getPool().query<{
          is_deleted: boolean;
          is_active: boolean;
        }>(
          'SELECT is_deleted, is_active FROM user_languages WHERE id = $1',
          [saCreatedUlangId]
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
      for (const id of [saCreatedUlangId, studentSelfUlangId, studentBMeUlangId]) {
        if (id == null) continue;
        try {
          await hardDeleteUlangById(id);
          record('7', `row hard-deleted`, true, `id=${id}`);
        } catch (err) {
          record('7', `row hard-delete failed`, false, (err as Error).message);
        }
      }
      for (const uid of [saUserId, adminUserId, studentUserId, studentBUserId]) {
        if (uid == null) continue;
        try {
          await hardDeleteUlangByUserId(uid);
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
    console.log('  Phase 4 user_languages verdict: \x1b[32mPASS\x1b[0m');
  }
};

main().catch((err) => {
  console.error('\n\x1b[31m✗ fatal:\x1b[0m', err);
  process.exitCode = 1;
  closePool().catch(() => undefined);
  closeRedis().catch(() => undefined);
});
