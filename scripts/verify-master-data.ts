/* eslint-disable no-console */
/**
 * Phase 2 — Master data CRUD (live, end-to-end).
 *
 * Builds the real Express app and hits every phase-2 master-data
 * router over a live ephemeral port, against the real Supabase
 * database and Upstash Redis. Nothing is mocked.
 *
 * Sections:
 *    0. Setup            — register harness user, verify, elevate to
 *                          super_admin (level 0) so the JWT carries every
 *                          permission code, then login via /auth/login.
 *    1. Auth             — anon hits to each protected route return 401.
 *    2. States           — full CRUD lifecycle, joined country payload,
 *                          country-layer filters, validation, dup guards.
 *    3. Cities           — full CRUD lifecycle, joined state+country
 *                          payload, drill-down from country → city.
 *    4. Skills           — CRUD lifecycle, category enum, duplicate name.
 *    5. Languages        — CRUD lifecycle, iso_code normalisation, dup.
 *    6. Education levels — CRUD lifecycle, ordered ladder, level_order dup.
 *    7. Document types   — CRUD lifecycle, duplicate name guard.
 *    8. Documents        — CRUD lifecycle, nested document_type block,
 *                          parent filter, duplicate (type, name) guard.
 *    9. Designations     — CRUD lifecycle, level_band whitelist, dup code.
 *   10. Specializations  — CRUD lifecycle, category whitelist, icon upload
 *                          (happy path + multer oversize rejection +
 *                          DELETE /:id/icon).
 *   12. Learning goals   — CRUD + icon upload (happy / replace / oversize / delete).
 *   13. Social medias    — CRUD + platform_type whitelist + icon upload flow.
 *   14. Categories       — CRUD + combined parent+translation insert + icon
 *                          upload + image upload + translation sub-resource.
 *   15. Sub-categories   — CRUD with parent filter + reparenting + icon + image +
 *                          translation sub-resource. Requires the category
 *                          created in section 14 as parent anchor.
 *   11. Cleanup          — hard-delete all test rows + the harness user.
 *
 * Every test row is namespaced with a `verify_<RUN_ID>_` prefix so
 * collisions with other runs or seed data are impossible.
 */

// ─── Test harness env flags (must be set BEFORE any src/ import) ───
// Flip the rate-limit bypass flag so the script can fire 150+ requests
// against the live Express app without tripping the global limiter.
// config/rate-limit.ts honors SKIP_GLOBAL_RATE_LIMIT=1 via a per-request
// `skip` function, so flipping this here is sufficient.
process.env.SKIP_GLOBAL_RATE_LIMIT = '1';

import { Buffer } from 'node:buffer';
import type { AddressInfo } from 'node:net';

import sharp from 'sharp';

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
// Test fixtures
// ─────────────────────────────────────────────────────────────

const RUN_ID = `${process.pid}-${Date.now()}`;
const SLUG = RUN_ID.replace(/-/g, '_');
const TEST_EMAIL = `verify-md+${RUN_ID}@test.growupmore.local`;
const TEST_PASSWORD = 'VerifyPass123';
const TEST_FIRST = 'VerifyMD';
const TEST_LAST = `Run${process.pid}`;

const STATE_NAME = `VerifyState_${SLUG}`.slice(0, 120);
const STATE_ISO3 = 'ZZ9'; // 3-char, won't clash with real ISO
const CITY_NAME = `VerifyCity_${SLUG}`.slice(0, 120);
const SKILL_NAME = `VerifySkill_${SLUG}`.slice(0, 120);
const LANGUAGE_NAME = `VerifyLang_${SLUG}`.slice(0, 120);
// unique-ish 3-char: z + two lowercase letters derived from pid (letters only — regex is /^[A-Za-z-]+$/)
const LANGUAGE_ISO_CODE = (() => {
  const a = String.fromCharCode(97 + (process.pid % 26));
  const b = String.fromCharCode(97 + (Math.floor(process.pid / 26) % 26));
  return `z${a}${b}`;
})();
const EDUCATION_NAME = `VerifyEdu_${SLUG}`.slice(0, 120);
const EDUCATION_LEVEL_ORDER = 9000 + (process.pid % 1000); // out of the real-data range

const DOCUMENT_TYPE_NAME = `VerifyDocType_${SLUG}`.slice(0, 120);
const DOCUMENT_NAME = `VerifyDocument_${SLUG}`.slice(0, 120);
const DESIGNATION_NAME = `VerifyDesignation_${SLUG}`.slice(0, 120);
// code has a 32-char cap, so we keep it short + unique
const DESIGNATION_CODE = `vdz_${(process.pid % 100000).toString(36)}`.slice(0, 32);
const SPECIALIZATION_NAME = `VerifySpec_${SLUG}`.slice(0, 120);

// ── Phase-02 batch-3 fixtures (learning-goals, social-medias, categories, sub-categories) ──
const LEARNING_GOAL_NAME = `VerifyLG_${SLUG}`.slice(0, 100);
const SOCIAL_MEDIA_NAME = `VerifySM_${SLUG}`.slice(0, 100);
const SOCIAL_MEDIA_CODE = `vsm_${(process.pid % 100000).toString(36)}`.slice(0, 50);
// categories/sub-categories use CITEXT code + CITEXT slug. We keep the code
// short and unique per-run so the uq_categories_code constraint cannot clash.
const CATEGORY_CODE = `VCAT-${(process.pid % 100000).toString(36).toUpperCase()}`.slice(0, 80);
const SUB_CATEGORY_CODE = `VSCAT-${(process.pid % 100000).toString(36).toUpperCase()}`.slice(0, 80);
const CATEGORY_TRANSLATION_NAME = `Verify Category ${SLUG}`.slice(0, 200);
const SUB_CATEGORY_TRANSLATION_NAME = `Verify Sub-Category ${SLUG}`.slice(0, 200);

let createdUserId: number | null = null;
let accessToken = '';
let firstJti = '';

// Anchors / ids created during the run — kept for cleanup
let anchorCountryId: number | null = null;
let anchorLanguageId: number | null = null;
let createdStateId: number | null = null;
let createdCityId: number | null = null;
let createdSkillId: number | null = null;
let createdLanguageId: number | null = null;
let createdEducationLevelId: number | null = null;
let createdDocumentTypeId: number | null = null;
let createdDocumentId: number | null = null;
let createdDesignationId: number | null = null;
let createdSpecializationId: number | null = null;
// Batch-3 ids
let createdLearningGoalId: number | null = null;
let createdSocialMediaId: number | null = null;
let createdCategoryId: number | null = null;
let createdCategoryTranslationId: number | null = null;
let createdSubCategoryId: number | null = null;
let createdSubCategoryTranslationId: number | null = null;

// ─────────────────────────────────────────────────────────────
// HTTP helper
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
 * Multipart helper — builds a FormData with a single `file` field and
 * POSTs it. We don't set content-type manually; fetch + FormData pick the
 * correct multipart boundary automatically.
 */
