# Phase 2 — Master Data Management

Phase 2 layers the **reference / taxonomy tables** the rest of the product hangs off of: states, cities, skills, languages, education levels, document types, documents, designations, specializations, learning goals, social medias, categories, and sub-categories. Phase 1 already delivered `countries`; phase 2 treats that as the anchor for the geography join tree. Parent-child relationships in the batch: `document_types → documents` (FK), `categories → sub_categories` (FK), plus per-language translation sub-resources on both `categories` and `sub_categories`.

All phase 2 routes:

- require a valid bearer token (Phase 1 JWT, `authenticate` middleware),
- are CRUD + soft-delete + restore — shape identical to `/api/v1/countries`,
- return the standard envelope (`{ success, message, data, meta? }`),
- and call Postgres `udf_*` functions exclusively — no raw SQL in the service layer (the single exception is the icon / image setters for skill, specialization, learning-goal, social-media, category, and sub-category, which write `icon_url`/`image_url` directly because the update UDF signatures intentionally exclude these columns).

← [Phase 1 walkthrough](../phase%201%20-%20role%20based%20user%20management/10%20-%20walkthrough%20and%20index.md) · **Next →** [01 states](01%20-%20states.md)

---

## 1. The thirteen resources

| # | URL | Permission code | DB table | List UDF | Mutation UDFs |
|---|---|---|---|---|---|
| 01 | `/api/v1/states` | `state` | `states` | `udf_getstates` | `udf_states_{insert,update,delete,restore}` |
| 02 | `/api/v1/cities` | `city` | `cities` | `udf_getcities` | `udf_cities_{insert,update,delete,restore}` |
| 03 | `/api/v1/skills` | `skill` | `skills` | `udf_get_skills` | `udf_skills_{insert,update,delete,restore}` |
| 04 | `/api/v1/languages` | `language` | `languages` | `udf_get_languages` | `udf_languages_{insert,update,delete,restore}` |
| 05 | `/api/v1/education-levels` | `education_level` | `education_levels` | `udf_get_education_levels` | `udf_education_levels_{insert,update,delete,restore}` |
| 07 | `/api/v1/document-types` | `document_type` | `document_types` | `udf_get_document_types` | `udf_document_types_{insert,update,delete,restore}` |
| 08 | `/api/v1/documents` | `document` | `documents` | `udf_get_documents` | `udf_documents_{insert,update,delete,restore}` |
| 09 | `/api/v1/designations` | `designation` | `designations` | `udf_get_designations` | `udf_designations_{insert,update,delete,restore}` |
| 10 | `/api/v1/specializations` | `specialization` | `specializations` | `udf_get_specializations` | `udf_specializations_{insert,update,delete,restore}` |
| 11 | `/api/v1/learning-goals` | `learning_goal` | `learning_goals` | `udf_get_learning_goals` | `udf_learning_goals_{insert,update,delete,restore}` |
| 12 | `/api/v1/social-medias` | `social_media` | `social_medias` | `udf_get_social_medias` | `udf_social_medias_{insert,update,delete,restore}` |
| 13 | `/api/v1/categories` | `category` | `categories` + `category_translations` | `udf_get_categories` | `udf_categories_{insert,update,delete,restore}` (combined parent+translation insert) |
| 14 | `/api/v1/sub-categories` | `sub_category` | `sub_categories` + `sub_category_translations` | `udf_get_sub_categories` | `udf_sub_categories_{insert,update,delete,restore}` (combined parent+translation insert) |

URLs are **kebab-case**, permission codes are **snake_case** (`education_level`, `learning_goal`, `social_media`, `sub_category` — not camelCase and not kebab-case) because they match the DB table name and the `.` separator in `<code>.read` is what the authorize middleware parses.

