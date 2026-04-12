/* eslint-disable no-console */
/**
 * Phase-04 user_skills — live end-to-end verification.
 *
 * Exercises every published route on:
 *
 *   /api/v1/user-skills
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

const SA_EMAIL = `verify-uskill-sa+${RUN_ID}@test.growupmore.local`;
const ADMIN_EMAIL = `verify-uskill-admin+${RUN_ID}@test.growupmore.local`;
const STUDENT_EMAIL = `verify-uskill-student+${RUN_ID}@test.growupmore.local`;
const STUDENT_B_EMAIL = `verify-uskill-student-b+${RUN_ID}@test.growupmore.local`;
const PASSWORD = 'VerifyUserSkill123';

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

// Seeded skill ids (three distinct skills — one for SA-created row,
// one for student's /me row, one for admin-owned row, so the
// (user_id, skill_id) unique pair doesn't collide).
let skillIdA: number | null = null;
let skillIdB: number | null = null;
let skillIdC: number | null = null;

// Row IDs created during the test
let saCreatedUskillId: number | null = null; // SA creates for studentUser
let studentSelfUskillId: number | null = null; // student /me POST
let studentBMeUskillId: number | null = null; // studentB /me POST (used for ownership check)

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

const pickSkillIds = async (): Promise<[number, number, number]> => {
  const r = await getPool().query<{ id: string }>(
    `SELECT id::text AS id
       FROM skills
      WHERE is_deleted = FALSE AND is_active = TRUE
      ORDER BY id ASC
      LIMIT 3`
  );
  if (r.rows.length < 3) {
    throw new Error(
      `need at least 3 seeded skills rows for fixture, got ${r.rows.length}`
    );
  }
  return [Number(r.rows[0]!.id), Number(r.rows[1]!.id), Number(r.rows[2]!.id)];
};

// ─────────────────────────────────────────────────────────────
// Cleanup helpers
// ─────────────────────────────────────────────────────────────

const hardDeleteUskillById = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM user_skills WHERE id = $1', [id]);
};
const hardDeleteUskillByUserId = async (userId: number): Promise<void> => {
  await getPool().query('DELETE FROM user_skills WHERE user_id = $1', [userId]);
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
interface UskillResponse {
  data?: {
    id: number;
    userId: number;
    skillId: number;
    proficiencyLevel: string | null;
    yearsOfExperience: number | null;
    isPrimary: boolean;
    certificateUrl: string | null;
    endorsementCount: number;
    isActive: boolean;
    isDeleted: boolean;
    skill?: { id: number; name: string | null; category: string | null };
    user?: { firstName: string; lastName: string };
  };
}
interface ListResponse {
  data?: Array<{
    id: number;
    userId: number;
    skillId: number;
    isDeleted: boolean;
  }>;
  meta?: { totalCount: number; page: number; limit: number; totalPages: number };
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  console.log('━━ Phase 4 · User skills verify (live) ━━');
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
    header('0. Setup — skills + users + tokens');
    {
      const [idA, idB, idC] = await pickSkillIds();
      skillIdA = idA;
      skillIdB = idB;
      skillIdC = idC;
      record(
        '0',
        'seeded skills picked',
        true,
        `ids=${skillIdA},${skillIdB},${skillIdC}`
      );

      // SA
      const regSa = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUskill',
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
        'sa JWT has user_skill.{read,create,update,delete,read.own,update.own,delete.own,restore}',
        saPerms.includes('user_skill.read') &&
          saPerms.includes('user_skill.create') &&
          saPerms.includes('user_skill.update') &&
          saPerms.includes('user_skill.delete') &&
          saPerms.includes('user_skill.read.own') &&
          saPerms.includes('user_skill.update.own') &&
          saPerms.includes('user_skill.delete.own') &&
          saPerms.includes('user_skill.restore'),
        `perms=${saPerms.filter((p) => p.startsWith('user_skill.')).length}`
      );
      saJti = saToken ? verifyAccessToken(saToken).jti ?? '' : '';

      // Admin
      const regAdmin = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUskill',
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
        'admin has user_skill.{read,create,update,restore} but NOT global delete',
        adminPerms.includes('user_skill.read') &&
          adminPerms.includes('user_skill.create') &&
          adminPerms.includes('user_skill.update') &&
          adminPerms.includes('user_skill.restore') &&
          !adminPerms.includes('user_skill.delete'),
        `admin user_skill.* = ${adminPerms.filter((p) => p.startsWith('user_skill.')).length}`
      );
      record(
        '0',
        'admin still has user_skill.delete.own (for own rows)',
        adminPerms.includes('user_skill.delete.own'),
        ''
      );
      adminJti = adminToken ? verifyAccessToken(adminToken).jti ?? '' : '';

      // Student
      const regStudent = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUskill',
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
        'student has user_skill.{read.own,update.own,delete.own} and NOT global',
        studentPerms.includes('user_skill.read.own') &&
          studentPerms.includes('user_skill.update.own') &&
          studentPerms.includes('user_skill.delete.own') &&
          !studentPerms.includes('user_skill.read') &&
          !studentPerms.includes('user_skill.create') &&
          !studentPerms.includes('user_skill.delete') &&
          !studentPerms.includes('user_skill.restore'),
        `student user_skill.* = ${studentPerms.filter((p) => p.startsWith('user_skill.')).length}`
      );
      studentJti = studentToken ? verifyAccessToken(studentToken).jti ?? '' : '';

      // Student B — second student for cross-ownership checks
      const regStudentB = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUskill',
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
      const a = await http('GET', '/api/v1/user-skills');
      record('1', 'GET /user-skills (no token) → 401', a.status === 401, `got ${a.status}`);
      const b = await http('GET', '/api/v1/user-skills/me');
      record('1', 'GET /user-skills/me (no token) → 401', b.status === 401, `got ${b.status}`);
      const c = await http('POST', '/api/v1/user-skills/me', {
        body: { skillId: skillIdA, proficiencyLevel: 'advanced' }
      });
      record('1', 'POST /user-skills/me (no token) → 401', c.status === 401, `got ${c.status}`);
    }

    // ─── 2. Super Admin CRUD ─────────────────────────────
    header('2. Super Admin — POST / GET / list / PATCH on another user');
    {
      // 2.a SA POST / (targets studentUserId) using skillIdA
      const create = await http<UskillResponse>('POST', '/api/v1/user-skills', {
        token: saToken,
        body: {
          userId: studentUserId,
          skillId: skillIdA,
          proficiencyLevel: 'advanced',
          yearsOfExperience: 4.5,
          isPrimary: true,
          endorsementCount: 7
        }
      });
      record(
        '2',
        'POST /user-skills (sa) → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `status=${create.status}`
      );
      saCreatedUskillId = create.body?.data?.id ?? null;
      if (saCreatedUskillId == null) {
        throw new Error(`sa create failed; body=${JSON.stringify(create.body)}`);
      }

      // 2.b zod reject — invalid proficiencyLevel
      const zodLevel = await http('POST', '/api/v1/user-skills', {
        token: saToken,
        body: {
          userId: studentUserId,
          skillId: skillIdB,
          proficiencyLevel: 'superhuman'
        }
      });
      record('2', 'POST bad proficiencyLevel → 400', zodLevel.status === 400, `got ${zodLevel.status}`);

      // 2.c zod reject — missing required skillId
      const zodMissing = await http('POST', '/api/v1/user-skills', {
        token: saToken,
        body: {
          userId: studentUserId,
          proficiencyLevel: 'beginner'
        }
      });
      record(
        '2',
        'POST missing skillId → 400',
        zodMissing.status === 400,
        `got ${zodMissing.status}`
      );

      // 2.d zod reject — negative yearsOfExperience
      const zodNeg = await http('POST', '/api/v1/user-skills', {
        token: saToken,
        body: {
          userId: studentUserId,
          skillId: skillIdB,
          yearsOfExperience: -1
        }
      });
      record(
        '2',
        'POST negative yearsOfExperience → 400',
        zodNeg.status === 400,
        `got ${zodNeg.status}`
      );

      // 2.e UDF reject — non-existent skillId
      const fkFail = await http('POST', '/api/v1/user-skills', {
        token: saToken,
        body: {
          userId: studentUserId,
          skillId: 999999999
        }
      });
      record(
        '2',
        'POST non-existent skillId → 4xx',
        fkFail.status >= 400 && fkFail.status < 500,
        `got ${fkFail.status}`
      );

      // 2.f UDF reject — non-existent userId
      const fkUser = await http('POST', '/api/v1/user-skills', {
        token: saToken,
        body: {
          userId: 999999999,
          skillId: skillIdA
        }
      });
      record(
        '2',
        'POST non-existent userId → 4xx',
        fkUser.status >= 400 && fkUser.status < 500,
        `got ${fkUser.status}`
      );

      // 2.g SA list (filter to studentUserId — should see 1 row)
      const list = await http<ListResponse>(
        'GET',
        `/api/v1/user-skills?userId=${studentUserId}&pageSize=10`,
        { token: saToken }
      );
      record(
        '2',
        'GET /user-skills?userId=... (sa) → 200',
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
        (list.body?.data ?? []).some((r) => r.id === saCreatedUskillId),
        `ids=${(list.body?.data ?? []).map((r) => r.id).join(',')}`
      );

      // 2.h SA GET /:id — nested user + skill
      const getOne = await http<UskillResponse>(
        'GET',
        `/api/v1/user-skills/${saCreatedUskillId}`,
        { token: saToken }
      );
      record(
        '2',
        'GET /user-skills/:id (sa) → 200 with nested user+skill',
        getOne.status === 200 &&
          getOne.body?.data?.id === saCreatedUskillId &&
          getOne.body?.data?.userId === studentUserId &&
          typeof getOne.body?.data?.skill?.name === 'string' &&
          typeof getOne.body?.data?.user?.firstName === 'string',
        `skill=${getOne.body?.data?.skill?.name ?? 'null'}`
      );

      // 2.i SA PATCH — partial update (bump proficiency, endorsements)
      const patchOk = await http('PATCH', `/api/v1/user-skills/${saCreatedUskillId}`, {
        token: saToken,
        body: {
          proficiencyLevel: 'expert',
          endorsementCount: 42
        }
      });
      record('2', 'PATCH /user-skills/:id (sa) → 200', patchOk.status === 200, `got ${patchOk.status}`);

      // 2.j Verify PATCH applied
      const verify = await http<UskillResponse>(
        'GET',
        `/api/v1/user-skills/${saCreatedUskillId}`,
        { token: saToken }
      );
      record(
        '2',
        'PATCH persisted — proficiencyLevel=expert, endorsementCount=42',
        verify.body?.data?.proficiencyLevel === 'expert' &&
          verify.body?.data?.endorsementCount === 42,
        `prof=${verify.body?.data?.proficiencyLevel} endorse=${verify.body?.data?.endorsementCount}`
      );
    }

    // ─── 3. Admin — global read/create/update, global delete blocked ───
    header('3. Admin — global read/create/update OK, global DELETE → 403');
    {
      // 3.a Admin can list
      const list = await http<ListResponse>(
        'GET',
        `/api/v1/user-skills?userId=${studentUserId}&pageSize=5`,
        { token: adminToken }
      );
      record('3', 'GET /user-skills (admin) → 200', list.status === 200, `got ${list.status}`);

      // 3.b Admin can GET /:id
      if (saCreatedUskillId != null) {
        const getOne = await http(
          'GET',
          `/api/v1/user-skills/${saCreatedUskillId}`,
          { token: adminToken }
        );
        record(
          '3',
          'GET /user-skills/:id (admin) → 200',
          getOne.status === 200,
          `got ${getOne.status}`
        );
      }

      // 3.c Admin can PATCH
      if (saCreatedUskillId != null) {
        const patch = await http('PATCH', `/api/v1/user-skills/${saCreatedUskillId}`, {
          token: adminToken,
          body: { endorsementCount: 50 }
        });
        record(
          '3',
          'PATCH /user-skills/:id (admin) → 200',
          patch.status === 200,
          `got ${patch.status}`
        );
      }

      // 3.d Admin BLOCKED on global DELETE /:id (no user_skill.delete)
      if (saCreatedUskillId != null) {
        const del = await http('DELETE', `/api/v1/user-skills/${saCreatedUskillId}`, {
          token: adminToken
        });
        record(
          '3',
          'DELETE /user-skills/:id (admin, other user) → 403',
          del.status === 403,
          `got ${del.status}`
        );
      }
    }

    // ─── 4. Student — read-other / write-other / list blocked ──
    header('4. Student — list + read-other + write-other → 403');
    {
      // Student has no user_skill.read → listing is 403
      const listS = await http('GET', '/api/v1/user-skills', { token: studentToken });
      record(
        '4',
        'GET /user-skills (student, no global) → 403',
        listS.status === 403,
        `got ${listS.status}`
      );

      // Create an admin-owned row via SA for read-other checks (use skill C)
      const adminRow = await http<UskillResponse>('POST', '/api/v1/user-skills', {
        token: saToken,
        body: {
          userId: adminUserId,
          skillId: skillIdC,
          proficiencyLevel: 'intermediate',
          yearsOfExperience: 2
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
          `/api/v1/user-skills/${adminRowId}`,
          { token: studentToken }
        );
        record(
          '4',
          "GET /user-skills/:id (student → admin's row) → 403",
          getOther.status === 403,
          `got ${getOther.status}`
        );

        // Student PATCH someone else's row → 403
        const patchOther = await http(
          'PATCH',
          `/api/v1/user-skills/${adminRowId}`,
          { token: studentToken, body: { endorsementCount: 999 } }
        );
        record(
          '4',
          'PATCH /user-skills/:id (student → other) → 403',
          patchOther.status === 403,
          `got ${patchOther.status}`
        );

        // Student DELETE someone else's row via /me/:id → 403
        const delOtherMe = await http(
          'DELETE',
          `/api/v1/user-skills/me/${adminRowId}`,
          { token: studentToken }
        );
        record(
          '4',
          'DELETE /user-skills/me/:id (student → other) → 403',
          delOtherMe.status === 403,
          `got ${delOtherMe.status}`
        );

        // Student DELETE via global /:id → 403 (no global perm + not self)
        const delOther = await http(
          'DELETE',
          `/api/v1/user-skills/${adminRowId}`,
          { token: studentToken }
        );
        record(
          '4',
          'DELETE /user-skills/:id (student → other) → 403',
          delOther.status === 403,
          `got ${delOther.status}`
        );

        // Cleanup: sa deletes the admin row
        await http('DELETE', `/api/v1/user-skills/${adminRowId}`, { token: saToken });
      }

      // Student cannot POST / (admin-scoped)
      const postS = await http('POST', '/api/v1/user-skills', {
        token: studentToken,
        body: {
          userId: studentUserId,
          skillId: skillIdB
        }
      });
      record(
        '4',
        'POST /user-skills (student) → 403',
        postS.status === 403,
        `got ${postS.status}`
      );
    }

    // ─── 5. Student /me lifecycle ────────────────────────
    header('5. Student — /me full lifecycle + ownership enforcement');
    {
      // 5.a GET /me — should list the SA-created row for this student
      const me0 = await http<ListResponse>('GET', '/api/v1/user-skills/me', {
        token: studentToken
      });
      record(
        '5',
        'GET /me (student) → 200 with SA-seeded row',
        me0.status === 200 && (me0.body?.data ?? []).some((r) => r.id === saCreatedUskillId),
        `count=${(me0.body?.data ?? []).length}`
      );

      // 5.b GET /me with a foreign userId — server-side override must ignore it
      const meOverride = await http<ListResponse>(
        'GET',
        `/api/v1/user-skills/me?userId=${adminUserId}`,
        { token: studentToken }
      );
      record(
        '5',
        'GET /me?userId=<admin> — server overrides query userId',
        meOverride.status === 200 &&
          (meOverride.body?.data ?? []).every((r) => r.userId === studentUserId),
        `userIds=${(meOverride.body?.data ?? []).map((r) => r.userId).join(',')}`
      );

      // 5.c POST /me — student self-creates (use skill B, since skill A
      //     is already taken by the SA-seeded row for this student)
      const create = await http<UskillResponse>('POST', '/api/v1/user-skills/me', {
        token: studentToken,
        body: {
          skillId: skillIdB,
          proficiencyLevel: 'intermediate',
          yearsOfExperience: 1.5,
          isPrimary: false
        }
      });
      record(
        '5',
        'POST /me (student) → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `status=${create.status}`
      );
      studentSelfUskillId = create.body?.data?.id ?? null;
      record(
        '5',
        'POST /me row owned by caller (userId matches)',
        create.body?.data?.userId === studentUserId,
        `userId=${create.body?.data?.userId}`
      );

      // 5.d Student GET /:id on own row via self-or
      if (studentSelfUskillId != null) {
        const getSelf = await http(
          'GET',
          `/api/v1/user-skills/${studentSelfUskillId}`,
          { token: studentToken }
        );
        record(
          '5',
          'GET /user-skills/:id (student → own row) → 200',
          getSelf.status === 200,
          `got ${getSelf.status}`
        );
      }

      // 5.e PATCH student's OWN sa-seeded row via /me/:id → should succeed
      if (saCreatedUskillId != null) {
        const patch = await http('PATCH', `/api/v1/user-skills/me/${saCreatedUskillId}`, {
          token: studentToken,
          body: { yearsOfExperience: 5.5 }
        });
        record(
          '5',
          'PATCH /me/:id (student → own sa-seeded row) → 200',
          patch.status === 200,
          `got ${patch.status}`
        );
      }

      // 5.f Student-B creates own row → student A cannot touch it
      const bCreate = await http<UskillResponse>('POST', '/api/v1/user-skills/me', {
        token: studentBToken,
        body: {
          skillId: skillIdA,
          proficiencyLevel: 'beginner'
        }
      });
      studentBMeUskillId = bCreate.body?.data?.id ?? null;
      record(
        '5',
        'POST /me (student-b) → 201',
        bCreate.status === 201 && studentBMeUskillId != null,
        `id=${studentBMeUskillId}`
      );

      if (studentBMeUskillId != null) {
        const patchB = await http('PATCH', `/api/v1/user-skills/me/${studentBMeUskillId}`, {
          token: studentToken,
          body: { proficiencyLevel: 'expert' }
        });
        record(
          '5',
          "PATCH /me/:id (student A → student B's row) → 403",
          patchB.status === 403,
          `got ${patchB.status}`
        );

        const delB = await http('DELETE', `/api/v1/user-skills/me/${studentBMeUskillId}`, {
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
      if (studentSelfUskillId != null) {
        const del = await http<{ data?: { id: number; deleted: boolean } }>(
          'DELETE',
          `/api/v1/user-skills/me/${studentSelfUskillId}`,
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
          `/api/v1/user-skills/${studentSelfUskillId}`,
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
      if (saCreatedUskillId != null) {
        const del = await http<{ data?: { id: number; deleted: boolean } }>(
          'DELETE',
          `/api/v1/user-skills/${saCreatedUskillId}`,
          { token: saToken }
        );
        record(
          '6',
          'DELETE /user-skills/:id (sa) → 200',
          del.status === 200 && del.body?.data?.deleted === true,
          `got ${del.status}`
        );

        // Default GET should return 404 (hidden)
        const after = await http(
          'GET',
          `/api/v1/user-skills/${saCreatedUskillId}`,
          { token: saToken }
        );
        record(
          '6',
          'GET /user-skills/:id after sa soft-delete → 404',
          after.status === 404,
          `got ${after.status}`
        );

        // Verify row still exists in DB with is_deleted = TRUE
        const row = await getPool().query<{ is_deleted: boolean; is_active: boolean }>(
          'SELECT is_deleted, is_active FROM user_skills WHERE id = $1',
          [saCreatedUskillId]
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
      if (saCreatedUskillId != null) {
        // Student has no user_skill.restore permission → 403
        const studentRestore = await http(
          'POST',
          `/api/v1/user-skills/${saCreatedUskillId}/restore`,
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
          `/api/v1/user-skills/${saCreatedUskillId}/restore`,
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
          `/api/v1/user-skills/${saCreatedUskillId}`,
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
          `/api/v1/user-skills/${saCreatedUskillId}/restore`,
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
          `/api/v1/user-skills/999999999/restore`,
          { token: saToken }
        );
        record(
          '6.5',
          'POST /:id/restore on non-existent id → 404',
          restoreMissing.status === 404,
          `got ${restoreMissing.status}`
        );

        // Admin also has user_skill.restore — delete & let admin restore
        const delAgain = await http(
          'DELETE',
          `/api/v1/user-skills/${saCreatedUskillId}`,
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
          `/api/v1/user-skills/${saCreatedUskillId}/restore`,
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
          'SELECT is_deleted, is_active FROM user_skills WHERE id = $1',
          [saCreatedUskillId]
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
      for (const id of [saCreatedUskillId, studentSelfUskillId, studentBMeUskillId]) {
        if (id == null) continue;
        try {
          await hardDeleteUskillById(id);
          record('7', `row hard-deleted`, true, `id=${id}`);
        } catch (err) {
          record('7', `row hard-delete failed`, false, (err as Error).message);
        }
      }
      for (const uid of [saUserId, adminUserId, studentUserId, studentBUserId]) {
        if (uid == null) continue;
        try {
          await hardDeleteUskillByUserId(uid);
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
    console.log('  Phase 4 user_skills verdict: \x1b[32mPASS\x1b[0m');
  }
};

main().catch((err) => {
  console.error('\n\x1b[31m✗ fatal:\x1b[0m', err);
  process.exitCode = 1;
  closePool().catch(() => undefined);
  closeRedis().catch(() => undefined);
});