const mkMultipart = (baseUrl: string) => {
  return async <T = unknown>(
    path: string,
    options: {
      buffer: Buffer;
      contentType: string;
      filename: string;
      token?: string;
    }
  ): Promise<HttpResult<T>> => {
    const form = new FormData();
    form.append(
      'file',
      new Blob([options.buffer], { type: options.contentType }),
      options.filename
    );
    const headers: Record<string, string> = {};
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
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
// DB setup / cleanup helpers (best-effort, swallow errors)
// ─────────────────────────────────────────────────────────────

const elevateToSuperAdmin = async (userId: number): Promise<void> => {
  const pool = getPool();
  await pool.query(
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

/** Pick any active, non-deleted country to use as the anchor for
 *  state + city creation. We do not create a country here so the
 *  verify script can run even on a strictly-audited DB. */
const findAnchorCountry = async (): Promise<{ id: number; name: string } | null> => {
  const { rows } = await getPool().query<{ id: string | number; name: string }>(
    `SELECT id, name FROM countries
      WHERE is_deleted = FALSE AND is_active = TRUE
      ORDER BY id ASC
      LIMIT 1`
  );
  const row = rows[0];
  if (!row) return null;
  // pg returns BIGINT as a string — coerce so strict === comparisons match the API's Number() output.
  return { id: Number(row.id), name: row.name };
};

/** Pick any active, non-deleted seed language for use in translation
 *  creation during sections 14/15. We do NOT depend on `createdLanguageId`
 *  from section 5 because that row gets soft-deleted / restored mid-run. */
const findAnchorLanguage = async (): Promise<{ id: number; name: string } | null> => {
  const { rows } = await getPool().query<{ id: string | number; name: string }>(
    `SELECT id, name FROM languages
      WHERE is_deleted = FALSE AND is_active = TRUE
      ORDER BY id ASC
      LIMIT 1`
  );
  const row = rows[0];
  if (!row) return null;
  return { id: Number(row.id), name: row.name };
};

const hardDeleteCity = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM cities WHERE id = $1', [id]);
};
const hardDeleteState = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM states WHERE id = $1', [id]);
};
const hardDeleteSkill = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM skills WHERE id = $1', [id]);
};
const hardDeleteLanguage = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM languages WHERE id = $1', [id]);
};
const hardDeleteEducationLevel = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM education_levels WHERE id = $1', [id]);
};
const hardDeleteDocument = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM documents WHERE id = $1', [id]);
};
const hardDeleteDocumentType = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM document_types WHERE id = $1', [id]);
};
const hardDeleteDesignation = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM designations WHERE id = $1', [id]);
};
const hardDeleteSpecialization = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM specializations WHERE id = $1', [id]);
};
const hardDeleteLearningGoal = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM learning_goals WHERE id = $1', [id]);
};
const hardDeleteSocialMedia = async (id: number): Promise<void> => {
  await getPool().query('DELETE FROM social_medias WHERE id = $1', [id]);
};
// Translation rows have ON DELETE RESTRICT, so we must purge them before
// deleting the parent category / sub_category row.
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
// Main
// ─────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  console.log('━━ Phase 2 · Master data CRUD (live) ━━');
  console.log(`  test email            : ${TEST_EMAIL}`);
  console.log(`  test state name       : ${STATE_NAME}`);
  console.log(`  test city name        : ${CITY_NAME}`);
  console.log(`  test skill name       : ${SKILL_NAME}`);
  console.log(`  test language         : ${LANGUAGE_NAME} (${LANGUAGE_ISO_CODE})`);
  console.log(`  test education level  : ${EDUCATION_NAME} (order ${EDUCATION_LEVEL_ORDER})`);

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
        success: boolean;
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

      // Bypass dual-channel verification gate
      await getPool().query('SELECT udf_auth_verify_email($1)', [uid]);
      await getPool().query('SELECT udf_auth_verify_mobile($1)', [uid]);
      await elevateToSuperAdmin(uid);
      record('0', 'elevated harness user to super_admin (level 0)', true, `uid=${uid}`);

      const login = await http<{
        data?: {
          accessToken: string;
          user: { id: number; permissions: string[] };
        };
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
      const perms = login.body?.data?.user?.permissions ?? [];
      const hasAllPhase2 = [
        'state.read',
        'state.create',
        'state.update',
        'state.delete',
        'state.restore',
        'city.read',
        'city.create',
        'city.update',
        'city.delete',
        'city.restore',
        'skill.read',
        'skill.create',
        'skill.update',
        'skill.delete',
        'skill.restore',
        'language.read',
        'language.create',
        'language.update',
        'language.delete',
        'language.restore',
        'education_level.read',
        'education_level.create',
        'education_level.update',
        'education_level.delete',
        'education_level.restore',
        // batch-2: document-types, documents, designations, specializations
        'document_type.read',
        'document_type.create',
        'document_type.update',
        'document_type.delete',
        'document_type.restore',
        'document.read',
        'document.create',
        'document.update',
        'document.delete',
        'document.restore',
        'designation.read',
        'designation.create',
        'designation.update',
        'designation.delete',
        'designation.restore',
        'specialization.read',
        'specialization.create',
        'specialization.update',
        'specialization.delete',
        'specialization.restore',
        // batch-3: learning-goals, social-medias, categories, sub-categories
        'learning_goal.read',
        'learning_goal.create',
        'learning_goal.update',
        'learning_goal.delete',
        'learning_goal.restore',
        'social_media.read',
        'social_media.create',
        'social_media.update',
        'social_media.delete',
        'social_media.restore',
        'category.read',
        'category.create',
        'category.update',
        'category.delete',
        'category.restore',
        'sub_category.read',
        'sub_category.create',
        'sub_category.update',
        'sub_category.delete',
        'sub_category.restore'
      ].every((p) => perms.includes(p));
      record(
        '0',
        'JWT carries every phase-02 permission (65 codes)',
        hasAllPhase2,
        `perms=${perms.length}`
      );
      const payload = verifyAccessToken(accessToken);
      firstJti = payload.jti ?? '';

      // Pick anchor country for /states + /cities
      const anchor = await findAnchorCountry();
      record(
        '0',
        'anchor country available for state/city creation',
        !!anchor,
        anchor ? `id=${anchor.id} name=${anchor.name}` : 'none found'
      );
      if (!anchor) throw new Error('No anchor country available');
      anchorCountryId = anchor.id;

      // Pick anchor language for /categories + /sub-categories translation tests
      const anchorLang = await findAnchorLanguage();
      record(
        '0',
        'anchor language available for translation creation',
        !!anchorLang,
        anchorLang ? `id=${anchorLang.id} name=${anchorLang.name}` : 'none found'
      );
      if (!anchorLang) throw new Error('No anchor language available');
      anchorLanguageId = anchorLang.id;
    }

    // ─── 1. Auth — anon access blocked ───────────────────
    header('1. Auth — anonymous access blocked on every phase-2 route');
    {
      for (const path of [
        '/api/v1/states',
        '/api/v1/cities',
        '/api/v1/skills',
        '/api/v1/languages',
        '/api/v1/education-levels',
        '/api/v1/document-types',
        '/api/v1/documents',
        '/api/v1/designations',
        '/api/v1/specializations',
        '/api/v1/learning-goals',
        '/api/v1/social-medias',
        '/api/v1/categories',
        '/api/v1/sub-categories'
      ]) {
        const r = await http<{ code: string }>('GET', path);
        record('1', `GET ${path} (no token) → 401`, r.status === 401, `got ${r.status}`);
      }
    }

    // ─── 2. States CRUD ──────────────────────────────────
    header('2. States CRUD');
    {
      // 2a. List
      const list = await http<{
        data: Array<{ id: number; name: string; country: { id: number } }>;
        meta: { totalCount: number };
      }>('GET', '/api/v1/states?pageSize=5', { token: accessToken });
      record('2', 'GET /states → 200', list.status === 200, `got ${list.status}`);
      record(
        '2',
        'list row carries nested country block',
        Array.isArray(list.body?.data) &&
          (list.body.data.length === 0 ||
            typeof list.body.data[0]?.country?.id === 'number'),
        `rows=${list.body?.data?.length ?? 0}`
      );

      // 2b. Create
      const create = await http<{
        data: {
          id: number;
          name: string;
          iso3: string;
          country: { id: number };
        };
      }>('POST', '/api/v1/states', {
        token: accessToken,
        body: {
          countryId: anchorCountryId,
          name: STATE_NAME,
          iso3: STATE_ISO3,
          languages: ['English'],
          isActive: true
        }
      });
      record(
        '2',
        'POST /states → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `got ${create.status}`
      );
      createdStateId = create.body?.data?.id ?? null;
      record(
        '2',
        'created state owned by anchor country',
        create.body?.data?.country?.id === anchorCountryId,
        `countryId=${create.body?.data?.country?.id}`
      );

      // 2c. Get by id
      if (createdStateId) {
        const one = await http<{ data: { id: number; name: string } }>(
          'GET',
          `/api/v1/states/${createdStateId}`,
          { token: accessToken }
        );
        record(
          '2',
          'GET /states/:id → 200',
          one.status === 200 && one.body?.data?.id === createdStateId,
          `got ${one.status}`
        );
      }

      // 2d. Filter by countryId returns the new row
      const filtered = await http<{
        data: Array<{ id: number }>;
      }>(
        'GET',
        `/api/v1/states?countryId=${anchorCountryId}&searchTerm=${encodeURIComponent(
          STATE_NAME
        )}&pageSize=5`,
        { token: accessToken }
      );
      record(
        '2',
        'filter by countryId + searchTerm hits the test row',
        filtered.status === 200 &&
          !!filtered.body?.data?.some((r) => r.id === createdStateId),
        `found=${filtered.body?.data?.length ?? 0}`
      );

      // 2e. Empty PATCH → 400
      const empty = await http<{ code: string }>(
        'PATCH',
        `/api/v1/states/${createdStateId}`,
        { token: accessToken, body: {} }
      );
      record('2', 'PATCH /states/:id with empty body → 400', empty.status === 400, `got ${empty.status}`);

      // 2f. Real PATCH
      const upd = await http<{ data: { name: string; languages: string[] } }>(
        'PATCH',
        `/api/v1/states/${createdStateId}`,
        {
          token: accessToken,
          body: { languages: ['English', 'French'] }
        }
      );
      record(
        '2',
        'PATCH /states/:id updates languages',
        upd.status === 200 &&
          Array.isArray(upd.body?.data?.languages) &&
          upd.body.data.languages.includes('French'),
        `got ${upd.status}`
      );

      // 2g. Delete → Restore round trip
      const del = await http<{ data: { deleted: boolean } }>(
        'DELETE',
        `/api/v1/states/${createdStateId}`,
        { token: accessToken }
      );
      record(
        '2',
        'DELETE /states/:id soft-deletes',
        del.status === 200 && del.body?.data?.deleted === true,
        `got ${del.status}`
      );

      const restore = await http<{ data: { id: number; isDeleted: boolean } }>(
        'POST',
        `/api/v1/states/${createdStateId}/restore`,
        { token: accessToken }
      );
      record(
        '2',
        'POST /states/:id/restore brings it back',
        restore.status === 200 && restore.body?.data?.isDeleted === false,
        `got ${restore.status}`
      );

      // 2h. Duplicate (countryId, name)
      const dup = await http<{ code: string }>('POST', '/api/v1/states', {
        token: accessToken,
        body: {
          countryId: anchorCountryId,
          name: STATE_NAME,
          iso3: STATE_ISO3,
          isActive: true
        }
      });
      record(
        '2',
        'duplicate (countryId, name) → 4xx',
        dup.status >= 400 && dup.status < 500,
        `got ${dup.status}`
      );
    }

    // ─── 3. Cities CRUD ─────────────────────────────────
    header('3. Cities CRUD');
    {
      const list = await http<{
        data: Array<{
          id: number;
          name: string;
          state: { id: number };
          country: { id: number };
        }>;
      }>('GET', '/api/v1/cities?pageSize=5', { token: accessToken });
      record('3', 'GET /cities → 200', list.status === 200, `got ${list.status}`);
      record(
        '3',
        'list row carries nested state + country',
        Array.isArray(list.body?.data) &&
          (list.body.data.length === 0 ||
            (typeof list.body.data[0]?.state?.id === 'number' &&
              typeof list.body.data[0]?.country?.id === 'number')),
        `rows=${list.body?.data?.length ?? 0}`
      );

      if (createdStateId) {
        const create = await http<{
          data: {
            id: number;
            state: { id: number };
            country: { id: number };
          };
        }>('POST', '/api/v1/cities', {
          token: accessToken,
          body: {
            stateId: createdStateId,
            name: CITY_NAME,
            phoneCode: '099',
            timezone: 'Asia/Kolkata',
            isActive: true
          }
        });
        record(
          '3',
          'POST /cities → 201',
          create.status === 201 && typeof create.body?.data?.id === 'number',
          `got ${create.status}`
        );
        createdCityId = create.body?.data?.id ?? null;
        record(
          '3',
          'created city carries nested state + country',
          create.body?.data?.state?.id === createdStateId &&
            create.body?.data?.country?.id === anchorCountryId,
          `state=${create.body?.data?.state?.id} country=${create.body?.data?.country?.id}`
        );

        if (createdCityId) {
          const one = await http<{ data: { id: number } }>(
            'GET',
            `/api/v1/cities/${createdCityId}`,
            { token: accessToken }
          );
          record(
            '3',
            'GET /cities/:id → 200',
            one.status === 200 && one.body?.data?.id === createdCityId,
            `got ${one.status}`
          );

          // Drill-down from country
          const byCountry = await http<{ data: Array<{ id: number }> }>(
            'GET',
            `/api/v1/cities?countryId=${anchorCountryId}&searchTerm=${encodeURIComponent(
              CITY_NAME
            )}&pageSize=5`,
            { token: accessToken }
          );
          record(
            '3',
            'drill-down by countryId finds the test city',
            byCountry.status === 200 &&
              !!byCountry.body?.data?.some((r) => r.id === createdCityId),
            `found=${byCountry.body?.data?.length ?? 0}`
          );

          // Empty PATCH
          const emptyPatch = await http<{ code: string }>(
            'PATCH',
            `/api/v1/cities/${createdCityId}`,
            { token: accessToken, body: {} }
          );
          record(
            '3',
            'PATCH /cities/:id with empty body → 400',
            emptyPatch.status === 400,
            `got ${emptyPatch.status}`
          );

          // Real PATCH
          const upd = await http<{ data: { phoneCode: string } }>(
            'PATCH',
            `/api/v1/cities/${createdCityId}`,
            { token: accessToken, body: { phoneCode: '100' } }
          );
          record(
            '3',
            'PATCH /cities/:id updates phoneCode',
            upd.status === 200 && upd.body?.data?.phoneCode === '100',
            `got ${upd.status}`
          );

          // Delete → Restore
          const del = await http<{ data: { deleted: boolean } }>(
            'DELETE',
            `/api/v1/cities/${createdCityId}`,
            { token: accessToken }
          );
          record(
            '3',
            'DELETE /cities/:id → 200',
            del.status === 200 && del.body?.data?.deleted === true,
            `got ${del.status}`
          );

          const restore = await http<{ data: { isDeleted: boolean } }>(
            'POST',
            `/api/v1/cities/${createdCityId}/restore`,
            { token: accessToken }
          );
          record(
            '3',
            'POST /cities/:id/restore brings it back',
            restore.status === 200 && restore.body?.data?.isDeleted === false,
            `got ${restore.status}`
          );
        }
      }
    }

    // ─── 4. Skills CRUD ─────────────────────────────────
    header('4. Skills CRUD');
    {
      const list = await http<{ data: Array<{ id: number }> }>(
        'GET',
        '/api/v1/skills?pageSize=5',
        { token: accessToken }
      );
      record('4', 'GET /skills → 200', list.status === 200, `got ${list.status}`);

      const create = await http<{ data: { id: number; name: string; category: string } }>(
        'POST',
        '/api/v1/skills',
        {
          token: accessToken,
          body: {
            name: SKILL_NAME,
            category: 'technical',
            description: 'e2e verify row',
            isActive: true
          }
        }
      );
      record(
        '4',
        'POST /skills → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `got ${create.status}`
      );
      createdSkillId = create.body?.data?.id ?? null;
      record(
        '4',
        'created skill has category=technical',
        create.body?.data?.category === 'technical',
        `category=${create.body?.data?.category}`
      );

      // Bad category → 400
      const badCat = await http<{ code: string }>('POST', '/api/v1/skills', {
        token: accessToken,
        body: { name: `${SKILL_NAME}_bad`, category: 'not_a_real_category' }
      });
      record('4', 'bad category → 400', badCat.status === 400, `got ${badCat.status}`);

      if (createdSkillId) {
        // Filter by category
        const byCat = await http<{
          data: Array<{ id: number; category: string }>;
        }>(
          'GET',
          `/api/v1/skills?category=technical&searchTerm=${encodeURIComponent(SKILL_NAME)}`,
          { token: accessToken }
        );
        record(
          '4',
          'filter by category=technical hits the test row',
          byCat.status === 200 &&
            !!byCat.body?.data?.some(
              (r) => r.id === createdSkillId && r.category === 'technical'
            ),
          `found=${byCat.body?.data?.length ?? 0}`
        );

        // PATCH
        const upd = await http<{ data: { description: string } }>(
          'PATCH',
          `/api/v1/skills/${createdSkillId}`,
          { token: accessToken, body: { description: 'updated' } }
        );
        record(
          '4',
          'PATCH /skills/:id updates description',
          upd.status === 200 && upd.body?.data?.description === 'updated',
          `got ${upd.status}`
        );

        // Duplicate name
        const dup = await http<{ code: string }>('POST', '/api/v1/skills', {
          token: accessToken,
          body: { name: SKILL_NAME, category: 'technical' }
        });
        record(
          '4',
          'duplicate skill name → 4xx',
          dup.status >= 400 && dup.status < 500,
          `got ${dup.status}`
        );

        // Soft delete → restore
        const del = await http<{ data: { deleted: boolean } }>(
          'DELETE',
          `/api/v1/skills/${createdSkillId}`,
          { token: accessToken }
        );
        record(
          '4',
          'DELETE /skills/:id → 200',
          del.status === 200 && del.body?.data?.deleted === true,
          `got ${del.status}`
        );
        const restore = await http<{ data: { isDeleted: boolean } }>(
          'POST',
          `/api/v1/skills/${createdSkillId}/restore`,
          { token: accessToken }
        );
        record(
          '4',
          'POST /skills/:id/restore brings it back',
          restore.status === 200 && restore.body?.data?.isDeleted === false,
          `got ${restore.status}`
        );
      }
    }

    // ─── 5. Languages CRUD ──────────────────────────────
    header('5. Languages CRUD');
    {
      const list = await http<{ data: Array<{ id: number; isoCode: string | null }> }>(
        'GET',
        '/api/v1/languages?pageSize=5',
        { token: accessToken }
      );
      record('5', 'GET /languages → 200', list.status === 200, `got ${list.status}`);

      const create = await http<{
        data: { id: number; name: string; isoCode: string | null };
      }>('POST', '/api/v1/languages', {
        token: accessToken,
        body: {
          name: LANGUAGE_NAME,
          nativeName: LANGUAGE_NAME,
          isoCode: LANGUAGE_ISO_CODE.toUpperCase(), // deliberately upper-case to test normalisation
          script: 'Latin',
          isActive: true
        }
      });
      record(
        '5',
        'POST /languages → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `got ${create.status}`
      );
      createdLanguageId = create.body?.data?.id ?? null;
      record(
        '5',
        'iso_code normalised to lowercase on insert',
        create.body?.data?.isoCode === LANGUAGE_ISO_CODE.toLowerCase(),
        `isoCode=${create.body?.data?.isoCode}`
      );

      if (createdLanguageId) {
        // Lookup by isoCode
        const byIso = await http<{
          data: Array<{ id: number; isoCode: string | null }>;
        }>('GET', `/api/v1/languages?isoCode=${LANGUAGE_ISO_CODE}&pageSize=5`, {
          token: accessToken
        });
        record(
          '5',
          'filter by isoCode hits the test row',
          byIso.status === 200 &&
            !!byIso.body?.data?.some((r) => r.id === createdLanguageId),
          `found=${byIso.body?.data?.length ?? 0}`
        );

        // PATCH
        const upd = await http<{ data: { script: string | null } }>(
          'PATCH',
          `/api/v1/languages/${createdLanguageId}`,
          { token: accessToken, body: { script: 'Cyrillic' } }
        );
        record(
          '5',
          'PATCH /languages/:id updates script',
          upd.status === 200 && upd.body?.data?.script === 'Cyrillic',
          `got ${upd.status}`
        );

        // Duplicate isoCode
        const dup = await http<{ code: string }>('POST', '/api/v1/languages', {
          token: accessToken,
          body: { name: `${LANGUAGE_NAME}_dup`, isoCode: LANGUAGE_ISO_CODE }
        });
        record(
          '5',
          'duplicate isoCode → 4xx',
          dup.status >= 400 && dup.status < 500,
          `got ${dup.status}`
        );

        // Soft delete → restore
        const del = await http<{ data: { deleted: boolean } }>(
          'DELETE',
          `/api/v1/languages/${createdLanguageId}`,
          { token: accessToken }
        );
        record(
          '5',
          'DELETE /languages/:id → 200',
          del.status === 200 && del.body?.data?.deleted === true,
          `got ${del.status}`
        );
        const restore = await http<{ data: { isDeleted: boolean } }>(
          'POST',
          `/api/v1/languages/${createdLanguageId}/restore`,
          { token: accessToken }
        );
        record(
          '5',
          'POST /languages/:id/restore brings it back',
          restore.status === 200 && restore.body?.data?.isDeleted === false,
          `got ${restore.status}`
        );
      }
    }

    // ─── 6. Education levels CRUD ───────────────────────
    header('6. Education levels CRUD');
    {
      const list = await http<{
        data: Array<{ id: number; levelOrder: number }>;
      }>('GET', '/api/v1/education-levels?pageSize=5', { token: accessToken });
      record('6', 'GET /education-levels → 200', list.status === 200, `got ${list.status}`);
      record(
        '6',
        'list is ordered by level_order (default sort)',
        Array.isArray(list.body?.data) &&
          (list.body.data.length < 2 ||
            list.body.data.every(
              (r, i, arr) => i === 0 || arr[i - 1].levelOrder <= r.levelOrder
            )),
        `rows=${list.body?.data?.length ?? 0}`
      );

      const create = await http<{
        data: { id: number; name: string; levelOrder: number; levelCategory: string };
      }>('POST', '/api/v1/education-levels', {
        token: accessToken,
        body: {
          name: EDUCATION_NAME,
          levelOrder: EDUCATION_LEVEL_ORDER,
          levelCategory: 'other',
          description: 'e2e verify row',
          isActive: true
        }
      });
      record(
        '6',
        'POST /education-levels → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `got ${create.status}`
      );
      createdEducationLevelId = create.body?.data?.id ?? null;
      record(
        '6',
        'created row has correct levelOrder + category',
        create.body?.data?.levelOrder === EDUCATION_LEVEL_ORDER &&
          create.body?.data?.levelCategory === 'other',
        `order=${create.body?.data?.levelOrder}`
      );

      // Missing levelOrder → 400 (NOT NULL requirement surfaces through schema)
      const noOrder = await http<{ code: string }>('POST', '/api/v1/education-levels', {
        token: accessToken,
        body: { name: `${EDUCATION_NAME}_bad`, levelCategory: 'other' }
      });
      record(
        '6',
        'missing levelOrder → 400',
        noOrder.status === 400,
        `got ${noOrder.status}`
      );

      if (createdEducationLevelId) {
        // Filter by category
        const byCat = await http<{
          data: Array<{ id: number; levelCategory: string }>;
        }>(
          'GET',
          `/api/v1/education-levels?category=other&searchTerm=${encodeURIComponent(
            EDUCATION_NAME
          )}`,
          { token: accessToken }
        );
        record(
          '6',
          'filter by category=other hits the test row',
          byCat.status === 200 &&
            !!byCat.body?.data?.some((r) => r.id === createdEducationLevelId),
          `found=${byCat.body?.data?.length ?? 0}`
        );

        // PATCH
        const upd = await http<{ data: { typicalDuration: string | null } }>(
          'PATCH',
          `/api/v1/education-levels/${createdEducationLevelId}`,
          { token: accessToken, body: { typicalDuration: '1 year' } }
        );
        record(
          '6',
          'PATCH /education-levels/:id updates typicalDuration',
          upd.status === 200 && upd.body?.data?.typicalDuration === '1 year',
          `got ${upd.status}`
        );

        // Soft delete → restore
        const del = await http<{ data: { deleted: boolean } }>(
          'DELETE',
          `/api/v1/education-levels/${createdEducationLevelId}`,
          { token: accessToken }
        );
        record(
          '6',
          'DELETE /education-levels/:id → 200',
          del.status === 200 && del.body?.data?.deleted === true,
          `got ${del.status}`
        );
        const restore = await http<{ data: { isDeleted: boolean } }>(
          'POST',
          `/api/v1/education-levels/${createdEducationLevelId}/restore`,
          { token: accessToken }
        );
        record(
          '6',
          'POST /education-levels/:id/restore brings it back',
          restore.status === 200 && restore.body?.data?.isDeleted === false,
          `got ${restore.status}`
        );
      }
    }

    // ─── 7. Document types CRUD ─────────────────────────
    header('7. Document types CRUD');
    {
      const list = await http<{ data: Array<{ id: number; name: string }> }>(
        'GET',
        '/api/v1/document-types?pageSize=5',
        { token: accessToken }
      );
      record(
        '7',
        'GET /document-types → 200',
        list.status === 200 && Array.isArray(list.body?.data),
        `got ${list.status}`
      );

      const create = await http<{ data: { id: number; name: string } }>(
        'POST',
        '/api/v1/document-types',
        {
          token: accessToken,
          body: {
            name: DOCUMENT_TYPE_NAME,
            description: 'e2e verify row',
            isActive: true
          }
        }
      );
      record(
        '7',
        'POST /document-types → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `got ${create.status}`
      );
      createdDocumentTypeId = create.body?.data?.id ?? null;

      // Duplicate name guard
      const dup = await http<{ code: string }>('POST', '/api/v1/document-types', {
        token: accessToken,
        body: { name: DOCUMENT_TYPE_NAME }
      });
      record(
        '7',
        'duplicate document_type name → 4xx',
        dup.status >= 400 && dup.status < 500,
        `got ${dup.status}`
      );

      if (createdDocumentTypeId) {
        const one = await http<{ data: { id: number } }>(
          'GET',
          `/api/v1/document-types/${createdDocumentTypeId}`,
          { token: accessToken }
        );
        record(
          '7',
          'GET /document-types/:id → 200',
          one.status === 200 && one.body?.data?.id === createdDocumentTypeId,
          `got ${one.status}`
        );

        const emptyPatch = await http<{ code: string }>(
          'PATCH',
          `/api/v1/document-types/${createdDocumentTypeId}`,
          { token: accessToken, body: {} }
        );
        record(
          '7',
          'PATCH /document-types/:id with empty body → 400',
          emptyPatch.status === 400,
          `got ${emptyPatch.status}`
        );

        const upd = await http<{ data: { description: string | null } }>(
          'PATCH',
          `/api/v1/document-types/${createdDocumentTypeId}`,
          { token: accessToken, body: { description: 'updated' } }
        );
        record(
          '7',
          'PATCH /document-types/:id updates description',
          upd.status === 200 && upd.body?.data?.description === 'updated',
          `got ${upd.status}`
        );

        const del = await http<{ data: { deleted: boolean } }>(
          'DELETE',
          `/api/v1/document-types/${createdDocumentTypeId}`,
          { token: accessToken }
        );
        record(
          '7',
          'DELETE /document-types/:id → 200',
          del.status === 200 && del.body?.data?.deleted === true,
          `got ${del.status}`
        );
        const restore = await http<{ data: { isDeleted: boolean } }>(
          'POST',
          `/api/v1/document-types/${createdDocumentTypeId}/restore`,
          { token: accessToken }
        );
        record(
          '7',
          'POST /document-types/:id/restore brings it back',
          restore.status === 200 && restore.body?.data?.isDeleted === false,
          `got ${restore.status}`
        );
      }
    }

    // ─── 8. Documents CRUD (FK → document_type) ─────────
    header('8. Documents CRUD');
    {
      const list = await http<{
        data: Array<{
          id: number;
          documentType: { id: number; name: string };
        }>;
      }>('GET', '/api/v1/documents?pageSize=5', { token: accessToken });
      record('8', 'GET /documents → 200', list.status === 200, `got ${list.status}`);
      record(
        '8',
        'list row carries nested documentType block',
        Array.isArray(list.body?.data) &&
          (list.body.data.length === 0 ||
            typeof list.body.data[0]?.documentType?.id === 'number'),
        `rows=${list.body?.data?.length ?? 0}`
      );

      if (createdDocumentTypeId) {
        const create = await http<{
          data: {
            id: number;
            documentTypeId: number;
            documentType: { id: number };
          };
        }>('POST', '/api/v1/documents', {
          token: accessToken,
          body: {
            documentTypeId: createdDocumentTypeId,
            name: DOCUMENT_NAME,
            description: 'e2e verify row',
            isActive: true
          }
        });
        record(
          '8',
          'POST /documents → 201',
          create.status === 201 && typeof create.body?.data?.id === 'number',
          `got ${create.status}`
        );
        createdDocumentId = create.body?.data?.id ?? null;
        record(
          '8',
          'created document points at the parent document_type',
          create.body?.data?.documentType?.id === createdDocumentTypeId,
          `documentType.id=${create.body?.data?.documentType?.id}`
        );

        if (createdDocumentId) {
          const byParent = await http<{ data: Array<{ id: number }> }>(
            'GET',
            `/api/v1/documents?documentTypeId=${createdDocumentTypeId}&searchTerm=${encodeURIComponent(DOCUMENT_NAME)}&pageSize=5`,
            { token: accessToken }
          );
          record(
            '8',
            'filter by documentTypeId + searchTerm hits the test row',
            byParent.status === 200 &&
              !!byParent.body?.data?.some((r) => r.id === createdDocumentId),
            `found=${byParent.body?.data?.length ?? 0}`
          );

          const dup = await http<{ code: string }>('POST', '/api/v1/documents', {
            token: accessToken,
            body: {
              documentTypeId: createdDocumentTypeId,
              name: DOCUMENT_NAME
            }
          });
          record(
            '8',
            'duplicate (documentTypeId, name) → 4xx',
            dup.status >= 400 && dup.status < 500,
            `got ${dup.status}`
          );

          const emptyPatch = await http<{ code: string }>(
            'PATCH',
            `/api/v1/documents/${createdDocumentId}`,
            { token: accessToken, body: {} }
          );
          record(
            '8',
            'PATCH /documents/:id with empty body → 400',
            emptyPatch.status === 400,
            `got ${emptyPatch.status}`
          );

          const upd = await http<{ data: { description: string | null } }>(
            'PATCH',
            `/api/v1/documents/${createdDocumentId}`,
            { token: accessToken, body: { description: 'updated' } }
          );
          record(
            '8',
            'PATCH /documents/:id updates description',
            upd.status === 200 && upd.body?.data?.description === 'updated',
            `got ${upd.status}`
          );

          const del = await http<{ data: { deleted: boolean } }>(
            'DELETE',
            `/api/v1/documents/${createdDocumentId}`,
            { token: accessToken }
          );
          record(
            '8',
            'DELETE /documents/:id → 200',
            del.status === 200 && del.body?.data?.deleted === true,
            `got ${del.status}`
          );
          const restore = await http<{ data: { isDeleted: boolean } }>(
            'POST',
            `/api/v1/documents/${createdDocumentId}/restore`,
            { token: accessToken }
          );
          record(
            '8',
            'POST /documents/:id/restore brings it back',
            restore.status === 200 && restore.body?.data?.isDeleted === false,
            `got ${restore.status}`
          );
        }
      }
    }

    // ─── 9. Designations CRUD ───────────────────────────
    header('9. Designations CRUD');
    {
      const list = await http<{
        data: Array<{ id: number; levelBand: string }>;
      }>('GET', '/api/v1/designations?pageSize=5', { token: accessToken });
      record('9', 'GET /designations → 200', list.status === 200, `got ${list.status}`);

      const create = await http<{
        data: { id: number; name: string; code: string; levelBand: string; level: number };
      }>('POST', '/api/v1/designations', {
        token: accessToken,
        body: {
          name: DESIGNATION_NAME,
          code: DESIGNATION_CODE,
          level: 3,
          levelBand: 'mid',
          description: 'e2e verify row',
          isActive: true
        }
      });
      record(
        '9',
        'POST /designations → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `got ${create.status}`
      );
      createdDesignationId = create.body?.data?.id ?? null;
      record(
        '9',
        'created designation has correct level_band + level',
        create.body?.data?.levelBand === 'mid' && create.body?.data?.level === 3,
        `levelBand=${create.body?.data?.levelBand} level=${create.body?.data?.level}`
      );

      // Bad level_band → 400
      const badBand = await http<{ code: string }>('POST', '/api/v1/designations', {
        token: accessToken,
        body: {
          name: `${DESIGNATION_NAME}_bad`,
          code: `${DESIGNATION_CODE}x`,
          level: 2,
          levelBand: 'not_a_band'
        }
      });
      record('9', 'bad level_band → 400', badBand.status === 400, `got ${badBand.status}`);

      if (createdDesignationId) {
        // Filter by levelBand
        const byBand = await http<{
          data: Array<{ id: number; levelBand: string }>;
        }>(
          'GET',
          `/api/v1/designations?levelBand=mid&searchTerm=${encodeURIComponent(DESIGNATION_NAME)}`,
          { token: accessToken }
        );
        record(
          '9',
          'filter by levelBand=mid hits the test row',
          byBand.status === 200 &&
            !!byBand.body?.data?.some(
              (r) => r.id === createdDesignationId && r.levelBand === 'mid'
            ),
          `found=${byBand.body?.data?.length ?? 0}`
        );

        // Duplicate code
        const dup = await http<{ code: string }>('POST', '/api/v1/designations', {
          token: accessToken,
          body: {
            name: `${DESIGNATION_NAME}_dup`,
            code: DESIGNATION_CODE,
            level: 3,
            levelBand: 'mid'
          }
        });
        record(
          '9',
          'duplicate designation code → 4xx',
          dup.status >= 400 && dup.status < 500,
          `got ${dup.status}`
        );

        const upd = await http<{ data: { level: number; levelBand: string } }>(
          'PATCH',
          `/api/v1/designations/${createdDesignationId}`,
          { token: accessToken, body: { level: 5, levelBand: 'senior' } }
        );
        record(
          '9',
          'PATCH /designations/:id updates level + level_band',
          upd.status === 200 &&
            upd.body?.data?.level === 5 &&
            upd.body?.data?.levelBand === 'senior',
          `got ${upd.status}`
        );

        const del = await http<{ data: { deleted: boolean } }>(
          'DELETE',
          `/api/v1/designations/${createdDesignationId}`,
          { token: accessToken }
        );
        record(
          '9',
          'DELETE /designations/:id → 200',
          del.status === 200 && del.body?.data?.deleted === true,
          `got ${del.status}`
        );
        const restore = await http<{ data: { isDeleted: boolean } }>(
          'POST',
          `/api/v1/designations/${createdDesignationId}/restore`,
          { token: accessToken }
        );
        record(
          '9',
          'POST /designations/:id/restore brings it back',
          restore.status === 200 && restore.body?.data?.isDeleted === false,
          `got ${restore.status}`
        );
      }
    }

    // ─── 10. Specializations CRUD + icon upload ─────────
    header('10. Specializations CRUD + icon upload');
    {
      const list = await http<{
        data: Array<{ id: number; category: string }>;
      }>('GET', '/api/v1/specializations?pageSize=5', { token: accessToken });
      record(
        '10',
        'GET /specializations → 200',
        list.status === 200,
        `got ${list.status}`
      );

      const create = await http<{
        data: { id: number; name: string; category: string; iconUrl: string | null };
      }>('POST', '/api/v1/specializations', {
        token: accessToken,
        body: {
          name: SPECIALIZATION_NAME,
          category: 'technology',
          description: 'e2e verify row',
          isActive: true
        }
      });
      record(
        '10',
        'POST /specializations → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `got ${create.status}`
      );
      createdSpecializationId = create.body?.data?.id ?? null;
      record(
        '10',
        'created specialization has category=technology and null iconUrl',
        create.body?.data?.category === 'technology' &&
          create.body?.data?.iconUrl === null,
        `category=${create.body?.data?.category} iconUrl=${create.body?.data?.iconUrl}`
      );

      // Bad category → 400
      const badCat = await http<{ code: string }>('POST', '/api/v1/specializations', {
        token: accessToken,
        body: { name: `${SPECIALIZATION_NAME}_bad`, category: 'not_a_category' }
      });
      record('10', 'bad category → 400', badCat.status === 400, `got ${badCat.status}`);

      if (createdSpecializationId) {
        // Filter by category
        const byCat = await http<{
          data: Array<{ id: number; category: string }>;
        }>(
          'GET',
          `/api/v1/specializations?category=technology&searchTerm=${encodeURIComponent(SPECIALIZATION_NAME)}`,
          { token: accessToken }
        );
        record(
          '10',
          'filter by category=technology hits the test row',
          byCat.status === 200 &&
            !!byCat.body?.data?.some(
              (r) =>
                r.id === createdSpecializationId && r.category === 'technology'
            ),
          `found=${byCat.body?.data?.length ?? 0}`
        );

        // Duplicate name
        const dup = await http<{ code: string }>('POST', '/api/v1/specializations', {
          token: accessToken,
          body: { name: SPECIALIZATION_NAME, category: 'technology' }
        });
        record(
          '10',
          'duplicate specialization name → 4xx',
          dup.status >= 400 && dup.status < 500,
          `got ${dup.status}`
        );

        // Real PATCH
        const upd = await http<{ data: { description: string | null } }>(
          'PATCH',
          `/api/v1/specializations/${createdSpecializationId}`,
          { token: accessToken, body: { description: 'updated' } }
        );
        record(
          '10',
          'PATCH /specializations/:id updates description',
          upd.status === 200 && upd.body?.data?.description === 'updated',
          `got ${upd.status}`
        );

        // ── Icon upload: happy path ───────────────────
        //
        // Build a tiny 32x32 red PNG with sharp. It's well under the
        // 100 KB multer cap AND compresses easily under the 100 KB
        // WebP byte cap. This touches the real Bunny CDN.
        const tinyPngBuffer = await sharp({
          create: {
            width: 32,
            height: 32,
            channels: 4,
            background: { r: 255, g: 64, b: 64, alpha: 1 }
          }
        })
          .png()
          .toBuffer();

        const iconUpload = await httpMultipart<{
          data: { id: number; iconUrl: string | null };
        }>(`/api/v1/specializations/${createdSpecializationId}/icon`, {
          buffer: tinyPngBuffer,
          contentType: 'image/png',
          filename: 'icon.png',
          token: accessToken
        });
        record(
          '10',
          'POST /specializations/:id/icon (tiny PNG) → 200',
          iconUpload.status === 200 &&
            typeof iconUpload.body?.data?.iconUrl === 'string' &&
            iconUpload.body.data.iconUrl.endsWith('.webp'),
          `status=${iconUpload.status} iconUrl=${iconUpload.body?.data?.iconUrl ?? 'null'}`
        );

        // ── Icon upload: replace (second upload) ──────
        //
        // Different color so the re-encode is real. URL is deterministic
        // (specializations/icons/<id>.webp) so it stays stable — we just
        // verify the endpoint still returns 200 and iconUrl is still set.
        const tinyPngBuffer2 = await sharp({
          create: {
            width: 32,
            height: 32,
            channels: 4,
            background: { r: 64, g: 220, b: 64, alpha: 1 }
          }
        })
          .png()
          .toBuffer();

        const iconReplace = await httpMultipart<{
          data: { iconUrl: string | null };
        }>(`/api/v1/specializations/${createdSpecializationId}/icon`, {
          buffer: tinyPngBuffer2,
          contentType: 'image/png',
          filename: 'icon.png',
          token: accessToken
        });
        record(
          '10',
          'POST /specializations/:id/icon (replace) → 200',
          iconReplace.status === 200 &&
            typeof iconReplace.body?.data?.iconUrl === 'string',
          `status=${iconReplace.status}`
        );

        // ── Icon upload: oversize → 400 via multer ────
        //
        // Produce a buffer that's deliberately over the 100 KB multer
        // hard cap. multer rejects at the wire with LIMIT_FILE_SIZE,
        // which our middleware translates into a 400 AppError.
        const oversize = Buffer.alloc(150 * 1024, 0xff);
        const iconOversize = await httpMultipart<{ code: string }>(
          `/api/v1/specializations/${createdSpecializationId}/icon`,
          {
            buffer: oversize,
            contentType: 'image/png',
            filename: 'huge.png',
            token: accessToken
          }
        );
        record(
          '10',
          'POST /specializations/:id/icon (oversize) → 400',
          iconOversize.status === 400,
          `got ${iconOversize.status}`
        );

        // ── Icon delete ────────────────────────────────
        const iconDelete = await http<{ data: { iconUrl: string | null } }>(
          'DELETE',
          `/api/v1/specializations/${createdSpecializationId}/icon`,
          { token: accessToken }
        );
        record(
          '10',
          'DELETE /specializations/:id/icon → 200 + iconUrl cleared',
          iconDelete.status === 200 && iconDelete.body?.data?.iconUrl === null,
          `status=${iconDelete.status} iconUrl=${iconDelete.body?.data?.iconUrl ?? 'null'}`
        );

        // Soft delete → restore
        const del = await http<{ data: { deleted: boolean } }>(
          'DELETE',
          `/api/v1/specializations/${createdSpecializationId}`,
          { token: accessToken }
        );
        record(
          '10',
          'DELETE /specializations/:id → 200',
          del.status === 200 && del.body?.data?.deleted === true,
          `got ${del.status}`
        );
        const restore = await http<{ data: { isDeleted: boolean } }>(
          'POST',
          `/api/v1/specializations/${createdSpecializationId}/restore`,
          { token: accessToken }
        );
        record(
          '10',
          'POST /specializations/:id/restore brings it back',
          restore.status === 200 && restore.body?.data?.isDeleted === false,
          `got ${restore.status}`
        );
      }
    }

    // ─── 12. Learning goals CRUD + icon upload ──────────
    header('12. Learning goals CRUD + icon upload (Bunny + WebP)');
    {
      const list = await http<{ data: Array<{ id: number; name: string }> }>(
        'GET',
        '/api/v1/learning-goals?pageSize=5',
        { token: accessToken }
      );
      record('12', 'GET /learning-goals → 200', list.status === 200, `got ${list.status}`);

      const create = await http<{
        data: { id: number; name: string; iconUrl: string | null };
      }>('POST', '/api/v1/learning-goals', {
        token: accessToken,
        body: {
          name: LEARNING_GOAL_NAME,
          description: 'e2e verify row',
          displayOrder: 9999,
          isActive: true
        }
      });
      record(
        '12',
        'POST /learning-goals → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `got ${create.status}`
      );
      createdLearningGoalId = create.body?.data?.id ?? null;
      record(
        '12',
        'created learning goal has null iconUrl initially',
        create.body?.data?.iconUrl === null,
        `iconUrl=${create.body?.data?.iconUrl}`
      );

      // Duplicate name → 4xx
      const dup = await http<{ code: string }>('POST', '/api/v1/learning-goals', {
        token: accessToken,
        body: { name: LEARNING_GOAL_NAME }
      });
      record(
        '12',
        'duplicate learning-goal name → 4xx',
        dup.status >= 400 && dup.status < 500,
        `got ${dup.status}`
      );

      if (createdLearningGoalId) {
        // PATCH
        const upd = await http<{ data: { description: string | null } }>(
          'PATCH',
          `/api/v1/learning-goals/${createdLearningGoalId}`,
          { token: accessToken, body: { description: 'updated description' } }
        );
        record(
          '12',
          'PATCH /learning-goals/:id updates description',
          upd.status === 200 && upd.body?.data?.description === 'updated description',
          `got ${upd.status}`
        );

        // Icon upload happy path
        const tinyPng = await sharp({
          create: {
            width: 48,
            height: 48,
            channels: 4,
            background: { r: 20, g: 180, b: 100, alpha: 1 }
          }
        })
          .png()
          .toBuffer();

        const iconUpload = await httpMultipart<{
          data: { iconUrl: string | null };
        }>(`/api/v1/learning-goals/${createdLearningGoalId}/icon`, {
          buffer: tinyPng,
          contentType: 'image/png',
          filename: 'lg.png',
          token: accessToken
        });
        record(
          '12',
          'POST /learning-goals/:id/icon (tiny PNG) → 200 + .webp',
          iconUpload.status === 200 &&
            typeof iconUpload.body?.data?.iconUrl === 'string' &&
            iconUpload.body.data.iconUrl.endsWith('.webp'),
          `status=${iconUpload.status} iconUrl=${iconUpload.body?.data?.iconUrl ?? 'null'}`
        );

        // Icon replace (second upload — deterministic path stays stable)
        const tinyPng2 = await sharp({
          create: {
            width: 48,
            height: 48,
            channels: 4,
            background: { r: 200, g: 20, b: 200, alpha: 1 }
          }
        })
          .png()
          .toBuffer();
        const iconReplace = await httpMultipart<{ data: { iconUrl: string | null } }>(
          `/api/v1/learning-goals/${createdLearningGoalId}/icon`,
          {
            buffer: tinyPng2,
            contentType: 'image/png',
            filename: 'lg.png',
            token: accessToken
          }
        );
        record(
          '12',
          'POST /learning-goals/:id/icon (replace) → 200',
          iconReplace.status === 200 &&
            typeof iconReplace.body?.data?.iconUrl === 'string',
          `status=${iconReplace.status}`
        );

        // Oversize → 400 via multer hard-cap
        const oversize = Buffer.alloc(150 * 1024, 0xff);
        const iconOversize = await httpMultipart<{ code: string }>(
          `/api/v1/learning-goals/${createdLearningGoalId}/icon`,
          {
            buffer: oversize,
            contentType: 'image/png',
            filename: 'huge.png',
            token: accessToken
          }
        );
        record(
          '12',
          'POST /learning-goals/:id/icon (oversize) → 400',
          iconOversize.status === 400,
          `got ${iconOversize.status}`
        );

        // Icon delete
        const iconDelete = await http<{ data: { iconUrl: string | null } }>(
          'DELETE',
          `/api/v1/learning-goals/${createdLearningGoalId}/icon`,
          { token: accessToken }
        );
        record(
          '12',
          'DELETE /learning-goals/:id/icon → 200 + iconUrl cleared',
          iconDelete.status === 200 && iconDelete.body?.data?.iconUrl === null,
          `status=${iconDelete.status}`
        );

        // Soft delete → restore
        const del = await http<{ data: { deleted: boolean } }>(
          'DELETE',
          `/api/v1/learning-goals/${createdLearningGoalId}`,
          { token: accessToken }
        );
        record(
          '12',
          'DELETE /learning-goals/:id → 200',
          del.status === 200 && del.body?.data?.deleted === true,
          `got ${del.status}`
        );
        const restore = await http<{ data: { isDeleted: boolean } }>(
          'POST',
          `/api/v1/learning-goals/${createdLearningGoalId}/restore`,
          { token: accessToken }
        );
        record(
          '12',
          'POST /learning-goals/:id/restore brings it back',
          restore.status === 200 && restore.body?.data?.isDeleted === false,
          `got ${restore.status}`
        );
      }
    }

    // ─── 13. Social medias CRUD + icon upload ───────────
    header('13. Social medias CRUD + icon upload (Bunny + WebP)');
    {
      const list = await http<{ data: Array<{ id: number; code: string }> }>(
        'GET',
        '/api/v1/social-medias?pageSize=5',
        { token: accessToken }
      );
      record('13', 'GET /social-medias → 200', list.status === 200, `got ${list.status}`);

      const create = await http<{
        data: {
          id: number;
          name: string;
          code: string;
          platformType: string;
          iconUrl: string | null;
        };
      }>('POST', '/api/v1/social-medias', {
        token: accessToken,
        body: {
          name: SOCIAL_MEDIA_NAME,
          code: SOCIAL_MEDIA_CODE,
          baseUrl: 'https://example.test/',
          placeholder: 'https://example.test/your-handle',
          platformType: 'code',
          displayOrder: 9999,
          isActive: true
        }
      });
      record(
        '13',
        'POST /social-medias → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `got ${create.status}`
      );
      createdSocialMediaId = create.body?.data?.id ?? null;
      record(
        '13',
        'created social media has platformType=code and null iconUrl',
        create.body?.data?.platformType === 'code' && create.body?.data?.iconUrl === null,
        `platformType=${create.body?.data?.platformType} iconUrl=${create.body?.data?.iconUrl}`
      );

      // Bad platform type → 400
      const badType = await http<{ code: string }>('POST', '/api/v1/social-medias', {
        token: accessToken,
        body: {
          name: `${SOCIAL_MEDIA_NAME}_bad`,
          code: `${SOCIAL_MEDIA_CODE}_bad`,
          platformType: 'not_a_type'
        }
      });
      record(
        '13',
        'bad platform type → 400',
        badType.status === 400,
        `got ${badType.status}`
      );

      if (createdSocialMediaId) {
        // Duplicate code → 4xx
        const dup = await http<{ code: string }>('POST', '/api/v1/social-medias', {
          token: accessToken,
          body: { name: `${SOCIAL_MEDIA_NAME}_dup`, code: SOCIAL_MEDIA_CODE, platformType: 'code' }
        });
        record(
          '13',
          'duplicate social-media code → 4xx',
          dup.status >= 400 && dup.status < 500,
          `got ${dup.status}`
        );

        // Filter by platformType
        const byType = await http<{ data: Array<{ id: number; platformType: string }> }>(
          'GET',
          `/api/v1/social-medias?platformType=code&searchTerm=${encodeURIComponent(SOCIAL_MEDIA_NAME)}`,
          { token: accessToken }
        );
        record(
          '13',
          'filter by platformType=code hits the test row',
          byType.status === 200 &&
            !!byType.body?.data?.some((r) => r.id === createdSocialMediaId),
          `found=${byType.body?.data?.length ?? 0}`
        );

        // PATCH
        const upd = await http<{ data: { baseUrl: string | null } }>(
          'PATCH',
          `/api/v1/social-medias/${createdSocialMediaId}`,
          { token: accessToken, body: { baseUrl: 'https://example.test/updated' } }
        );
        record(
          '13',
          'PATCH /social-medias/:id updates baseUrl',
          upd.status === 200 && upd.body?.data?.baseUrl === 'https://example.test/updated',
          `got ${upd.status}`
        );

        // Icon upload
        const tinyPng = await sharp({
          create: { width: 32, height: 32, channels: 4, background: { r: 0, g: 100, b: 200, alpha: 1 } }
        })
          .png()
          .toBuffer();
        const iconUpload = await httpMultipart<{ data: { iconUrl: string | null } }>(
          `/api/v1/social-medias/${createdSocialMediaId}/icon`,
          { buffer: tinyPng, contentType: 'image/png', filename: 'sm.png', token: accessToken }
        );
        record(
          '13',
          'POST /social-medias/:id/icon → 200 + .webp',
          iconUpload.status === 200 &&
            typeof iconUpload.body?.data?.iconUrl === 'string' &&
            iconUpload.body.data.iconUrl.endsWith('.webp'),
          `status=${iconUpload.status}`
        );

        // Oversize → 400
        const oversize = Buffer.alloc(150 * 1024, 0xff);
        const iconOversize = await httpMultipart<{ code: string }>(
          `/api/v1/social-medias/${createdSocialMediaId}/icon`,
          { buffer: oversize, contentType: 'image/png', filename: 'huge.png', token: accessToken }
        );
        record(
          '13',
          'POST /social-medias/:id/icon (oversize) → 400',
          iconOversize.status === 400,
          `got ${iconOversize.status}`
        );

        // Icon delete
        const iconDelete = await http<{ data: { iconUrl: string | null } }>(
          'DELETE',
          `/api/v1/social-medias/${createdSocialMediaId}/icon`,
          { token: accessToken }
        );
        record(
          '13',
          'DELETE /social-medias/:id/icon → 200 + iconUrl cleared',
          iconDelete.status === 200 && iconDelete.body?.data?.iconUrl === null,
          `status=${iconDelete.status}`
        );

        // Soft delete → restore
        const del = await http<{ data: { deleted: boolean } }>(
          'DELETE',
          `/api/v1/social-medias/${createdSocialMediaId}`,
          { token: accessToken }
        );
        record('13', 'DELETE /social-medias/:id → 200', del.status === 200, `got ${del.status}`);
        const restore = await http<{ data: { isDeleted: boolean } }>(
          'POST',
          `/api/v1/social-medias/${createdSocialMediaId}/restore`,
          { token: accessToken }
        );
        record(
          '13',
          'POST /social-medias/:id/restore brings it back',
          restore.status === 200 && restore.body?.data?.isDeleted === false,
          `got ${restore.status}`
        );
      }
    }

    // ─── 14. Categories CRUD + icon + image + translations ──
    header('14. Categories CRUD + icon + image + translations');
    {
      const list = await http<{ data: Array<{ id: number; code: string }> }>(
        'GET',
        '/api/v1/categories?pageSize=5',
        { token: accessToken }
      );
      record('14', 'GET /categories → 200', list.status === 200, `got ${list.status}`);

      // Combined parent+translation insert in one request.
      const create = await http<{
        data: {
          id: number;
          code: string;
          slug: string;
          iconUrl: string | null;
          imageUrl: string | null;
        };
      }>('POST', '/api/v1/categories', {
        token: accessToken,
        body: {
          code: CATEGORY_CODE,
          displayOrder: 9999,
          isActive: true,
          translation: {
            languageId: anchorLanguageId,
            name: CATEGORY_TRANSLATION_NAME,
            description: 'verify category translation'
          }
        }
      });
      record(
        '14',
        'POST /categories (with embedded translation) → 201',
        create.status === 201 && typeof create.body?.data?.id === 'number',
        `got ${create.status}`
      );
      createdCategoryId = create.body?.data?.id ?? null;
      record(
        '14',
        'created category has null iconUrl and null imageUrl initially',
        create.body?.data?.iconUrl === null && create.body?.data?.imageUrl === null,
        `iconUrl=${create.body?.data?.iconUrl} imageUrl=${create.body?.data?.imageUrl}`
      );

      if (createdCategoryId) {
        // Verify the embedded translation row actually exists via GET /:id/translations
        const trList = await http<{
          data: Array<{ id: number; name: string; categoryId: number }>;
        }>(
          'GET',
          `/api/v1/categories/${createdCategoryId}/translations?pageSize=5`,
          { token: accessToken }
        );
        record(
          '14',
          'GET /categories/:id/translations returns the embedded row',
          trList.status === 200 &&
            !!trList.body?.data?.some(
              (r) => r.name === CATEGORY_TRANSLATION_NAME && r.categoryId === createdCategoryId
            ),
          `rows=${trList.body?.data?.length ?? 0}`
        );
        createdCategoryTranslationId =
          trList.body?.data?.find((r) => r.name === CATEGORY_TRANSLATION_NAME)?.id ?? null;

        // Duplicate code → 4xx
        const dup = await http<{ code: string }>('POST', '/api/v1/categories', {
          token: accessToken,
          body: { code: CATEGORY_CODE }
        });
        record(
          '14',
          'duplicate category code → 4xx',
          dup.status >= 400 && dup.status < 500,
          `got ${dup.status}`
        );

        // PATCH
        const upd = await http<{ data: { displayOrder: number } }>(
          'PATCH',
          `/api/v1/categories/${createdCategoryId}`,
          { token: accessToken, body: { displayOrder: 8888 } }
        );
        record(
          '14',
          'PATCH /categories/:id updates displayOrder',
          upd.status === 200 && upd.body?.data?.displayOrder === 8888,
          `got ${upd.status}`
        );

        // ── Icon upload flow ────────────────────────────
        const iconPng = await sharp({
          create: { width: 64, height: 64, channels: 4, background: { r: 120, g: 70, b: 220, alpha: 1 } }
        })
          .png()
          .toBuffer();
        const iconUp = await httpMultipart<{ data: { iconUrl: string | null } }>(
          `/api/v1/categories/${createdCategoryId}/icon`,
          { buffer: iconPng, contentType: 'image/png', filename: 'c.png', token: accessToken }
        );
        record(
          '14',
          'POST /categories/:id/icon → 200 + .webp',
          iconUp.status === 200 &&
            typeof iconUp.body?.data?.iconUrl === 'string' &&
            iconUp.body.data.iconUrl.endsWith('.webp'),
          `status=${iconUp.status}`
        );

        // Icon oversize → 400
        const iconOversize = await httpMultipart<{ code: string }>(
          `/api/v1/categories/${createdCategoryId}/icon`,
          {
            buffer: Buffer.alloc(150 * 1024, 0xff),
            contentType: 'image/png',
            filename: 'huge.png',
            token: accessToken
          }
        );
        record(
          '14',
          'POST /categories/:id/icon (oversize) → 400',
          iconOversize.status === 400,
          `got ${iconOversize.status}`
        );

        // Icon delete
        const iconDel = await http<{ data: { iconUrl: string | null } }>(
          'DELETE',
          `/api/v1/categories/${createdCategoryId}/icon`,
          { token: accessToken }
        );
        record(
          '14',
          'DELETE /categories/:id/icon → 200 + cleared',
          iconDel.status === 200 && iconDel.body?.data?.iconUrl === null,
          `status=${iconDel.status}`
        );

        // ── Image (larger box) upload flow ──────────────
        const imgPng = await sharp({
          create: { width: 96, height: 96, channels: 4, background: { r: 250, g: 220, b: 80, alpha: 1 } }
        })
          .png()
          .toBuffer();
        const imgUp = await httpMultipart<{ data: { imageUrl: string | null } }>(
          `/api/v1/categories/${createdCategoryId}/image`,
          { buffer: imgPng, contentType: 'image/png', filename: 'cimg.png', token: accessToken }
        );
        record(
          '14',
          'POST /categories/:id/image → 200 + .webp',
          imgUp.status === 200 &&
            typeof imgUp.body?.data?.imageUrl === 'string' &&
            imgUp.body.data.imageUrl.endsWith('.webp'),
          `status=${imgUp.status}`
        );

        // Image oversize → 400
        const imgOversize = await httpMultipart<{ code: string }>(
          `/api/v1/categories/${createdCategoryId}/image`,
          {
            buffer: Buffer.alloc(150 * 1024, 0xff),
            contentType: 'image/png',
            filename: 'huge.png',
            token: accessToken
          }
        );
        record(
          '14',
          'POST /categories/:id/image (oversize) → 400',
          imgOversize.status === 400,
          `got ${imgOversize.status}`
        );

        // Image delete
        const imgDel = await http<{ data: { imageUrl: string | null } }>(
          'DELETE',
          `/api/v1/categories/${createdCategoryId}/image`,
          { token: accessToken }
        );
        record(
          '14',
          'DELETE /categories/:id/image → 200 + cleared',
          imgDel.status === 200 && imgDel.body?.data?.imageUrl === null,
          `status=${imgDel.status}`
        );

        // ── Translation sub-resource PATCH ──────────────
        if (createdCategoryTranslationId) {
          const trUpd = await http<{ data: { description: string | null } }>(
            'PATCH',
            `/api/v1/categories/${createdCategoryId}/translations/${createdCategoryTranslationId}`,
            { token: accessToken, body: { description: 'translation patched' } }
          );
          record(
            '14',
            'PATCH /categories/:id/translations/:tid → 200',
            trUpd.status === 200 && trUpd.body?.data?.description === 'translation patched',
            `got ${trUpd.status}`
          );
        }

        // Soft delete → restore (with restore_translations=true on the SQL side)
        const del = await http<{ data: { deleted: boolean } }>(
          'DELETE',
          `/api/v1/categories/${createdCategoryId}`,
          { token: accessToken }
        );
        record('14', 'DELETE /categories/:id → 200', del.status === 200, `got ${del.status}`);
        const restore = await http<{ data: { isDeleted: boolean } }>(
          'POST',
          `/api/v1/categories/${createdCategoryId}/restore`,
          { token: accessToken }
        );
        record(
          '14',
          'POST /categories/:id/restore brings it back',
          restore.status === 200 && restore.body?.data?.isDeleted === false,
          `got ${restore.status}`
        );
      }
    }

    // ─── 15. Sub-categories CRUD + icon + image + translations ──
    header('15. Sub-categories CRUD + icon + image + translations');
    {
      if (!createdCategoryId) {
        record(
          '15',
          'sub-category section skipped — no parent category available',
          false,
          'createdCategoryId is null'
        );
      } else {
        const list = await http<{ data: Array<{ id: number; code: string }> }>(
          'GET',
          `/api/v1/sub-categories?pageSize=5&categoryId=${createdCategoryId}`,
          { token: accessToken }
        );
        record(
          '15',
          'GET /sub-categories?categoryId=… → 200',
          list.status === 200,
          `got ${list.status}`
        );

        const create = await http<{
          data: {
            id: number;
            code: string;
            iconUrl: string | null;
            imageUrl: string | null;
          };
        }>('POST', '/api/v1/sub-categories', {
          token: accessToken,
          body: {
            categoryId: createdCategoryId,
            code: SUB_CATEGORY_CODE,
            displayOrder: 9999,
            isActive: true,
            translation: {
              languageId: anchorLanguageId,
              name: SUB_CATEGORY_TRANSLATION_NAME,
              description: 'verify sub-category translation'
            }
          }
        });
        record(
          '15',
          'POST /sub-categories (with embedded translation) → 201',
          create.status === 201 && typeof create.body?.data?.id === 'number',
          `got ${create.status}`
        );
        createdSubCategoryId = create.body?.data?.id ?? null;
        record(
          '15',
          'created sub-category has null iconUrl and null imageUrl initially',
          create.body?.data?.iconUrl === null && create.body?.data?.imageUrl === null,
          `iconUrl=${create.body?.data?.iconUrl} imageUrl=${create.body?.data?.imageUrl}`
        );

        // Bad categoryId → 4xx (does not exist)
        const badParent = await http<{ code: string }>('POST', '/api/v1/sub-categories', {
          token: accessToken,
          body: {
            categoryId: 9_999_999,
            code: `${SUB_CATEGORY_CODE}_bad`
          }
        });
        record(
          '15',
          'bad categoryId → 4xx',
          badParent.status >= 400 && badParent.status < 500,
          `got ${badParent.status}`
        );

        if (createdSubCategoryId) {
          // Verify embedded translation row
          const trList = await http<{
            data: Array<{ id: number; name: string }>;
          }>(
            'GET',
            `/api/v1/sub-categories/${createdSubCategoryId}/translations?pageSize=5`,
            { token: accessToken }
          );
          record(
            '15',
            'GET /sub-categories/:id/translations returns the embedded row',
            trList.status === 200 &&
              !!trList.body?.data?.some((r) => r.name === SUB_CATEGORY_TRANSLATION_NAME),
            `rows=${trList.body?.data?.length ?? 0}`
          );
          createdSubCategoryTranslationId =
            trList.body?.data?.find((r) => r.name === SUB_CATEGORY_TRANSLATION_NAME)?.id ?? null;

          // Duplicate (category_id, slug) → 4xx
          const dup = await http<{ code: string }>('POST', '/api/v1/sub-categories', {
            token: accessToken,
            body: { categoryId: createdCategoryId, code: SUB_CATEGORY_CODE }
          });
          record(
            '15',
            'duplicate (category_id, slug) → 4xx',
            dup.status >= 400 && dup.status < 500,
            `got ${dup.status}`
          );

          // PATCH
          const upd = await http<{ data: { displayOrder: number } }>(
            'PATCH',
            `/api/v1/sub-categories/${createdSubCategoryId}`,
            { token: accessToken, body: { displayOrder: 7777 } }
          );
          record(
            '15',
            'PATCH /sub-categories/:id updates displayOrder',
            upd.status === 200 && upd.body?.data?.displayOrder === 7777,
            `got ${upd.status}`
          );

          // Icon upload
          const iconPng = await sharp({
            create: { width: 64, height: 64, channels: 4, background: { r: 20, g: 60, b: 90, alpha: 1 } }
          })
            .png()
            .toBuffer();
          const iconUp = await httpMultipart<{ data: { iconUrl: string | null } }>(
            `/api/v1/sub-categories/${createdSubCategoryId}/icon`,
            { buffer: iconPng, contentType: 'image/png', filename: 'sc.png', token: accessToken }
          );
          record(
            '15',
            'POST /sub-categories/:id/icon → 200 + .webp',
            iconUp.status === 200 &&
              typeof iconUp.body?.data?.iconUrl === 'string' &&
              iconUp.body.data.iconUrl.endsWith('.webp'),
            `status=${iconUp.status}`
          );

          // Icon oversize → 400
          const iconOversize = await httpMultipart<{ code: string }>(
            `/api/v1/sub-categories/${createdSubCategoryId}/icon`,
            {
              buffer: Buffer.alloc(150 * 1024, 0xff),
              contentType: 'image/png',
              filename: 'huge.png',
              token: accessToken
            }
          );
          record(
            '15',
            'POST /sub-categories/:id/icon (oversize) → 400',
            iconOversize.status === 400,
            `got ${iconOversize.status}`
          );

          // Icon delete
          const iconDel = await http<{ data: { iconUrl: string | null } }>(
            'DELETE',
            `/api/v1/sub-categories/${createdSubCategoryId}/icon`,
            { token: accessToken }
          );
          record(
            '15',
            'DELETE /sub-categories/:id/icon → 200 + cleared',
            iconDel.status === 200 && iconDel.body?.data?.iconUrl === null,
            `status=${iconDel.status}`
          );

          // Image upload
          const imgPng = await sharp({
            create: { width: 96, height: 96, channels: 4, background: { r: 250, g: 100, b: 10, alpha: 1 } }
          })
            .png()
            .toBuffer();
          const imgUp = await httpMultipart<{ data: { imageUrl: string | null } }>(
            `/api/v1/sub-categories/${createdSubCategoryId}/image`,
            { buffer: imgPng, contentType: 'image/png', filename: 'scimg.png', token: accessToken }
          );
          record(
            '15',
            'POST /sub-categories/:id/image → 200 + .webp',
            imgUp.status === 200 &&
              typeof imgUp.body?.data?.imageUrl === 'string' &&
              imgUp.body.data.imageUrl.endsWith('.webp'),
            `status=${imgUp.status}`
          );

          // Image oversize → 400
          const imgOversize = await httpMultipart<{ code: string }>(
            `/api/v1/sub-categories/${createdSubCategoryId}/image`,
            {
              buffer: Buffer.alloc(150 * 1024, 0xff),
              contentType: 'image/png',
              filename: 'huge.png',
              token: accessToken
            }
          );
          record(
            '15',
            'POST /sub-categories/:id/image (oversize) → 400',
            imgOversize.status === 400,
            `got ${imgOversize.status}`
          );

          // Image delete
          const imgDel = await http<{ data: { imageUrl: string | null } }>(
            'DELETE',
            `/api/v1/sub-categories/${createdSubCategoryId}/image`,
            { token: accessToken }
          );
          record(
            '15',
            'DELETE /sub-categories/:id/image → 200 + cleared',
            imgDel.status === 200 && imgDel.body?.data?.imageUrl === null,
            `status=${imgDel.status}`
          );

          // Translation sub-resource PATCH
          if (createdSubCategoryTranslationId) {
            const trUpd = await http<{ data: { description: string | null } }>(
              'PATCH',
              `/api/v1/sub-categories/${createdSubCategoryId}/translations/${createdSubCategoryTranslationId}`,
              { token: accessToken, body: { description: 'sub-translation patched' } }
            );
            record(
              '15',
              'PATCH /sub-categories/:id/translations/:tid → 200',
              trUpd.status === 200 && trUpd.body?.data?.description === 'sub-translation patched',
              `got ${trUpd.status}`
            );
          }

          // Soft delete → restore
          const del = await http<{ data: { deleted: boolean } }>(
            'DELETE',
            `/api/v1/sub-categories/${createdSubCategoryId}`,
            { token: accessToken }
          );
          record('15', 'DELETE /sub-categories/:id → 200', del.status === 200, `got ${del.status}`);
          const restore = await http<{ data: { isDeleted: boolean } }>(
            'POST',
            `/api/v1/sub-categories/${createdSubCategoryId}/restore`,
            { token: accessToken }
          );
          record(
            '15',
            'POST /sub-categories/:id/restore brings it back',
            restore.status === 200 && restore.body?.data?.isDeleted === false,
            `got ${restore.status}`
          );
        }
      }
    }
  } finally {
    // ─── 11. Cleanup ─────────────────────────────────────
    header('11. Cleanup');
    {
      // City first, then state (FK dependency).
      if (createdCityId) {
        try {
          await hardDeleteCity(createdCityId);
          record('11', 'test city hard-deleted', true, `id=${createdCityId}`);
        } catch (err) {
          record('11', 'test city hard-deleted', false, (err as Error).message);
        }
      }
      if (createdStateId) {
        try {
          await hardDeleteState(createdStateId);
          record('11', 'test state hard-deleted', true, `id=${createdStateId}`);
        } catch (err) {
          record('11', 'test state hard-deleted', false, (err as Error).message);
        }
      }
      if (createdSkillId) {
        try {
          await hardDeleteSkill(createdSkillId);
          record('11', 'test skill hard-deleted', true, `id=${createdSkillId}`);
        } catch (err) {
          record('11', 'test skill hard-deleted', false, (err as Error).message);
        }
      }
      if (createdLanguageId) {
        try {
          await hardDeleteLanguage(createdLanguageId);
          record('11', 'test language hard-deleted', true, `id=${createdLanguageId}`);
        } catch (err) {
          record('11', 'test language hard-deleted', false, (err as Error).message);
        }
      }
      if (createdEducationLevelId) {
        try {
          await hardDeleteEducationLevel(createdEducationLevelId);
          record('11', 'test education level hard-deleted', true, `id=${createdEducationLevelId}`);
        } catch (err) {
          record('11', 'test education level hard-deleted', false, (err as Error).message);
        }
      }
      // Document must go before document_type (FK dependency).
      if (createdDocumentId) {
        try {
          await hardDeleteDocument(createdDocumentId);
          record('11', 'test document hard-deleted', true, `id=${createdDocumentId}`);
        } catch (err) {
          record('11', 'test document hard-deleted', false, (err as Error).message);
        }
      }
      if (createdDocumentTypeId) {
        try {
          await hardDeleteDocumentType(createdDocumentTypeId);
          record(
            '11',
            'test document_type hard-deleted',
            true,
            `id=${createdDocumentTypeId}`
          );
        } catch (err) {
          record(
            '11',
            'test document_type hard-deleted',
            false,
            (err as Error).message
          );
        }
      }
      if (createdDesignationId) {
        try {
          await hardDeleteDesignation(createdDesignationId);
          record(
            '11',
            'test designation hard-deleted',
            true,
            `id=${createdDesignationId}`
          );
        } catch (err) {
          record(
            '11',
            'test designation hard-deleted',
            false,
            (err as Error).message
          );
        }
      }
      if (createdSpecializationId) {
        try {
          await hardDeleteSpecialization(createdSpecializationId);
          record(
            '11',
            'test specialization hard-deleted',
            true,
            `id=${createdSpecializationId}`
          );
        } catch (err) {
          record(
            '11',
            'test specialization hard-deleted',
            false,
            (err as Error).message
          );
        }
      }
      // Batch-3: learning goals, social medias, sub-categories, categories.
      // Sub-category MUST go before category (FK sub_categories.category_id → categories).
      if (createdLearningGoalId) {
        try {
          await hardDeleteLearningGoal(createdLearningGoalId);
          record('11', 'test learning goal hard-deleted', true, `id=${createdLearningGoalId}`);
        } catch (err) {
          record('11', 'test learning goal hard-deleted', false, (err as Error).message);
        }
      }
      if (createdSocialMediaId) {
        try {
          await hardDeleteSocialMedia(createdSocialMediaId);
          record('11', 'test social media hard-deleted', true, `id=${createdSocialMediaId}`);
        } catch (err) {
          record('11', 'test social media hard-deleted', false, (err as Error).message);
        }
      }
      if (createdSubCategoryId) {
        try {
          await hardDeleteSubCategory(createdSubCategoryId);
          record(
            '11',
            'test sub-category hard-deleted (incl. translations)',
            true,
            `id=${createdSubCategoryId}`
          );
        } catch (err) {
          record(
            '11',
            'test sub-category hard-deleted (incl. translations)',
            false,
            (err as Error).message
          );
        }
      }
      if (createdCategoryId) {
        try {
          await hardDeleteCategory(createdCategoryId);
          record(
            '11',
            'test category hard-deleted (incl. translations)',
            true,
            `id=${createdCategoryId}`
          );
        } catch (err) {
          record(
            '11',
            'test category hard-deleted (incl. translations)',
            false,
            (err as Error).message
          );
        }
      }
      if (createdUserId) {
        try {
          await softDeleteUser(createdUserId);
          record('11', 'harness user soft-deleted', true, `id=${createdUserId}`);
        } catch (err) {
          record('11', 'harness user soft-deleted', false, (err as Error).message);
        }
      }
      if (firstJti) {
        try {
          await redisRevoked.remove(firstJti);
          record('11', 'redis revoked entry removed (no-op if absent)', true, `jti=${firstJti}`);
        } catch (err) {
          record('11', 'redis revoked entry removed', false, (err as Error).message);
        }
      }
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closePool();
    await closeRedis();
  }

  // ─── Summary ───────────────────────────────────────────
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
    console.log('  Phase 2 verdict: \x1b[32mALL PHASE 2 MASTER DATA CHECKS PASSED ✓\x1b[0m');
  }
};

main().catch((err) => {
  console.error('\n\x1b[31m✗ fatal:\x1b[0m', err);
  process.exitCode = 1;
  closePool().catch(() => undefined);
  closeRedis().catch(() => undefined);
});
