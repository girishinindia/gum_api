/* eslint-disable no-console */
/**
 * Phase 2 · Stage 4 — Unified PATCH /:id contract (live, end-to-end).
 *
 * This script complements verify-master-data.ts and focuses narrowly on
 * the four resources that had their dedicated icon/image/flag upload
 * routes folded into the single PATCH /:id endpoint:
 *
 *    • /api/v1/countries/:id         (flag slot)
 *    • /api/v1/specializations/:id   (icon slot)
 *    • /api/v1/categories/:id        (icon + image slots)
 *    • /api/v1/sub-categories/:id    (icon + image slots)
 *
 * For each resource we assert the following invariants:
 *
 *    (a) JSON PATCH with a non-empty body              → 200
 *    (b) JSON PATCH with `{}`                          → 400 ("Provide at least one field")
 *    (c) multipart/form-data PATCH with text fields only and NO file →
 *        200  (exercises coerceMultipartBody — number/boolean strings
 *        must be converted back to their typed values before validation)
 *    (d) multipart PATCH with a real image file        → 200, URL ends in .webp
 *    (e) multipart PATCH with upload + action=delete   → 400 (mutex)
 *          — countries is EXEMPT: flag slot has no delete action.
 *    (f) JSON PATCH with `{iconAction:'delete'}` etc.  → 200, URL null
 *          — countries is EXEMPT.
 *    (g) The old dedicated routes now return 404:
 *          POST   /countries/:id/flag
 *          POST   /specializations/:id/icon
 *          DELETE /specializations/:id/icon
 *          POST   /categories/:id/icon
 *          DELETE /categories/:id/icon
 *          POST   /categories/:id/image
 *          DELETE /categories/:id/image
 *          POST   /sub-categories/:id/icon
 *          DELETE /sub-categories/:id/icon
 *          POST   /sub-categories/:id/image
 *          DELETE /sub-categories/:id/image
 *
 * Every resource is created fresh in this script, touched by the
 * assertions above, and hard-deleted in the cleanup section at the end
 * so the DB is left in exactly its pre-run state even if Bunny CDN
 * objects outlive the row.
 *
 * Nothing is mocked: real Express app, real Supabase, real Upstash
 * Redis, real Bunny CDN bucket.
 */

// ─── Test harness env flags (must be set BEFORE any src/ import) ───
// Flip the rate-limit bypass flag so the script can fire a few dozen
// requests against the live Express app without tripping the global
// limiter. `config/rate-limit.ts` honors SKIP_GLOBAL_RATE_LIMIT=1 via a
// per-request `skip` function, so setting it here is sufficient.
process.env.SKIP_GLOBAL_RATE_LIMIT = '1';

import { Buffer } from 'node:buffer';
import type { AddressInfo } from 'node:net';

import sharp from 'sharp';

import { buildApp } from '../src/app';
import { closePool, getPool } from '../src/database/pg-pool';
import { closeRedis } from '../src/database/redis';

// ─────────────────────────────────────────────────────────────
// Reporter
// ─────────────────────────────────────────────────────────────

