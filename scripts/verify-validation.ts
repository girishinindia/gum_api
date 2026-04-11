/* eslint-disable no-console */
/**
 * Step 5 — Shared validation layer verification.
 *
 * Mounts the real `validate()` middleware + real `errorHandler` on a
 * throwaway Express app, then hits it over a real ephemeral HTTP
 * socket and asserts the wire responses. No mocks, no DB, no Redis —
 * just the edge.
 *
 * Sections:
 *   1. paginationSchema — defaults, coercion, clamp rejection
 *   2. idParamSchema    — positive int, rejects negatives/NaN/too big
 *   3. Body schema      — createUserSchema (email, name, password)
 *   4. Composite        — body + params + query in one validate() call
 *   5. Sort direction   — case folding to 'ASC'|'DESC'
 *   6. Custom refinements — email lower-case transform, queryBoolean
 *   7. Audit pagination  — allows pageSize up to 1000
 *   8. Bare-schema form  — validate(schema) shorthand for body
 */

import type { Server } from 'node:http';
import express from 'express';
import { z } from 'zod';

import { errorHandler, notFoundHandler } from '../src/core/errors/error-handler';
import { validate } from '../src/core/middlewares/validate';
import {
  bigintIdSchema,
  emailSchema,
  idParamSchema,
  nameSchema,
  paginationAuditSchema,
  paginationSchema,
  passwordSchema,
  queryBooleanSchema,
  sortSchema
} from '../src/shared/validation';

// ─────────────────────────────────────────────────────────────
// Result reporter
// ─────────────────────────────────────────────────────────────

type CheckResult = { section: string; name: string; ok: boolean; detail: string };
const results: CheckResult[] = [];
const record = (section: string, name: string, ok: boolean, detail: string): void => {
  results.push({ section, name, ok, detail });
  const mark = ok ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✖\x1b[0m';
  console.log(`  ${mark}  ${name.padEnd(60)} ${detail}`);
};

// ─────────────────────────────────────────────────────────────
// App under test
// ─────────────────────────────────────────────────────────────

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());

  // Dummy requestId so the errorHandler logs cleanly
  app.use((req, _res, next) => {
    req.requestId = 'verify-validation';
    next();
  });

  // 1. Pagination query
  app.get('/pagination', validate({ query: paginationSchema }), (req, res) => {
    res.json({ success: true, message: 'ok', data: req.query });
  });

  // 2. ID param
  app.get('/items/:id', validate({ params: idParamSchema }), (req, res) => {
    res.json({ success: true, message: 'ok', data: req.params });
  });

  // 3. Create user body
  const createUserSchema = z.object({
    email: emailSchema,
    firstName: nameSchema,
    lastName: nameSchema,
    password: passwordSchema
  });
  app.post('/users', validate({ body: createUserSchema }), (req, res) => {
    res.status(201).json({ success: true, message: 'created', data: req.body });
  });

  // 4. Composite — body + params + query
  const assignRoleBody = z.object({ roleId: bigintIdSchema });
  app.post(
    '/users/:id/roles',
    validate({
      params: idParamSchema,
      query: paginationSchema,
      body: assignRoleBody
    }),
    (req, res) => {
      res.json({
        success: true,
        message: 'ok',
        data: { params: req.params, query: req.query, body: req.body }
      });
    }
  );

  // 5. Sort
  app.get('/sorted', validate({ query: sortSchema }), (req, res) => {
    res.json({ success: true, message: 'ok', data: req.query });
  });

  // 6. Custom refinements — queryBoolean
  const filterSchema = z.object({ active: queryBooleanSchema });
  app.get('/filter', validate({ query: filterSchema }), (req, res) => {
    res.json({ success: true, message: 'ok', data: req.query });
  });

  // 7. Audit pagination
  app.get('/audit', validate({ query: paginationAuditSchema }), (req, res) => {
    res.json({ success: true, message: 'ok', data: req.query });
  });

  // 8. Bare schema shorthand — validate(schema) == validate({body: schema})
  const pingBody = z.object({ ping: z.literal('pong') });
  app.post('/bare', validate(pingBody), (req, res) => {
    res.json({ success: true, message: 'ok', data: req.body });
  });

  // Terminal error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

// ─────────────────────────────────────────────────────────────
// Tiny HTTP test client (fetch → typed json)
// ─────────────────────────────────────────────────────────────

type WireResponse = { status: number; body: Record<string, unknown> };

async function call(
  base: string,
  method: string,
  path: string,
  body?: unknown
): Promise<WireResponse> {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body: json };
}

