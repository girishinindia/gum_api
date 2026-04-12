/* eslint-disable no-console */
/**
 * Phase-04 user_documents — live end-to-end verification.
 *
 * Exercises every published route on:
 *
 *   /api/v1/user-documents
 *
 * Coverage:
 *   • Super Admin — GET / list, POST / with workflow fields, GET /:id, PATCH /:id
 *   • Admin       — list / read / update / create; blocked on global DELETE but CAN restore
 *                   can set verification workflow fields
 *   • Student     — /me full self-service lifecycle
 *                   — workflow fields BLOCKED by .strict() schema (400 on verificationStatus)
 *                   — read-other / write-other blocked
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
  console.log(`  ${mark}  ${name.padEnd(74)} ${detail}`);
};
const header = (title: string): void => {
  console.log(`\n\x1b[36m━━ ${title} ━━\x1b[0m`);
};

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const RUN_ID = `${process.pid}-${Date.now()}`;

const SA_EMAIL = `verify-udoc-sa+${RUN_ID}@test.growupmore.local`;
const ADMIN_EMAIL = `verify-udoc-admin+${RUN_ID}@test.growupmore.local`;
const STUDENT_EMAIL = `verify-udoc-student+${RUN_ID}@test.growupmore.local`;
const STUDENT_B_EMAIL = `verify-udoc-student-b+${RUN_ID}@test.growupmore.local`;
const PASSWORD = 'VerifyUserDocument123';

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

// Seeded document_type + document ids (two distinct each)
let documentTypeIdA: number | null = null;
let documentTypeIdB: number | null = null;
let documentIdA: number | null = null;
let documentIdB: number | null = null;
let documentIdC: number | null = null;

// Row IDs created during the test
let saCreatedUdocId: number | null = null; // SA creates for studentUser
let studentSelfUdocId: number | null = null; // student /me POST
let studentBMeUdocId: number | null = null; // studentB /me POST (used for ownership check)

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

const pickDocumentTypeIds = async (): Promise<[number, number]> => {
  const r = await getPool().query<{ id: string }>(
    `SELECT id::text AS id
       FROM document_types
      WHERE is_deleted = FALSE AND is_active = TRUE
      ORDER BY id ASC
      LIMIT 2`
  );
  if (r.rows.length < 2) {
    throw new Error(
      `need at least 2 seeded document_types rows for fixture, got ${r.rows.length}`
    );
  }
  return [Number(r.rows[0]!.id), Number(r.rows[1]!.id)];
};

const pickDocumentIds = async (): Promise<[number, number, number]> => {
  const r = await getPool().query<{ id: string }>(
    `SELECT id::text AS id
       FROM documents
      WHERE is_deleted = FALSE AND is_active = TRUE
      ORDER BY id ASC
      LIMIT 3`
  );
  if (r.rows.length < 3) {
    throw new Error(
      `need at least 3 seeded documents rows for fixture, got ${r.rows.length}`
    );
  }
  return [Number(r.rows[0]!.id), Number(r.rows[1]!.id), Number(r.rows[2]!.id)];
};

// ─────────────────────────────────────────────────────────────
// Cleanup helpers
// ─────────────────────────────────────────────────────────────

const hardDeleteUdocById = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM user_documents WHERE id = $1', [id]);
};
const hardDeleteUdocByUserId = async (userId: number): Promise<void> => {
  await getPool().query('DELETE FROM user_documents WHERE user_id = $1', [userId]);
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
interface UdocResponse {
  data?: {
    id: number;
    userId: number;
    documentTypeId: number;
    documentId: number;
    documentNumber: string | null;
    fileUrl: string;
    fileName: string | null;
    fileSizeKb: number | null;
    fileFormat: string | null;
    issueDate: string | null;
    expiryDate: string | null;
    issuingAuthority: string | null;
    verificationStatus: string;
    verifiedBy: number | null;
    verifiedAt: string | null;
    rejectionReason: string | null;
    adminNotes: string | null;
    isActive: boolean;
    isDeleted: boolean;
    document?: { id: number; name: string | null };
    documentType?: { id: number; name: string | null };
    user?: { firstName: string; lastName: string };
  };
}
interface ListResponse {
  data?: Array<{
    id: number;
    userId: number;
    documentTypeId: number;
    documentId: number;
    verificationStatus: string;
    isDeleted: boolean;
  }>;
  meta?: { totalCount: number; page: number; limit: number; totalPages: number };
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  console.log('━━ Phase 4 · User documents verify (live) ━━');
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
    header('0. Setup — documents + document_types + users + tokens');
    {
      const [dtA, dtB] = await pickDocumentTypeIds();
      documentTypeIdA = dtA;
      documentTypeIdB = dtB;
      const [dA, dB, dC] = await pickDocumentIds();
      documentIdA = dA;
      documentIdB = dB;
      documentIdC = dC;
      record(
        '0',
        'seeded document_types + documents picked',
        true,
        `types=${documentTypeIdA},${documentTypeIdB} docs=${documentIdA},${documentIdB},${documentIdC}`
      );

      // SA
      const regSa = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUdoc',
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
        'sa JWT has user_document.{read,create,update,delete,read.own,update.own,delete.own,restore}',
        saPerms.includes('user_document.read') &&
          saPerms.includes('user_document.create') &&
          saPerms.includes('user_document.update') &&
          saPerms.includes('user_document.delete') &&
          saPerms.includes('user_document.read.own') &&
          saPerms.includes('user_document.update.own') &&
          saPerms.includes('user_document.delete.own') &&
          saPerms.includes('user_document.restore'),
        `perms=${saPerms.filter((p) => p.startsWith('user_document.')).length}`
      );
      saJti = saToken ? verifyAccessToken(saToken).jti ?? '' : '';

      // Admin
      const regAdmin = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUdoc',
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
        'admin has user_document.{read,create,update,restore} but NOT global delete',
        adminPerms.includes('user_document.read') &&
          adminPerms.includes('user_document.create') &&
          adminPerms.includes('user_document.update') &&
          adminPerms.includes('user_document.restore') &&
          !adminPerms.includes('user_document.delete'),
        `admin user_document.* = ${adminPerms.filter((p) => p.startsWith('user_document.')).length}`
      );
      record(
        '0',
        'admin still has user_document.delete.own (for own rows)',
        adminPerms.includes('user_document.delete.own'),
        ''
      );
      adminJti = adminToken ? verifyAccessToken(adminToken).jti ?? '' : '';

      // Student
      const regStudent = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUdoc',
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
        'student has user_document.{read.own,update.own,delete.own} only',
        studentPerms.includes('user_document.read.own') &&
          studentPerms.includes('user_document.update.own') &&
          studentPerms.includes('user_document.delete.own') &&
          !studentPerms.includes('user_document.read') &&
          !studentPerms.includes('user_document.create') &&
          !studentPerms.includes('user_document.delete') &&
          !studentPerms.includes('user_document.restore'),
        `student user_document.* = ${studentPerms.filter((p) => p.startsWith('user_document.')).length}`
      );
      studentJti = studentToken ? verifyAccessToken(studentToken).jti ?? '' : '';

      // Student B
      const regStudentB = await http<RegisterResponse>('POST', '/api/v1/auth/register', {
        body: {
          firstName: 'VerifyUdoc',
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
      const a = await http('GET', '/api/v1/user-documents');
      record('1', 'GET /user-documents (no token) → 401', a.status === 401, `got ${a.status}`);
      const b = await http('GET', '/api/v1/user-documents/me');
      record('1', 'GET /user-documents/me (no token) → 401', b.status === 401, `got ${b.status}`);
      const c = await http('POST', '/api/v1/user-documents/me', {
        body: {
          documentTypeId: documentTypeIdA,
          documentId: documentIdA,
          fileUrl: 'https://cdn.example.com/file.pdf'
        }
      });
      record('1', 'POST /user-documents/me (no token) → 401', c.status === 401, `got ${c.status}`);
    }

    // ─── 2. Super Admin CRUD (with workflow fields) ───────
    header('2. Super Admin — POST / GET / list / PATCH + workflow fields');
    {
      // 2.a SA POST / — admin lane, workflow fields allowed
      const create = await http<UdocResponse>('POST', '/api/v1/user-documents', {
        token: saToken,
        body: {
          userId: studentUserId,
          documentTypeId: documentTypeIdA,
          documentId: documentIdA,
          documentNumber: 'AADHAAR-1234-5678-9012',
          fileUrl: 'https://cdn.example.com/aadhaar.pdf',
          fileName: 'aadhaar.pdf',
          fileFormat: 'pdf',
          fileSizeKb: 420,
          issueDate: '2020-01-15',
          expiryDate: '2030-01-15',
          issuingAuthority: 'UIDAI',
          verificationStatus: 'under_review'
        }
      });
      record(
        '2',
        'POST /user-documents (sa) → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `status=${create.status}`
      );
      saCreatedUdocId = create.body?.data?.id ?? null;
      if (saCreatedUdocId == null) {
        throw new Error(`sa create failed; body=${JSON.stringify(create.body)}`);
      }
      record(
        '2',
        'POST response reflects admin workflow field (verificationStatus=under_review)',
        create.body?.data?.verificationStatus === 'under_review',
        `status=${create.body?.data?.verificationStatus}`
      );

      // 2.b zod reject — invalid verificationStatus
      const zodStatus = await http('POST', '/api/v1/user-documents', {
        token: saToken,
        body: {
          userId: studentUserId,
          documentTypeId: documentTypeIdA,
          documentId: documentIdB,
          fileUrl: 'https://cdn.example.com/x.pdf',
          verificationStatus: 'super_verified'
        }
      });
      record('2', 'POST bad verificationStatus → 400', zodStatus.status === 400, `got ${zodStatus.status}`);

      // 2.c zod reject — expiryDate before issueDate
      const zodDates = await http('POST', '/api/v1/user-documents', {
        token: saToken,
        body: {
          userId: studentUserId,
          documentTypeId: documentTypeIdA,
          documentId: documentIdB,
          fileUrl: 'https://cdn.example.com/x.pdf',
          issueDate: '2020-01-15',
          expiryDate: '2015-01-15'
        }
      });
      record(
        '2',
        'POST expiryDate<issueDate → 400',
        zodDates.status === 400,
        `got ${zodDates.status}`
      );

      // 2.d zod reject — missing required fileUrl
      const zodMissing = await http('POST', '/api/v1/user-documents', {
        token: saToken,
        body: {
          userId: studentUserId,
          documentTypeId: documentTypeIdA,
          documentId: documentIdB
        }
      });
      record(
        '2',
        'POST missing fileUrl → 400',
        zodMissing.status === 400,
        `got ${zodMissing.status}`
      );

      // 2.e UDF reject — non-existent userId
      const fkUser = await http('POST', '/api/v1/user-documents', {
        token: saToken,
        body: {
          userId: 999999999,
          documentTypeId: documentTypeIdA,
          documentId: documentIdA,
          fileUrl: 'https://cdn.example.com/x.pdf'
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
        `/api/v1/user-documents?userId=${studentUserId}&pageSize=10`,
        { token: saToken }
      );
      record(
        '2',
        'GET /user-documents?userId=... (sa) → 200',
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
        (list.body?.data ?? []).some((r) => r.id === saCreatedUdocId),
        `ids=${(list.body?.data ?? []).map((r) => r.id).join(',')}`
      );

      // 2.g SA GET /:id with nested
      const getOne = await http<UdocResponse>(
        'GET',
        `/api/v1/user-documents/${saCreatedUdocId}`,
        { token: saToken }
      );
      record(
        '2',
        'GET /user-documents/:id (sa) → 200 with nested document+documentType+user',
        getOne.status === 200 &&
          getOne.body?.data?.id === saCreatedUdocId &&
          getOne.body?.data?.userId === studentUserId &&
          typeof getOne.body?.data?.document?.name === 'string' &&
          typeof getOne.body?.data?.documentType?.name === 'string' &&
          typeof getOne.body?.data?.user?.firstName === 'string',
        `doc=${getOne.body?.data?.document?.name ?? 'null'}`
      );

      // 2.h SA PATCH — finalize verification
      const patchOk = await http('PATCH', `/api/v1/user-documents/${saCreatedUdocId}`, {
        token: saToken,
        body: {
          verificationStatus: 'verified',
          verifiedBy: saUserId,
          verifiedAt: new Date().toISOString(),
          adminNotes: 'Looks good.'
        }
      });
      record('2', 'PATCH /user-documents/:id (sa, workflow fields) → 200', patchOk.status === 200, `got ${patchOk.status}`);

      // 2.i Verify PATCH applied
      const verify = await http<UdocResponse>(
        'GET',
        `/api/v1/user-documents/${saCreatedUdocId}`,
        { token: saToken }
      );
      record(
        '2',
        'PATCH persisted — verificationStatus=verified, verifiedBy set, adminNotes set',
        verify.body?.data?.verificationStatus === 'verified' &&
          verify.body?.data?.verifiedBy === saUserId &&
          verify.body?.data?.adminNotes === 'Looks good.',
        `status=${verify.body?.data?.verificationStatus} by=${verify.body?.data?.verifiedBy}`
      );
    }

    // ─── 3. Admin — global read/create/update, global delete blocked ───
    header('3. Admin — global read/create/update OK, global DELETE → 403');
    {
      const list = await http<ListResponse>(
        'GET',
        `/api/v1/user-documents?userId=${studentUserId}&pageSize=5`,
        { token: adminToken }
      );
      record('3', 'GET /user-documents (admin) → 200', list.status === 200, `got ${list.status}`);

      if (saCreatedUdocId != null) {
        const getOne = await http(
          'GET',
          `/api/v1/user-documents/${saCreatedUdocId}`,
          { token: adminToken }
        );
        record(
          '3',
          'GET /user-documents/:id (admin) → 200',
          getOne.status === 200,
          `got ${getOne.status}`
        );
      }

      if (saCreatedUdocId != null) {
        const patch = await http('PATCH', `/api/v1/user-documents/${saCreatedUdocId}`, {
          token: adminToken,
          body: { adminNotes: 'Admin touched.' }
        });
        record(
          '3',
          'PATCH /user-documents/:id (admin, workflow field) → 200',
          patch.status === 200,
          `got ${patch.status}`
        );
      }

      if (saCreatedUdocId != null) {
        const del = await http('DELETE', `/api/v1/user-documents/${saCreatedUdocId}`, {
          token: adminToken
        });
        record(
          '3',
          'DELETE /user-documents/:id (admin, other user) → 403',
          del.status === 403,
          `got ${del.status}`
        );
      }
    }

    // ─── 4. Student — read-other / write-other / list blocked ──
    header('4. Student — list + read-other + write-other → 403');
    {
      const listS = await http('GET', '/api/v1/user-documents', { token: studentToken });
      record(
        '4',
        'GET /user-documents (student, no global) → 403',
        listS.status === 403,
        `got ${listS.status}`
      );

      // SA creates an admin-owned row so student has a cross-user target
      const adminRow = await http<UdocResponse>('POST', '/api/v1/user-documents', {
        token: saToken,
        body: {
          userId: adminUserId,
          documentTypeId: documentTypeIdB,
          documentId: documentIdC,
          fileUrl: 'https://cdn.example.com/admin-doc.pdf',
          fileFormat: 'pdf'
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
          `/api/v1/user-documents/${adminRowId}`,
          { token: studentToken }
        );
        record(
          '4',
          "GET /user-documents/:id (student → admin's row) → 403",
          getOther.status === 403,
          `got ${getOther.status}`
        );

        const patchOther = await http(
          'PATCH',
          `/api/v1/user-documents/${adminRowId}`,
          { token: studentToken, body: { fileName: 'hax.pdf' } }
        );
        record(
          '4',
          'PATCH /user-documents/:id (student → other) → 403',
          patchOther.status === 403,
          `got ${patchOther.status}`
        );

        const delOtherMe = await http(
          'DELETE',
          `/api/v1/user-documents/me/${adminRowId}`,
          { token: studentToken }
        );
        record(
          '4',
          'DELETE /user-documents/me/:id (student → other) → 403',
          delOtherMe.status === 403,
          `got ${delOtherMe.status}`
        );

        const delOther = await http(
          'DELETE',
          `/api/v1/user-documents/${adminRowId}`,
          { token: studentToken }
        );
        record(
          '4',
          'DELETE /user-documents/:id (student → other) → 403',
          delOther.status === 403,
          `got ${delOther.status}`
        );

        // Cleanup: sa deletes the admin row
        await http('DELETE', `/api/v1/user-documents/${adminRowId}`, { token: saToken });
      }

      const postS = await http('POST', '/api/v1/user-documents', {
        token: studentToken,
        body: {
          userId: studentUserId,
          documentTypeId: documentTypeIdA,
          documentId: documentIdB,
          fileUrl: 'https://cdn.example.com/x.pdf'
        }
      });
      record(
        '4',
        'POST /user-documents (student, global) → 403',
        postS.status === 403,
        `got ${postS.status}`
      );
    }

    // ─── 5. Student /me lifecycle + workflow-field lockout ────
    header('5. Student — /me lifecycle + .strict() rejects workflow fields');
    {
      const me0 = await http<ListResponse>('GET', '/api/v1/user-documents/me', {
        token: studentToken
      });
      record(
        '5',
        'GET /me (student) → 200 with SA-seeded row',
        me0.status === 200 && (me0.body?.data ?? []).some((r) => r.id === saCreatedUdocId),
        `count=${(me0.body?.data ?? []).length}`
      );

      const meOverride = await http<ListResponse>(
        'GET',
        `/api/v1/user-documents/me?userId=${adminUserId}`,
        { token: studentToken }
      );
      record(
        '5',
        'GET /me?userId=<admin> — server overrides query userId',
        meOverride.status === 200 &&
          (meOverride.body?.data ?? []).every((r) => r.userId === studentUserId),
        `userIds=${(meOverride.body?.data ?? []).map((r) => r.userId).join(',')}`
      );

      // Student tries to set verificationStatus via /me → .strict() blocks with 400
      const smuggle = await http('POST', '/api/v1/user-documents/me', {
        token: studentToken,
        body: {
          documentTypeId: documentTypeIdB,
          documentId: documentIdB,
          fileUrl: 'https://cdn.example.com/smuggle.pdf',
          verificationStatus: 'verified'
        }
      });
      record(
        '5',
        'POST /me with verificationStatus → 400 (strict mode)',
        smuggle.status === 400,
        `got ${smuggle.status}`
      );

      const smuggleVB = await http('POST', '/api/v1/user-documents/me', {
        token: studentToken,
        body: {
          documentTypeId: documentTypeIdB,
          documentId: documentIdB,
          fileUrl: 'https://cdn.example.com/smuggle.pdf',
          verifiedBy: studentUserId
        }
      });
      record(
        '5',
        'POST /me with verifiedBy → 400 (strict mode)',
        smuggleVB.status === 400,
        `got ${smuggleVB.status}`
      );

      const smuggleAN = await http('POST', '/api/v1/user-documents/me', {
        token: studentToken,
        body: {
          documentTypeId: documentTypeIdB,
          documentId: documentIdB,
          fileUrl: 'https://cdn.example.com/smuggle.pdf',
          adminNotes: 'please verify'
        }
      });
      record(
        '5',
        'POST /me with adminNotes → 400 (strict mode)',
        smuggleAN.status === 400,
        `got ${smuggleAN.status}`
      );

      // Student creates own row via /me using documentTypeB/documentB
      const create = await http<UdocResponse>('POST', '/api/v1/user-documents/me', {
        token: studentToken,
        body: {
          documentTypeId: documentTypeIdB,
          documentId: documentIdB,
          fileUrl: 'https://cdn.example.com/student-doc.pdf',
          fileName: 'student-doc.pdf',
          fileFormat: 'pdf',
          fileSizeKb: 210,
          documentNumber: 'STD-2026-0001',
          issuingAuthority: 'School'
        }
      });
      record(
        '5',
        'POST /me (student) → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `status=${create.status}`
      );
      studentSelfUdocId = create.body?.data?.id ?? null;
      record(
        '5',
        'POST /me row owned by caller (userId matches)',
        create.body?.data?.userId === studentUserId,
        `userId=${create.body?.data?.userId}`
      );
      record(
        '5',
        'POST /me row starts with verificationStatus=pending',
        create.body?.data?.verificationStatus === 'pending',
        `status=${create.body?.data?.verificationStatus}`
      );

      if (studentSelfUdocId != null) {
        const getSelf = await http(
          'GET',
          `/api/v1/user-documents/${studentSelfUdocId}`,
          { token: studentToken }
        );
        record(
          '5',
          'GET /user-documents/:id (student → own row) → 200',
          getSelf.status === 200,
          `got ${getSelf.status}`
        );
      }

      // Student PATCH /me/:id tries to set verificationStatus → 400
      if (studentSelfUdocId != null) {
        const patchSmuggle = await http(
          'PATCH',
          `/api/v1/user-documents/me/${studentSelfUdocId}`,
          {
            token: studentToken,
            body: { verificationStatus: 'verified' }
          }
        );
        record(
          '5',
          'PATCH /me/:id with verificationStatus → 400 (strict mode)',
          patchSmuggle.status === 400,
          `got ${patchSmuggle.status}`
        );
      }

      if (studentSelfUdocId != null) {
        const patch = await http('PATCH', `/api/v1/user-documents/me/${studentSelfUdocId}`, {
          token: studentToken,
          body: { fileName: 'updated.pdf', issuingAuthority: 'Updated Auth' }
        });
        record(
          '5',
          'PATCH /me/:id (student → own row, safe fields) → 200',
          patch.status === 200,
          `got ${patch.status}`
        );
      }

      // Student-B creates own row using documentTypeA/documentA → student A cannot touch it
      const bCreate = await http<UdocResponse>('POST', '/api/v1/user-documents/me', {
        token: studentBToken,
        body: {
          documentTypeId: documentTypeIdA,
          documentId: documentIdC,
          fileUrl: 'https://cdn.example.com/bdoc.pdf'
        }
      });
      studentBMeUdocId = bCreate.body?.data?.id ?? null;
      record(
        '5',
        'POST /me (student-b) → 201',
        bCreate.status === 201 && studentBMeUdocId != null,
        `id=${studentBMeUdocId}`
      );

      if (studentBMeUdocId != null) {
        const patchB = await http('PATCH', `/api/v1/user-documents/me/${studentBMeUdocId}`, {
          token: studentToken,
          body: { fileName: 'hack.pdf' }
        });
        record(
          '5',
          "PATCH /me/:id (student A → student B's row) → 403",
          patchB.status === 403,
          `got ${patchB.status}`
        );

        const delB = await http('DELETE', `/api/v1/user-documents/me/${studentBMeUdocId}`, {
          token: studentToken
        });
        record(
          '5',
          "DELETE /me/:id (student A → student B's row) → 403",
          delB.status === 403,
          `got ${delB.status}`
        );
      }

      if (studentSelfUdocId != null) {
        const del = await http<{ data?: { id: number; deleted: boolean } }>(
          'DELETE',
          `/api/v1/user-documents/me/${studentSelfUdocId}`,
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
          `/api/v1/user-documents/${studentSelfUdocId}`,
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
      if (saCreatedUdocId != null) {
        const del = await http<{ data?: { id: number; deleted: boolean } }>(
          'DELETE',
          `/api/v1/user-documents/${saCreatedUdocId}`,
          { token: saToken }
        );
        record(
          '6',
          'DELETE /user-documents/:id (sa) → 200',
          del.status === 200 && del.body?.data?.deleted === true,
          `got ${del.status}`
        );

        const after = await http(
          'GET',
          `/api/v1/user-documents/${saCreatedUdocId}`,
          { token: saToken }
        );
        record(
          '6',
          'GET /user-documents/:id after sa soft-delete → 404',
          after.status === 404,
          `got ${after.status}`
        );

        const row = await getPool().query<{ is_deleted: boolean; is_active: boolean }>(
          'SELECT is_deleted, is_active FROM user_documents WHERE id = $1',
          [saCreatedUdocId]
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
      if (saCreatedUdocId != null) {
        const studentRestore = await http(
          'POST',
          `/api/v1/user-documents/${saCreatedUdocId}/restore`,
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
          `/api/v1/user-documents/${saCreatedUdocId}/restore`,
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
          `/api/v1/user-documents/${saCreatedUdocId}`,
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
          `/api/v1/user-documents/${saCreatedUdocId}/restore`,
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
          `/api/v1/user-documents/999999999/restore`,
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
          `/api/v1/user-documents/${saCreatedUdocId}`,
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
          `/api/v1/user-documents/${saCreatedUdocId}/restore`,
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
          'SELECT is_deleted, is_active FROM user_documents WHERE id = $1',
          [saCreatedUdocId]
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
      for (const id of [saCreatedUdocId, studentSelfUdocId, studentBMeUdocId]) {
        if (id == null) continue;
        try {
          await hardDeleteUdocById(id);
          record('7', `row hard-deleted`, true, `id=${id}`);
        } catch (err) {
          record('7', `row hard-delete failed`, false, (err as Error).message);
        }
      }
      for (const uid of [saUserId, adminUserId, studentUserId, studentBUserId]) {
        if (uid == null) continue;
        try {
          await hardDeleteUdocByUserId(uid);
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
    console.log('  Phase 4 user_documents verdict: \x1b[32mPASS\x1b[0m');
  }
};

main().catch((err) => {
  console.error('\n\x1b[31m✗ fatal:\x1b[0m', err);
  process.exitCode = 1;
  closePool().catch(() => undefined);
  closeRedis().catch(() => undefined);
});