type Check = { section: string; name: string; ok: boolean; detail: string };
const results: Check[] = [];
const record = (section: string, name: string, ok: boolean, detail: string): void => {
  results.push({ section, name, ok, detail });
  const mark = ok ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✖\x1b[0m';
  console.log(`  ${mark}  ${name.padEnd(78)} ${detail}`);
};
const header = (title: string): void => {
  console.log(`\n\x1b[36m━━ ${title} ━━\x1b[0m`);
};

// ─────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────

const RUN_ID = `${process.pid}-${Date.now()}`;
const SLUG = RUN_ID.replace(/-/g, '_');
const TEST_EMAIL = `verify-patch+${RUN_ID}@test.growupmore.local`;
const TEST_PASSWORD = 'VerifyPass123';
const TEST_FIRST = 'VerifyPatch';
const TEST_LAST = `Run${process.pid}`;

// Namespaces to avoid colliding with other runs / seeds.
const COUNTRY_NAME = `VerifyPatchCty_${SLUG}`.slice(0, 120);
// iso2/iso3 must be purely alphabetic. Use a throwaway pair that
// won't collide with real data or with verify-resources.ts (which
// owns ZZ/ZZZ).
const COUNTRY_ISO2 = 'YZ';
const COUNTRY_ISO3 = 'YZZ';
const SPECIALIZATION_NAME = `VerifyPatchSpec_${SLUG}`.slice(0, 120);
const CATEGORY_CODE = `VPCAT-${(process.pid % 100000).toString(36).toUpperCase()}`.slice(0, 80);
const SUB_CATEGORY_CODE = `VPSCAT-${(process.pid % 100000).toString(36).toUpperCase()}`.slice(0, 80);
const CATEGORY_TR_NAME = `Verify Patch Category ${SLUG}`.slice(0, 200);
const SUB_CATEGORY_TR_NAME = `Verify Patch Sub ${SLUG}`.slice(0, 200);

// Runtime state
let createdUserId: number | null = null;
let accessToken = '';

let createdCountryId: number | null = null;
let createdSpecializationId: number | null = null;
let createdCategoryId: number | null = null;
let createdSubCategoryId: number | null = null;
let anchorLanguageId: number | null = null;

// ─────────────────────────────────────────────────────────────
// HTTP helpers
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

/**
 * Multipart helper — same shape as verify-master-data.ts's mkMultipart
 * but with one important addition: the file is OPTIONAL, so we can
 * drive the text-only multipart case (assertion `c` above) through the
 * same helper instead of hand-rolling a second one.
 */
const mkMultipart = (baseUrl: string) => {
  return async <T = unknown>(
    path: string,
    options: {
      token?: string;
      method?: 'POST' | 'PATCH';
      /** Optional file to append. Omit for text-only multipart bodies. */
      file?: {
        buffer: Buffer;
        contentType: string;
        filename: string;
        fieldName: string;
      };
      /** Extra text fields mixed into the same body. Values are stringified. */
      fields?: Record<string, string | number | boolean | null>;
    } = {}
  ): Promise<HttpResult<T>> => {
    const form = new FormData();
    if (options.file) {
      form.append(
        options.file.fieldName,
        new Blob([options.file.buffer], { type: options.file.contentType }),
        options.file.filename
      );
    }
    if (options.fields) {
      for (const [k, v] of Object.entries(options.fields)) {
        if (v === null) continue;
        form.append(k, String(v));
      }
    }
    const headers: Record<string, string> = {};
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'PATCH',
      headers,
      body: form
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
// DB setup / cleanup helpers
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

const findAnchorLanguage = async (): Promise<{ id: number } | null> => {
  const { rows } = await getPool().query<{ id: string | number }>(
    `SELECT id FROM languages
      WHERE is_deleted = FALSE AND is_active = TRUE
      ORDER BY id ASC
      LIMIT 1`
  );
  const row = rows[0];
  return row ? { id: Number(row.id) } : null;
};

const hardDeleteCountry = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM countries WHERE id = $1', [id]);
};
const hardDeleteSpecialization = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM specializations WHERE id = $1', [id]);
};
const hardDeleteCategory = async (id: number): Promise<void> => {
  const pool = getPool();
  await pool.query('DELETE FROM category_translations WHERE category_id = $1', [id]);
  await pool.query('DELETE FROM categories WHERE id = $1', [id]);
};
const hardDeleteSubCategory = async (id: number): Promise<void> => {
  const pool = getPool();
  await pool.query('DELETE FROM sub_category_translations WHERE sub_category_id = $1', [id]);
  await pool.query('DELETE FROM sub_categories WHERE id = $1', [id]);
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
// Image fixture helpers
// ─────────────────────────────────────────────────────────────

/**
 * Build a tiny PNG buffer — deliberately small (32×32) so Bunny CDN
 * traffic is negligible and each assertion completes fast. The colour
 * differs per caller so sharp actually re-encodes rather than hitting
 * a cache.
 */
const tinyPng = async (
  rgba: [number, number, number, number]
): Promise<Buffer> => {
  const [r, g, b, a] = rgba;
  return sharp({
    create: { width: 32, height: 32, channels: 4, background: { r, g, b, alpha: a } }
  })
    .png()
    .toBuffer();
};

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  console.log('━━ Phase 2 · Stage 4 · Unified PATCH /:id contract (live) ━━');
  console.log(`  test email : ${TEST_EMAIL}`);

  const app = buildApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.on('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const http = mkClient(baseUrl);
  const httpMultipart = mkMultipart(baseUrl);

  try {
    // ─── 0. Setup — harness user with super_admin ────────
    header('0. Setup — register + elevate + login');
    {
      const reg = await http<{
        data?: { userId: number };
      }>('POST', '/api/v1/auth/register', {
        body: {
          firstName: TEST_FIRST,
          lastName: TEST_LAST,
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          roleCode: 'student'
        }
      });
      record(
        '0',
        'register harness user',
        reg.status === 201 && typeof reg.body?.data?.userId === 'number',
        `status=${reg.status}`
      );
      const uid = reg.body?.data?.userId;
      if (typeof uid !== 'number') {
        throw new Error('Cannot proceed without a registered user');
      }
      createdUserId = uid;

      await getPool().query('SELECT udf_auth_verify_email($1)', [uid]);
      await getPool().query('SELECT udf_auth_verify_mobile($1)', [uid]);
      await elevateToSuperAdmin(uid);
      record('0', 'elevated harness user to super_admin (level 0)', true, `uid=${uid}`);

      const login = await http<{
        data?: { accessToken: string };
      }>('POST', '/api/v1/auth/login', {
        body: { identifier: TEST_EMAIL, password: TEST_PASSWORD }
      });
      record(
        '0',
        'login returns 200 with accessToken',
        login.status === 200 && typeof login.body?.data?.accessToken === 'string',
        `status=${login.status}`
      );
      accessToken = login.body?.data?.accessToken ?? '';

      const lang = await findAnchorLanguage();
      if (!lang) {
        throw new Error('No active language found for translation anchors');
      }
      anchorLanguageId = lang.id;
      record('0', 'anchor language located', true, `id=${lang.id}`);
    }

    // ─── 1. Countries — flag slot (no delete action) ──────
    header('1. Countries · flag slot');
    {
      const create = await http<{
        data: { id: number; flagImage: string | null; iso2: string };
      }>('POST', '/api/v1/countries', {
        token: accessToken,
        body: {
          name: COUNTRY_NAME,
          iso2: COUNTRY_ISO2,
          iso3: COUNTRY_ISO3,
          phoneCode: '+991',
          currency: 'YYD',
          currencyName: 'Yee Dollar',
          currencySymbol: 'Y$',
          nationalLanguage: 'Yeeish',
          nationality: 'Yeean',
          languages: ['Yeeish'],
          tld: '.yy',
          isActive: true
        }
      });
      record(
        '1',
        'POST /countries (anchor row) → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `status=${create.status}`
      );
      createdCountryId = create.body?.data?.id ?? null;
      if (!createdCountryId) throw new Error('Cannot proceed without a country row');

      // (a) JSON PATCH non-empty → 200
      const jsonUpd = await http<{ data: { name: string } }>(
        'PATCH',
        `/api/v1/countries/${createdCountryId}`,
        { token: accessToken, body: { name: `${COUNTRY_NAME}-renamed` } }
      );
      record(
        '1',
        'JSON PATCH /countries/:id {name} → 200',
        jsonUpd.status === 200 && jsonUpd.body?.data?.name === `${COUNTRY_NAME}-renamed`,
        `status=${jsonUpd.status}`
      );

      // (b) JSON PATCH empty body → 400
      const jsonEmpty = await http<{ code: string }>(
        'PATCH',
        `/api/v1/countries/${createdCountryId}`,
        { token: accessToken, body: {} }
      );
      record(
        '1',
        'JSON PATCH /countries/:id {} → 400',
        jsonEmpty.status === 400,
        `status=${jsonEmpty.status}`
      );

      // (c) multipart PATCH text-only → 200 (exercises coerceMultipartBody)
      //     phoneCode remains a string, but isActive comes over the wire
      //     as the literal "true" and must be coerced back to boolean.
      const mpText = await httpMultipart<{ data: { phoneCode: string; isActive: boolean } }>(
        `/api/v1/countries/${createdCountryId}`,
        {
          token: accessToken,
          method: 'PATCH',
          fields: { phoneCode: '+990', isActive: true }
        }
      );
      record(
        '1',
        'multipart PATCH /countries/:id text-only → 200 + coercion',
        mpText.status === 200 &&
          mpText.body?.data?.phoneCode === '+990' &&
          mpText.body?.data?.isActive === true,
        `status=${mpText.status} isActive=${mpText.body?.data?.isActive}`
      );

      // (d) multipart PATCH with real flag file → 200, flagUrl ends in .webp.
      //     Country flag pipeline enforces 90×90 exact, so we build at that size.
      const flagPng = await sharp({
        create: { width: 90, height: 90, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } }
      })
        .png()
        .toBuffer();
      const flagUp = await httpMultipart<{ data: { flagImage: string | null } }>(
        `/api/v1/countries/${createdCountryId}`,
        {
          token: accessToken,
          method: 'PATCH',
          file: {
            buffer: flagPng,
            contentType: 'image/png',
            filename: 'flag.png',
            fieldName: 'flag'
          }
        }
      );
      record(
        '1',
        'multipart PATCH /countries/:id (flag) → 200 + .webp',
        flagUp.status === 200 &&
          typeof flagUp.body?.data?.flagImage === 'string' &&
          flagUp.body.data.flagImage.endsWith('.webp'),
        `status=${flagUp.status} flagImage=${flagUp.body?.data?.flagImage ?? 'null'}`
      );

      // (g) Old dedicated POST /:id/flag endpoint is gone → 404
      const oldFlag = await http<{ code: string }>(
        'POST',
        `/api/v1/countries/${createdCountryId}/flag`,
        { token: accessToken, body: {} }
      );
      record(
        '1',
        'old POST /countries/:id/flag → 404 (route removed)',
        oldFlag.status === 404,
        `status=${oldFlag.status}`
      );
    }

    // ─── 2. Specializations — icon slot (delete supported) ─
    header('2. Specializations · icon slot');
    {
      const create = await http<{
        data: { id: number; iconUrl: string | null };
      }>('POST', '/api/v1/specializations', {
        token: accessToken,
        body: {
          name: SPECIALIZATION_NAME,
          category: 'technology',
          description: 'verify-patch-unified anchor',
          isActive: true
        }
      });
      record(
        '2',
        'POST /specializations (anchor row) → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `status=${create.status}`
      );
      createdSpecializationId = create.body?.data?.id ?? null;
      if (!createdSpecializationId) throw new Error('Cannot proceed without a specialization');

      // (a) JSON PATCH non-empty → 200
      const jsonUpd = await http<{ data: { description: string | null } }>(
        'PATCH',
        `/api/v1/specializations/${createdSpecializationId}`,
        { token: accessToken, body: { description: 'patched via JSON' } }
      );
      record(
        '2',
        'JSON PATCH /specializations/:id {description} → 200',
        jsonUpd.status === 200 && jsonUpd.body?.data?.description === 'patched via JSON',
        `status=${jsonUpd.status}`
      );

      // (b) JSON PATCH empty body → 400
      const jsonEmpty = await http<{ code: string }>(
        'PATCH',
        `/api/v1/specializations/${createdSpecializationId}`,
        { token: accessToken, body: {} }
      );
      record(
        '2',
        'JSON PATCH /specializations/:id {} → 400',
        jsonEmpty.status === 400,
        `status=${jsonEmpty.status}`
      );

      // (c) multipart text-only → 200 + coercion
      const mpText = await httpMultipart<{ data: { isActive: boolean; description: string | null } }>(
        `/api/v1/specializations/${createdSpecializationId}`,
        {
          token: accessToken,
          method: 'PATCH',
          fields: { isActive: true, description: 'patched via multipart' }
        }
      );
      record(
        '2',
        'multipart PATCH /specializations/:id text-only → 200 + coercion',
        mpText.status === 200 &&
          mpText.body?.data?.isActive === true &&
          mpText.body?.data?.description === 'patched via multipart',
        `status=${mpText.status} isActive=${mpText.body?.data?.isActive}`
      );

      // (d) multipart PATCH with icon file → 200, iconUrl ends in .webp
      const iconPng = await tinyPng([255, 64, 64, 1]);
      const iconUp = await httpMultipart<{ data: { iconUrl: string | null } }>(
        `/api/v1/specializations/${createdSpecializationId}`,
        {
          token: accessToken,
          method: 'PATCH',
          file: { buffer: iconPng, contentType: 'image/png', filename: 's.png', fieldName: 'icon' }
        }
      );
      record(
        '2',
        'multipart PATCH /specializations/:id (icon) → 200 + .webp',
        iconUp.status === 200 &&
          typeof iconUp.body?.data?.iconUrl === 'string' &&
          iconUp.body.data.iconUrl.endsWith('.webp'),
        `status=${iconUp.status} iconUrl=${iconUp.body?.data?.iconUrl ?? 'null'}`
      );

      // (e) mutex — upload + iconAction=delete in same request → 400
      const mutex = await httpMultipart<{ code: string }>(
        `/api/v1/specializations/${createdSpecializationId}`,
        {
          token: accessToken,
          method: 'PATCH',
          file: { buffer: iconPng, contentType: 'image/png', filename: 's.png', fieldName: 'icon' },
          fields: { iconAction: 'delete' }
        }
      );
      record(
        '2',
        'mutex: file + iconAction=delete same request → 400',
        mutex.status === 400,
        `status=${mutex.status}`
      );

      // (f) JSON PATCH {iconAction:'delete'} → 200 + iconUrl cleared
      const iconDel = await http<{ data: { iconUrl: string | null } }>(
        'PATCH',
        `/api/v1/specializations/${createdSpecializationId}`,
        { token: accessToken, body: { iconAction: 'delete' } }
      );
      record(
        '2',
        'JSON PATCH {iconAction:delete} → 200 + iconUrl null',
        iconDel.status === 200 && iconDel.body?.data?.iconUrl === null,
        `status=${iconDel.status} iconUrl=${iconDel.body?.data?.iconUrl ?? 'null'}`
      );

      // (g) Old dedicated POST+DELETE /:id/icon → 404
      const oldPost = await http<{ code: string }>(
        'POST',
        `/api/v1/specializations/${createdSpecializationId}/icon`,
        { token: accessToken, body: {} }
      );
      record(
        '2',
        'old POST /specializations/:id/icon → 404 (route removed)',
        oldPost.status === 404,
        `status=${oldPost.status}`
      );
      const oldDel = await http<{ code: string }>(
        'DELETE',
        `/api/v1/specializations/${createdSpecializationId}/icon`,
        { token: accessToken }
      );
      record(
        '2',
        'old DELETE /specializations/:id/icon → 404 (route removed)',
        oldDel.status === 404,
        `status=${oldDel.status}`
      );
    }

    // ─── 3. Categories — icon + image slots ───────────────
    header('3. Categories · icon + image slots');
    {
      const create = await http<{
        data: { id: number; iconUrl: string | null; imageUrl: string | null };
      }>('POST', '/api/v1/categories', {
        token: accessToken,
        body: {
          code: CATEGORY_CODE,
          displayOrder: 9999,
          isActive: true,
          translation: {
            languageId: anchorLanguageId,
            name: CATEGORY_TR_NAME,
            description: 'verify-patch-unified anchor translation'
          }
        }
      });
      record(
        '3',
        'POST /categories (anchor row) → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `status=${create.status}`
      );
      createdCategoryId = create.body?.data?.id ?? null;
      if (!createdCategoryId) throw new Error('Cannot proceed without a category row');

      // (a) JSON PATCH non-empty → 200
      const jsonUpd = await http<{ data: { displayOrder: number } }>(
        'PATCH',
        `/api/v1/categories/${createdCategoryId}`,
        { token: accessToken, body: { displayOrder: 8888 } }
      );
      record(
        '3',
        'JSON PATCH /categories/:id {displayOrder} → 200',
        jsonUpd.status === 200 && jsonUpd.body?.data?.displayOrder === 8888,
        `status=${jsonUpd.status}`
      );

      // (b) JSON PATCH empty body → 400
      const jsonEmpty = await http<{ code: string }>(
        'PATCH',
        `/api/v1/categories/${createdCategoryId}`,
        { token: accessToken, body: {} }
      );
      record(
        '3',
        'JSON PATCH /categories/:id {} → 400',
        jsonEmpty.status === 400,
        `status=${jsonEmpty.status}`
      );

      // (c) multipart text-only → 200 + coercion (int + bool)
      const mpText = await httpMultipart<{ data: { displayOrder: number; isActive: boolean } }>(
        `/api/v1/categories/${createdCategoryId}`,
        {
          token: accessToken,
          method: 'PATCH',
          fields: { displayOrder: 7777, isActive: true }
        }
      );
      record(
        '3',
        'multipart PATCH /categories/:id text-only → 200 + int/bool coercion',
        mpText.status === 200 &&
          mpText.body?.data?.displayOrder === 7777 &&
          mpText.body?.data?.isActive === true,
        `status=${mpText.status} displayOrder=${mpText.body?.data?.displayOrder}`
      );

      // (d) icon upload → 200 + .webp
      const iconPng = await tinyPng([120, 70, 220, 1]);
      const iconUp = await httpMultipart<{ data: { iconUrl: string | null } }>(
        `/api/v1/categories/${createdCategoryId}`,
        {
          token: accessToken,
          method: 'PATCH',
          file: { buffer: iconPng, contentType: 'image/png', filename: 'c.png', fieldName: 'icon' }
        }
      );
      record(
        '3',
        'multipart PATCH /categories/:id (icon) → 200 + .webp',
        iconUp.status === 200 &&
          typeof iconUp.body?.data?.iconUrl === 'string' &&
          iconUp.body.data.iconUrl.endsWith('.webp'),
        `status=${iconUp.status}`
      );

      // (d) image upload → 200 + .webp
      const imgPng = await tinyPng([250, 220, 80, 1]);
      const imgUp = await httpMultipart<{ data: { imageUrl: string | null } }>(
        `/api/v1/categories/${createdCategoryId}`,
        {
          token: accessToken,
          method: 'PATCH',
          file: { buffer: imgPng, contentType: 'image/png', filename: 'ci.png', fieldName: 'image' }
        }
      );
      record(
        '3',
        'multipart PATCH /categories/:id (image) → 200 + .webp',
        imgUp.status === 200 &&
          typeof imgUp.body?.data?.imageUrl === 'string' &&
          imgUp.body.data.imageUrl.endsWith('.webp'),
        `status=${imgUp.status}`
      );

      // (e) mutex — file + iconAction=delete same request → 400
      const mutexIcon = await httpMultipart<{ code: string }>(
        `/api/v1/categories/${createdCategoryId}`,
        {
          token: accessToken,
          method: 'PATCH',
          file: { buffer: iconPng, contentType: 'image/png', filename: 'c.png', fieldName: 'icon' },
          fields: { iconAction: 'delete' }
        }
      );
      record(
        '3',
        'mutex: icon file + iconAction=delete → 400',
        mutexIcon.status === 400,
        `status=${mutexIcon.status}`
      );

      // (e) mutex — file + imageAction=delete same request → 400
      const mutexImg = await httpMultipart<{ code: string }>(
        `/api/v1/categories/${createdCategoryId}`,
        {
          token: accessToken,
          method: 'PATCH',
          file: { buffer: imgPng, contentType: 'image/png', filename: 'ci.png', fieldName: 'image' },
          fields: { imageAction: 'delete' }
        }
      );
      record(
        '3',
        'mutex: image file + imageAction=delete → 400',
        mutexImg.status === 400,
        `status=${mutexImg.status}`
      );

      // (f) JSON PATCH {iconAction:'delete', imageAction:'delete'} → 200 + both cleared
      const both = await http<{ data: { iconUrl: string | null; imageUrl: string | null } }>(
        'PATCH',
        `/api/v1/categories/${createdCategoryId}`,
        { token: accessToken, body: { iconAction: 'delete', imageAction: 'delete' } }
      );
      record(
        '3',
        'JSON PATCH {iconAction:delete, imageAction:delete} → 200 + both cleared',
        both.status === 200 &&
          both.body?.data?.iconUrl === null &&
          both.body?.data?.imageUrl === null,
        `status=${both.status}`
      );

      // (g) Old dedicated routes → 404
      for (const [method, sub] of [
        ['POST', 'icon'],
        ['DELETE', 'icon'],
        ['POST', 'image'],
        ['DELETE', 'image']
      ] as const) {
        const r = await http<{ code: string }>(
          method,
          `/api/v1/categories/${createdCategoryId}/${sub}`,
          { token: accessToken, body: method === 'POST' ? {} : undefined }
        );
        record(
          '3',
          `old ${method} /categories/:id/${sub} → 404 (route removed)`,
          r.status === 404,
          `status=${r.status}`
        );
      }
    }

    // ─── 4. Sub-categories — icon + image slots ───────────
    header('4. Sub-categories · icon + image slots');
    {
      if (!createdCategoryId) {
        throw new Error('Sub-category section requires a parent category row');
      }
      const create = await http<{
        data: { id: number; iconUrl: string | null; imageUrl: string | null };
      }>('POST', '/api/v1/sub-categories', {
        token: accessToken,
        body: {
          categoryId: createdCategoryId,
          code: SUB_CATEGORY_CODE,
          displayOrder: 9999,
          isActive: true,
          translation: {
            languageId: anchorLanguageId,
            name: SUB_CATEGORY_TR_NAME,
            description: 'verify-patch-unified anchor translation'
          }
        }
      });
      record(
        '4',
        'POST /sub-categories (anchor row) → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `status=${create.status}`
      );
      createdSubCategoryId = create.body?.data?.id ?? null;
      if (!createdSubCategoryId) throw new Error('Cannot proceed without a sub-category row');

      // (a) JSON PATCH non-empty → 200
      const jsonUpd = await http<{ data: { displayOrder: number } }>(
        'PATCH',
        `/api/v1/sub-categories/${createdSubCategoryId}`,
        { token: accessToken, body: { displayOrder: 8877 } }
      );
      record(
        '4',
        'JSON PATCH /sub-categories/:id {displayOrder} → 200',
        jsonUpd.status === 200 && jsonUpd.body?.data?.displayOrder === 8877,
        `status=${jsonUpd.status}`
      );

      // (b) JSON PATCH empty body → 400
      const jsonEmpty = await http<{ code: string }>(
        'PATCH',
        `/api/v1/sub-categories/${createdSubCategoryId}`,
        { token: accessToken, body: {} }
      );
      record(
        '4',
        'JSON PATCH /sub-categories/:id {} → 400',
        jsonEmpty.status === 400,
        `status=${jsonEmpty.status}`
      );

      // (c) multipart text-only → 200 + coercion
      const mpText = await httpMultipart<{ data: { displayOrder: number; isActive: boolean } }>(
        `/api/v1/sub-categories/${createdSubCategoryId}`,
        {
          token: accessToken,
          method: 'PATCH',
          fields: { displayOrder: 7766, isActive: false }
        }
      );
      record(
        '4',
        'multipart PATCH /sub-categories/:id text-only → 200 + int/bool coercion',
        mpText.status === 200 &&
          mpText.body?.data?.displayOrder === 7766 &&
          mpText.body?.data?.isActive === false,
        `status=${mpText.status} isActive=${mpText.body?.data?.isActive}`
      );

      // Reactivate for cleanup-safety.
      await http('PATCH', `/api/v1/sub-categories/${createdSubCategoryId}`, {
        token: accessToken,
        body: { isActive: true }
      });

      // (d) icon upload → 200 + .webp
      const iconPng = await tinyPng([20, 60, 90, 1]);
      const iconUp = await httpMultipart<{ data: { iconUrl: string | null } }>(
        `/api/v1/sub-categories/${createdSubCategoryId}`,
        {
          token: accessToken,
          method: 'PATCH',
          file: { buffer: iconPng, contentType: 'image/png', filename: 'sc.png', fieldName: 'icon' }
        }
      );
      record(
        '4',
        'multipart PATCH /sub-categories/:id (icon) → 200 + .webp',
        iconUp.status === 200 &&
          typeof iconUp.body?.data?.iconUrl === 'string' &&
          iconUp.body.data.iconUrl.endsWith('.webp'),
        `status=${iconUp.status}`
      );

      // (d) image upload → 200 + .webp
      const imgPng = await tinyPng([200, 120, 40, 1]);
      const imgUp = await httpMultipart<{ data: { imageUrl: string | null } }>(
        `/api/v1/sub-categories/${createdSubCategoryId}`,
        {
          token: accessToken,
          method: 'PATCH',
          file: { buffer: imgPng, contentType: 'image/png', filename: 'scimg.png', fieldName: 'image' }
        }
      );
      record(
        '4',
        'multipart PATCH /sub-categories/:id (image) → 200 + .webp',
        imgUp.status === 200 &&
          typeof imgUp.body?.data?.imageUrl === 'string' &&
          imgUp.body.data.imageUrl.endsWith('.webp'),
        `status=${imgUp.status}`
      );

      // (e) mutex — file + iconAction=delete → 400
      const mutexIcon = await httpMultipart<{ code: string }>(
        `/api/v1/sub-categories/${createdSubCategoryId}`,
        {
          token: accessToken,
          method: 'PATCH',
          file: { buffer: iconPng, contentType: 'image/png', filename: 'sc.png', fieldName: 'icon' },
          fields: { iconAction: 'delete' }
        }
      );
      record(
        '4',
        'mutex: icon file + iconAction=delete → 400',
        mutexIcon.status === 400,
        `status=${mutexIcon.status}`
      );

      // (e) mutex — file + imageAction=delete → 400
      const mutexImg = await httpMultipart<{ code: string }>(
        `/api/v1/sub-categories/${createdSubCategoryId}`,
        {
          token: accessToken,
          method: 'PATCH',
          file: { buffer: imgPng, contentType: 'image/png', filename: 'scimg.png', fieldName: 'image' },
          fields: { imageAction: 'delete' }
        }
      );
      record(
        '4',
        'mutex: image file + imageAction=delete → 400',
        mutexImg.status === 400,
        `status=${mutexImg.status}`
      );

      // (f) JSON PATCH {iconAction:'delete', imageAction:'delete'} → 200 + both null
      const both = await http<{ data: { iconUrl: string | null; imageUrl: string | null } }>(
        'PATCH',
        `/api/v1/sub-categories/${createdSubCategoryId}`,
        { token: accessToken, body: { iconAction: 'delete', imageAction: 'delete' } }
      );
      record(
        '4',
        'JSON PATCH {iconAction:delete, imageAction:delete} → 200 + both cleared',
        both.status === 200 &&
          both.body?.data?.iconUrl === null &&
          both.body?.data?.imageUrl === null,
        `status=${both.status}`
      );

      // (g) Old dedicated routes → 404
      for (const [method, sub] of [
        ['POST', 'icon'],
        ['DELETE', 'icon'],
        ['POST', 'image'],
        ['DELETE', 'image']
      ] as const) {
        const r = await http<{ code: string }>(
          method,
          `/api/v1/sub-categories/${createdSubCategoryId}/${sub}`,
          { token: accessToken, body: method === 'POST' ? {} : undefined }
        );
        record(
          '4',
          `old ${method} /sub-categories/:id/${sub} → 404 (route removed)`,
          r.status === 404,
          `status=${r.status}`
        );
      }
    }

    // ─── 5. Cleanup ───────────────────────────────────────
    header('5. Cleanup');
    {
      if (createdSubCategoryId) await hardDeleteSubCategory(createdSubCategoryId);
      if (createdCategoryId) await hardDeleteCategory(createdCategoryId);
      if (createdSpecializationId) await hardDeleteSpecialization(createdSpecializationId);
      if (createdCountryId) await hardDeleteCountry(createdCountryId);
      if (createdUserId) await softDeleteUser(createdUserId);
      record('5', 'hard-deleted test rows + soft-deleted harness user', true, '');
    }
  } finally {
    server.close();
    await closePool();
    await closeRedis();
  }

  // ─── Summary ──────────────────────────────────────────
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  const failed = total - passed;
  console.log(
    `\n━━ Summary ━━  \x1b[32m${passed} passed\x1b[0m, ${
      failed ? `\x1b[31m${failed} failed\x1b[0m` : '0 failed'
    }, ${total} total`
  );
  if (failed > 0) {
    console.log('\nFailed checks:');
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  [${r.section}] ${r.name} — ${r.detail}`);
    }
    process.exit(1);
  }
};

main().catch((err: unknown) => {
  console.error('\n\x1b[31mverify-patch-unified.ts crashed:\x1b[0m', err);
  process.exit(1);
});