// ─────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const app = buildApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') {
    throw new Error('could not determine server address');
  }
  const base = `http://127.0.0.1:${addr.port}`;

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Step 5 — Shared validation layer');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  App listening on ${base}\n`);

  // ── 1. Pagination ───────────────────────────────────────────
  console.log('1. paginationSchema (query)\n');
  {
    const r = await call(base, 'GET', '/pagination');
    const d = r.body.data as { pageIndex: number; pageSize: number };
    record(
      'pagination',
      'defaults applied when omitted',
      r.status === 200 && d.pageIndex === 1 && d.pageSize === 20,
      `status=${r.status}, got=${JSON.stringify(d)}`
    );
  }
  {
    const r = await call(base, 'GET', '/pagination?pageIndex=3&pageSize=25');
    const d = r.body.data as { pageIndex: number; pageSize: number };
    record(
      'pagination',
      'string query coerced to numbers',
      r.status === 200 && d.pageIndex === 3 && d.pageSize === 25 && typeof d.pageIndex === 'number',
      `got=${JSON.stringify(d)}`
    );
  }
  {
    const r = await call(base, 'GET', '/pagination?pageSize=500');
    record(
      'pagination',
      'pageSize > 100 → 400 VALIDATION_ERROR',
      r.status === 400 && r.body.code === 'VALIDATION_ERROR',
      `status=${r.status}, code=${r.body.code}`
    );
  }
  {
    const r = await call(base, 'GET', '/pagination?pageIndex=0');
    record(
      'pagination',
      'pageIndex = 0 → 400 (must be ≥ 1)',
      r.status === 400 && Array.isArray(r.body.details),
      `status=${r.status}`
    );
  }
  {
    const r = await call(base, 'GET', '/pagination?pageIndex=-1');
    record('pagination', 'pageIndex = -1 → 400', r.status === 400, `status=${r.status}`);
  }
  {
    const r = await call(base, 'GET', '/pagination?pageSize=banana');
    record('pagination', 'non-numeric pageSize → 400', r.status === 400, `status=${r.status}`);
  }

  // ── 2. ID param ─────────────────────────────────────────────
  console.log('\n2. idParamSchema (params)\n');
  {
    const r = await call(base, 'GET', '/items/42');
    const d = r.body.data as { id: number };
    record('id', 'valid id 42 passes', r.status === 200 && d.id === 42 && typeof d.id === 'number', `got=${JSON.stringify(d)}`);
  }
  {
    const r = await call(base, 'GET', '/items/0');
    record('id', 'id 0 rejected (must be positive)', r.status === 400, `status=${r.status}`);
  }
  {
    const r = await call(base, 'GET', '/items/-5');
    record('id', 'id -5 rejected', r.status === 400, `status=${r.status}`);
  }
  {
    const r = await call(base, 'GET', '/items/abc');
    record('id', 'non-numeric id rejected', r.status === 400, `status=${r.status}`);
  }
  {
    const r = await call(base, 'GET', '/items/3.14');
    record('id', 'non-integer id rejected', r.status === 400, `status=${r.status}`);
  }

  // ── 3. Body schema ──────────────────────────────────────────
  console.log('\n3. createUserSchema (body)\n');
  {
    const r = await call(base, 'POST', '/users', {
      email: '  Alice@Example.COM  ',
      firstName: 'Alice',
      lastName: 'Wonderland',
      password: 'Str0ngPass'
    });
    const d = r.body.data as { email: string; firstName: string };
    record(
      'body',
      'valid user → 201, email normalized to lowercase',
      r.status === 201 && d.email === 'alice@example.com' && d.firstName === 'Alice',
      `email=${d.email}`
    );
  }
  {
    const r = await call(base, 'POST', '/users', {
      email: 'not-an-email',
      firstName: 'A',
      lastName: 'B',
      password: 'Str0ngPass'
    });
    record('body', 'invalid email → 400', r.status === 400, `status=${r.status}`);
  }
  {
    const r = await call(base, 'POST', '/users', {
      email: 'a@b.co',
      firstName: 'A',
      lastName: 'B',
      password: 'weak'
    });
    record('body', 'short password → 400', r.status === 400, `status=${r.status}`);
  }
  {
    const r = await call(base, 'POST', '/users', {
      email: 'a@b.co',
      firstName: 'A',
      lastName: 'B',
      password: 'alllowercase1'
    });
    record('body', 'password missing uppercase → 400', r.status === 400, `status=${r.status}`);
  }
  {
    const r = await call(base, 'POST', '/users', {
      email: 'a@b.co',
      firstName: '   ',
      lastName: 'B',
      password: 'Str0ngPass'
    });
    record('body', 'whitespace-only firstName rejected', r.status === 400, `status=${r.status}`);
  }
  {
    const r = await call(base, 'POST', '/users', {});
    const details = r.body.details as unknown[];
    record(
      'body',
      'empty body → 400 with multiple issues',
      r.status === 400 && Array.isArray(details) && details.length >= 4,
      `issues=${Array.isArray(details) ? details.length : 'none'}`
    );
  }

  // ── 4. Composite ────────────────────────────────────────────
  console.log('\n4. Composite (body + params + query in one validate())\n');
  {
    const r = await call(base, 'POST', '/users/7/roles?pageIndex=2&pageSize=10', { roleId: 3 });
    const d = r.body.data as {
      params: { id: number };
      query: { pageIndex: number; pageSize: number };
      body: { roleId: number };
    };
    const ok =
      r.status === 200 &&
      d.params.id === 7 &&
      d.query.pageIndex === 2 &&
      d.query.pageSize === 10 &&
      d.body.roleId === 3;
    record('composite', 'all three targets validated together', ok, `got=${JSON.stringify(d)}`);
  }
  {
    const r = await call(base, 'POST', '/users/abc/roles', { roleId: 3 });
    record('composite', 'bad param → 400 even if body ok', r.status === 400, `status=${r.status}`);
  }
  {
    const r = await call(base, 'POST', '/users/7/roles?pageSize=9999', { roleId: 3 });
    record(
      'composite',
      'bad query → 400 even if params+body ok',
      r.status === 400,
      `status=${r.status}`
    );
  }
  {
    const r = await call(base, 'POST', '/users/7/roles', { roleId: 'not-a-number' });
    record('composite', 'bad body → 400 even if params ok', r.status === 400, `status=${r.status}`);
  }

  // ── 5. Sort ─────────────────────────────────────────────────
  console.log('\n5. sortSchema\n');
  {
    const r = await call(base, 'GET', '/sorted?sortDirection=asc');
    const d = r.body.data as { sortDirection: string };
    record('sort', 'lowercase "asc" → "ASC"', r.status === 200 && d.sortDirection === 'ASC', `got=${d.sortDirection}`);
  }
  {
    const r = await call(base, 'GET', '/sorted?sortDirection=DESC');
    const d = r.body.data as { sortDirection: string };
    record('sort', 'uppercase "DESC" passes', r.status === 200 && d.sortDirection === 'DESC', `got=${d.sortDirection}`);
  }
  {
    const r = await call(base, 'GET', '/sorted?sortDirection=sideways');
    record('sort', 'invalid direction → 400', r.status === 400, `status=${r.status}`);
  }
  {
    const r = await call(base, 'GET', '/sorted');
    const d = r.body.data as { sortDirection: string };
    record('sort', 'default is DESC', r.status === 200 && d.sortDirection === 'DESC', `got=${d.sortDirection}`);
  }

  // ── 6. Custom refinements — queryBoolean ────────────────────
  console.log('\n6. queryBooleanSchema\n');
  {
    const r = await call(base, 'GET', '/filter?active=true');
    const d = r.body.data as { active: boolean };
    record(
      'refine',
      '"true" → boolean true',
      r.status === 200 && d.active === true && typeof d.active === 'boolean',
      `got=${JSON.stringify(d)}`
    );
  }
  {
    const r = await call(base, 'GET', '/filter?active=0');
    const d = r.body.data as { active: boolean };
    record('refine', '"0" → boolean false', r.status === 200 && d.active === false, `got=${JSON.stringify(d)}`);
  }
  {
    const r = await call(base, 'GET', '/filter?active=maybe');
    record('refine', '"maybe" → 400', r.status === 400, `status=${r.status}`);
  }

  // ── 7. Audit pagination ─────────────────────────────────────
  console.log('\n7. paginationAuditSchema\n');
  {
    const r = await call(base, 'GET', '/audit?pageSize=500');
    const d = r.body.data as { pageSize: number };
    record('audit', 'pageSize 500 allowed (≤1000)', r.status === 200 && d.pageSize === 500, `got=${JSON.stringify(d)}`);
  }
  {
    const r = await call(base, 'GET', '/audit?pageSize=1001');
    record('audit', 'pageSize 1001 → 400', r.status === 400, `status=${r.status}`);
  }

  // ── 8. Bare-schema form ─────────────────────────────────────
  console.log('\n8. validate(schema) shorthand (body only)\n');
  {
    const r = await call(base, 'POST', '/bare', { ping: 'pong' });
    record('bare', 'valid body passes', r.status === 200, `status=${r.status}`);
  }
  {
    const r = await call(base, 'POST', '/bare', { ping: 'notpong' });
    record('bare', 'invalid body → 400', r.status === 400, `status=${r.status}`);
  }

  // ── Summary ─────────────────────────────────────────────────
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
    pagination: '1. paginationSchema ',
    id: '2. idParamSchema    ',
    body: '3. body schemas     ',
    composite: '4. Composite        ',
    sort: '5. sortSchema       ',
    refine: '6. queryBoolean     ',
    audit: '7. paginationAudit  ',
    bare: '8. bare shorthand   '
  };
  for (const [key, label] of Object.entries(labels)) {
    const s = bySection.get(key);
    if (s) console.log(`  ${label}: ${s.ok}/${s.total}`);
  }
  const okCount = results.filter((r) => r.ok).length;
  console.log('  ──────────────────────────────');
  console.log(`  Total              : ${okCount}/${results.length}`);
  console.log('══════════════════════════════════════════════════════\n');

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log('FAILED CHECKS:');
    for (const f of failed) console.log(`  - [${f.section}] ${f.name}: ${f.detail}`);
  } else {
    console.log('All Step 5 validation layer checks passed.');
  }

  await new Promise<void>((resolve) => server.close(() => resolve()));
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nFatal error in verify-validation:', err);
  process.exit(1);
});