> **File uploads.** Six phase-2 resources support Bunny-backed image uploads inline on both `POST` (create) and `PATCH` (update) — no separate icon/image endpoints. Send `multipart/form-data` with the text fields plus the optional file slot(s):
> - `/skills` — `icon` slot — [§3.3](03%20-%20skills.md#33-post-apiv1skills) / [§3.4](03%20-%20skills.md#34-patch-apiv1skillsid)
> - `/specializations` — `icon` slot — [§10.3](10%20-%20specializations.md#103-post-apiv1specializations) / [§10.4](10%20-%20specializations.md#104-patch-apiv1specializationsid)
> - `/learning-goals` — `icon` slot — [§11.3](11%20-%20learning-goals.md#113-post-apiv1learning-goals) / [§11.4](11%20-%20learning-goals.md#114-patch-apiv1learning-goalsid)
> - `/social-medias` — `icon` slot — [§12.3](12%20-%20social-medias.md#123-post-apiv1social-medias) / [§12.4](12%20-%20social-medias.md#124-patch-apiv1social-mediasid)
> - `/categories` — `icon` + `image` slots — [§13.3](13%20-%20categories.md#133-post-apiv1categories) / [§13.4](13%20-%20categories.md#134-patch-apiv1categoriesid)
> - `/sub-categories` — `icon` + `image` slots — [§14.3](14%20-%20sub-categories.md#143-post-apiv1sub-categories) / [§14.4](14%20-%20sub-categories.md#144-patch-apiv1sub-categoriesid)
>
> Every upload enforces the same contract: **PNG / JPEG / WebP / SVG, ≤ 100 KB raw, always re-encoded to WebP, ≤ 100 KB final**. Icons fit a 256 × 256 box; hero `image` slots fit a 1024 × 1024 box. Storage keys are deterministic (`<resource>/<icons|images>/<id>.webp`), and on replace the previous Bunny object is deleted **before** the new PUT to avoid orphans — delete failures are logged at WARN and do **not** block the new upload. On `PATCH`, set `iconAction=delete` (or `imageAction=delete`) to clear the image without uploading a replacement.
>
> **Translation sub-resources.** Categories and sub-categories each expose a nested translation sub-resource (`/:id/translations`, `/:id/translations/:tid`) covering list/get/create/patch/delete/restore of per-language rows. Create also supports a **combined parent + first-translation insert** via an optional `translation` block in the main `POST` body — committed atomically by the UDF, returning both ids. See [§13.3](13%20-%20categories.md#133-post-apiv1categories) and [§14.3](14%20-%20sub-categories.md#143-post-apiv1sub-categories).

## 2. Permissions — auto-seeded, not hand-written

Phase 1 already ships a helper UDF:

```
udf_auto_create_resource_permissions(
  p_resource     TEXT,
  p_created_by   BIGINT,
  p_include_own  BOOLEAN,   -- keep FALSE for master data
  p_start_order  INTEGER
)
```

It inserts five permissions per resource — `<resource>.read`, `.create`, `.update`, `.delete`, `.restore` — and then grants them to the built-in roles according to role level:

| Role | Level | What it gets |
|---|---|---|
| Super Admin | 0 | **All five** permissions for every resource. |
| Admin | 1 | `read`, `create`, `update`, `restore` — deliberately **no `delete`**. |
| Everyone else | 2+ | Nothing — opt in explicitly via `/role-permissions` or `/user-permissions`. |

The seed file that runs this for phase 2 lives at `phase-02-master-data-management/06_seed_permissions.sql` and calls the helper for each of the thirteen resources with a stable `p_start_order` so the Manage Permissions UI stays grouped. That works out to **65 permission rows** in total (13 resources × 5 actions).

> **Consequence.** A freshly-provisioned Super Admin can do anything on every phase 2 resource with no extra config. A freshly-provisioned Admin can manage everything *except* hard-delete — which for soft-delete-only tables means they can still `POST /:id/restore` and `PATCH` the row, they just can't flip `is_deleted = TRUE`.

## 3. List contract

Every `GET /api/v1/<resource>` accepts this set of common params:

| Param | Type | Notes |
|---|---|---|
| `pageIndex`, `pageSize` | int | Standard pagination. `pageSize` is capped at 100 server-side. |
| `searchTerm` | string | Runs an `ILIKE` across the resource's primary text columns (name + whatever the UDF indexes). |
| `isActive`, `isDeleted` | bool | Accept `true|false|1|0|yes|no`, case-insensitive. On joined lists (states, cities) these map to the **leaf** layer by default — use the layer-specific params below to target country/state independently. |
| `sortColumn` | enum | Whitelisted per-resource. Unknown values → `400 VALIDATION_ERROR`. |
| `sortDirection` | enum | `ASC|DESC|asc|desc`. |

Per-resource filters and the list of sort columns are documented in each module doc.

> **Sorting joined lists.** `/states` and `/cities` split sorting between tables via a second `sortTable` param — e.g. `sortColumn=name&sortTable=country` sorts by `country_name` while still returning states.

## 4. Error envelope

All phase 2 routes use the same envelope as phase 1 — see [00 — overview §3](../phase%201%20-%20role%20based%20user%20management/00%20-%20overview.md#3-error-catalog). The common codes are:

| HTTP | code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod rejected the query/body/params. `details[]` is the `issues` array. |
| 400 | `BAD_REQUEST` | Business rule violation (e.g. restoring a non-deleted row). |
| 401 | `UNAUTHORIZED` | Missing / expired bearer token. |
| 403 | `FORBIDDEN` | Authenticated but no `<resource>.<action>` permission. |
| 404 | `NOT_FOUND` | No row with that id. |
| 409 | `DUPLICATE_ENTRY` | Unique-constraint clash (e.g. same `iso_code` on a language). |

## 6. Active-flag defaults

All phase-2 resources default `isActive` to **`false`** at the API layer on `POST` when the body omits the flag. This is a safety net — no resource is live until explicitly activated by a caller. Pass `isActive: true` explicitly on create if you want the row immediately active.

## 7. Postman environment

Every endpoint in this phase is documented as a Postman request using two **environment variables** — set them once on your Postman environment and every request in the collection will resolve them automatically:

| Variable | Example value | Where it is used |
|---|---|---|
| `baseUrl` | `http://localhost:3000` (local) · `https://api.growupmore.com` (prod) | Every request URL is written as `{{baseUrl}}/api/v1/...`. |
| `accessToken` | a Super Admin JWT, minted once per session via `POST {{baseUrl}}/api/v1/auth/login` | Every request sends `Authorization: Bearer {{accessToken}}`. |

**Minting an access token** — run this request once and copy `data.accessToken` from the response into the `accessToken` environment variable (or wire it up as a Postman "Tests" script that stores `pm.response.json().data.accessToken`):

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/auth/login` |
| Headers | `Content-Type: application/json` |
| Body | `{ "email": "superadmin@growupmore.com", "password": "<password>" }` |

A machine-readable Postman v2.1 collection is also available at `api/docs/postman/phase-2.postman_collection.json` — import it and the folder tree will mirror the resources in this phase (states / cities / skills / languages / education-levels / document-types / documents / designations / specializations / learning-goals / social-medias / categories / sub-categories), each request pre-populated with headers, body, and example responses.

## 8. Where to look next

| Topic | File |
|---|---|
| States (country join) | [01 states](01%20-%20states.md) |
| Cities (state + country join) | [02 cities](02%20-%20cities.md) |
| Skills (+ icon upload) | [03 skills](03%20-%20skills.md) |
| Languages | [04 languages](04%20-%20languages.md) |
| Education levels | [05 education-levels](05%20-%20education-levels.md) |
| End-to-end walkthrough | [06 walkthrough and index](06%20-%20walkthrough%20and%20index.md) |
| Document types | [07 document-types](07%20-%20document-types.md) |
| Documents (document-type join) | [08 documents](08%20-%20documents.md) |
| Designations | [09 designations](09%20-%20designations.md) |
| Specializations (+ icon upload) | [10 specializations](10%20-%20specializations.md) |
| Learning goals (+ icon upload) | [11 learning-goals](11%20-%20learning-goals.md) |
| Social medias (+ icon upload) | [12 social-medias](12%20-%20social-medias.md) |
| Categories (+ icon + image + translations) | [13 categories](13%20-%20categories.md) |
| Sub-categories (+ icon + image + translations, category-joined) | [14 sub-categories](14%20-%20sub-categories.md) |
| Postman collection (v2.1) | `api/docs/postman/phase-2.postman_collection.json` |
