# Phase 2 — Walkthrough and Index

End-to-end walkthrough for the thirteen phase-2 master-data resources — from "log in as Super Admin" through creating a country → state → city chain, seeding a document_type → document pair, building a category → sub-category tree with SEO-rich translations, and asserting the full 65-row auto-seeded permission set is in place.

← [05 education-levels](05%20-%20education-levels.md) · **Next →** [07 document-types](07%20-%20document-types.md) · [Phase 1 walkthrough](../phase%201%20-%20role%20based%20user%20management/10%20-%20walkthrough%20and%20index.md)

---

## 1. Prerequisites

- API running locally at `http://localhost:3000` (see repo `README.md`).
- Phase 1 seed data applied — the Super Admin user exists and has a password.
- Phase 2 permission seed applied — `phase-02-master-data-management/06_seed_permissions.sql` has been run, which calls `udf_auto_create_resource_permissions` for each of `state`, `city`, `skill`, `language`, `education_level`, `document_type`, `document`, `designation`, `specialization`, `learning_goal`, `social_media`, `category`, and `sub_category` (65 permission rows total).

Grab an access token once and keep it in an env var:

```bash
ACCESS_TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@growupmore.com","password":"<password>"}' \
  | jq -r '.data.accessToken')
```

Every `curl` below assumes `-H "Authorization: Bearer $ACCESS_TOKEN"` (omitted for brevity).

---

## 2. The happy path — India → Maharashtra → Mumbai

**Step 1.** Make sure India exists (it should, from phase 1 seed):

```bash
curl "http://localhost:3000/api/v1/countries?iso3=IND"
```

If it doesn't, create it — see [phase 1 § 5.3](../phase%201%20-%20role%20based%20user%20management/05%20-%20countries.md#53-post-apiv1countries).

**Step 2.** Create Maharashtra under India:

```bash
curl -X POST http://localhost:3000/api/v1/states \
  -H "Content-Type: application/json" \
  -d '{
    "countryId": 1,
    "name": "Maharashtra",
    "iso3": "MH",
    "languages": ["Marathi", "Hindi", "English"],
    "isActive": true
  }'
```

Grab the returned `id` — call it `STATE_ID`.

**Step 3.** Create Mumbai under Maharashtra:

```bash
curl -X POST http://localhost:3000/api/v1/cities \
  -H "Content-Type: application/json" \
  -d "{
    \"stateId\": $STATE_ID,
    \"name\": \"Mumbai\",
    \"phoneCode\": \"022\",
    \"timezone\": \"Asia/Kolkata\",
    \"isActive\": true
  }"
```

The response echoes the full tree — city → state → country — so you can render "Mumbai, Maharashtra, India" from a single call.

**Step 4.** Drill back down from the country:

```bash
curl "http://localhost:3000/api/v1/cities?countryIso3=IND&pageSize=100"
```

All Indian cities are returned, each carrying its nested state and nested country.

---

## 3. Creating the three flat resources

**Skill**

```bash
curl -X POST http://localhost:3000/api/v1/skills \
  -H "Content-Type: application/json" \
  -d '{
    "name": "TypeScript",
    "category": "language",
    "description": "Typed superset of JavaScript that compiles to plain JS.",
    "isActive": true
  }'
```

**Language**

```bash
curl -X POST http://localhost:3000/api/v1/languages \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hindi",
    "nativeName": "हिन्दी",
    "isoCode": "hi",
    "script": "Devanagari",
    "isActive": true
  }'
```

**Education level**

```bash
curl -X POST http://localhost:3000/api/v1/education-levels \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bachelor'\''s Degree",
    "levelOrder": 60,
    "levelCategory": "undergraduate",
    "abbreviation": "BA/BSc",
    "isActive": true
  }'
```

**Designation**

```bash
curl -X POST http://localhost:3000/api/v1/designations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Senior Lecturer",
    "code": "sr_lect",
    "level": 5,
    "levelBand": "senior",
    "description": "Experienced instructor; leads curriculum for a given track.",
    "isActive": true
  }'
```

**Specialization**

```bash
curl -X POST http://localhost:3000/api/v1/specializations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Python",
    "category": "technology",
    "description": "General-purpose language popular for scripting, data, and backend.",
    "isActive": true
  }'
```

> `iconUrl` is never accepted on create or update. After the row exists, upload the icon separately (see [§3a](#3a-uploading-a-specialization-icon)).

---

## 3a. Creating the document-type → document parent/child pair

Unlike the flat resources above, `documents` has a FK to `document_types`. Create the parent first, then a child:

```bash
# 1. Parent
DOC_TYPE_ID=$(curl -s -X POST http://localhost:3000/api/v1/document-types \
  -H "Content-Type: application/json" \
  -d '{ "name": "Identity Proof", "description": "Government-issued documents that verify a person'\''s identity." }' \
  | jq -r '.data.id')

# 2. Child — note the nested documentType block in the response
curl -X POST http://localhost:3000/api/v1/documents \
  -H "Content-Type: application/json" \
  -d "{
    \"documentTypeId\": $DOC_TYPE_ID,
    \"name\": \"Aadhar Card\",
    \"description\": \"Unique 12-digit identity issued by UIDAI.\",
    \"isActive\": true
  }"
```

A `GET /api/v1/documents?documentTypeId=$DOC_TYPE_ID` returns every document under that type, each with its full nested `documentType` block.

---

## 3b. Uploading a specialization icon

`POST /api/v1/specializations/:id/icon` was the first multipart endpoint in phase 2 — and the pattern it established is now reused across learning-goals, social-medias, categories, and sub-categories. Accepted input: PNG / JPEG / WebP / SVG, ≤ 100 KB raw. The server re-encodes to WebP (max 256 × 256 box, final byte cap 100 KB) and writes to Bunny CDN under the deterministic key `specializations/icons/<id>.webp`:

```bash
curl -X POST "http://localhost:3000/api/v1/specializations/$SPEC_ID/icon" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@./python.png"
```

Replacing the icon hits the same deterministic key, so the CDN URL stays stable. Clearing the icon is `DELETE /api/v1/specializations/:id/icon`.

See [10 specializations §10.7](10%20-%20specializations.md#107-post-apiv1specializationsidicon) for the full contract (quality loop, oversize rejection, orphan cleanup).

---

## 3c. Creating a learning goal and a social media

Two more flat resources added in phase-2 batch 3. Both expose the same `POST /:id/icon` / `DELETE /:id/icon` pattern as specializations.

**Learning goal**

```bash
curl -X POST http://localhost:3000/api/v1/learning-goals \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Become a Full Stack Developer",
    "description": "End-to-end web development: frontend, backend, and infra.",
    "displayOrder": 10,
    "isActive": true
  }'
```

Then attach an icon:

```bash
curl -X POST "http://localhost:3000/api/v1/learning-goals/$LG_ID/icon" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@./fullstack.png"
```

**Social media platform**

```bash
curl -X POST http://localhost:3000/api/v1/social-medias \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GitHub",
    "code": "github",
    "baseUrl": "https://github.com/",
    "placeholder": "username",
    "platformType": "code",
    "displayOrder": 20,
    "isActive": true
  }'
```

`code` is unique in addition to `name`. `platformType` must be one of `social`, `professional`, `code`, `video`, `blog`, `portfolio`, `messaging`, `website`, `other`. See [11 learning-goals](11%20-%20learning-goals.md) and [12 social-medias](12%20-%20social-medias.md) for the full contract.

---

## 3d. Building a category → sub-category tree with translations

The last two phase-2 resources are hierarchical: `sub_categories` has an FK to `categories`, and both carry a per-language translation table (name, description, full SEO block — meta tags, Open Graph, Twitter Card, JSON-LD, canonical URL, robots directive).

Both `POST` endpoints accept an optional `translation` block that is committed atomically with the parent row in a single UDF call. That means you can ship a category + its English translation in one request, then add Spanish later via the translation sub-resource.

**Step 1. Create the category with an English translation in a single call.**

```bash
CAT_ID=$(curl -s -X POST http://localhost:3000/api/v1/categories \
  -H "Content-Type: application/json" \
  -d '{
    "code": "PROG",
    "slug": "programming",
    "displayOrder": 10,
    "isActive": true,
    "translation": {
      "languageId": 1,
      "name": "Programming",
      "description": "Software engineering, algorithms, and development practices.",
      "metaTitle": "Programming courses",
      "metaDescription": "Learn to build software: JavaScript, Python, systems, and more.",
      "ogType": "website",
      "twitterCard": "summary_large_image",
      "robotsDirective": "index,follow"
    }
  }' \
  | jq -r '.data.id')
```

**Step 2. Attach a category icon and hero image.**

```bash
curl -X POST "http://localhost:3000/api/v1/categories/$CAT_ID/icon" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@./programming-icon.png"

curl -X POST "http://localhost:3000/api/v1/categories/$CAT_ID/image" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@./programming-hero.jpg"
```

`/icon` fits a 256 × 256 box; `/image` fits a 1024 × 1024 box. Both end up as WebP ≤ 100 KB at stable storage keys (`categories/icons/<id>.webp`, `categories/images/<id>.webp`).

**Step 3. Add a Spanish translation via the sub-resource.**

```bash
curl -X POST "http://localhost:3000/api/v1/categories/$CAT_ID/translations" \
  -H "Content-Type: application/json" \
  -d '{
    "languageId": 2,
    "name": "Programación",
    "description": "Ingeniería de software, algoritmos y prácticas de desarrollo.",
    "metaTitle": "Cursos de programación"
  }'
```

**Step 4. Create a sub-category under the category, also with a combined translation.**

```bash
SUBCAT_ID=$(curl -s -X POST http://localhost:3000/api/v1/sub-categories \
  -H "Content-Type: application/json" \
  -d "{
    \"categoryId\": $CAT_ID,
    \"code\": \"PY\",
    \"slug\": \"python\",
    \"displayOrder\": 10,
    \"isActive\": true,
    \"translation\": {
      \"languageId\": 1,
      \"name\": \"Python\",
      \"description\": \"General-purpose programming language popular for data and backend.\",
      \"metaTitle\": \"Python courses\"
    }
  }" \
  | jq -r '.data.id')
```

Note that `code` and `slug` are unique **per parent** on sub-categories (`uq_sub_categories_category_code`, `uq_sub_categories_category_slug`) — not globally. `PATCH /:id` can change `categoryId`, which re-parents the row and re-checks the uniqueness constraint against the new parent.

**Step 5. Drill back down.**

```bash
curl "http://localhost:3000/api/v1/sub-categories?categoryId=$CAT_ID&pageSize=50"
```

Every sub-category under the programming category comes back in display-order. See [13 categories](13%20-%20categories.md) and [14 sub-categories](14%20-%20sub-categories.md) for the full field catalogue and error contracts.

---

## 3e. The Bunny image contract in one place

Five phase-2 resources expose Bunny-backed image routes — specializations, learning-goals, social-medias, categories, and sub-categories. They share the exact same contract, implemented by the `bunny-image-pipeline` helpers (`replaceImage`, `clearImage`):

1. **Input**: `multipart/form-data`, single `file` field, PNG / JPEG / WebP / SVG, ≤ 100 KB raw (multer rejects anything else before `sharp` ever runs).
2. **Re-encode**: always to WebP. Icons fit a 256 × 256 box; category/sub-category `/image` routes fit a 1024 × 1024 box. `sharp` runs a quality-reduction loop (80 → 40, step 10) until the output fits the 100 KB cap.
3. **Storage key**: deterministic — `<resource>/<icons|images>/<id>.webp`. Re-uploads clobber the same object so CDN URLs stay stable.
4. **On replace**: the **previous** Bunny object (both the deterministic key and whatever is currently in `icon_url` / `image_url`) is deleted **before** the new PUT, so there are no orphans.
5. **Log-and-continue**: delete failures against Bunny are logged at WARN and **do not** block the new upload or the column update. This is the single most important operational rule — a transient Bunny 5xx on stale cleanup must never cost a user their new upload.
6. **Clear routes** (`DELETE /:id/icon`, `DELETE /:id/image`) best-effort delete the current object and then set the column to `NULL`.
7. **Oversize after re-encode**: if the WebP still exceeds 100 KB at quality 40, the route returns **400 BAD_REQUEST**. This only happens for genuinely heavy input images, e.g. a huge photographic JPEG.

---

## 4. Verifying the permission auto-seed

Phase 2 does **not** add a new permissions catalogue file by hand — the seed script calls `udf_auto_create_resource_permissions` thirteen times, once per resource, producing a total of **65 permission rows**. You can confirm the result in three ways:

### 4a. Check the catalogue

```bash
curl "http://localhost:3000/api/v1/permissions?searchTerm=state.&pageSize=50"
curl "http://localhost:3000/api/v1/permissions?searchTerm=city.&pageSize=50"
curl "http://localhost:3000/api/v1/permissions?searchTerm=skill.&pageSize=50"
curl "http://localhost:3000/api/v1/permissions?searchTerm=language.&pageSize=50"
curl "http://localhost:3000/api/v1/permissions?searchTerm=education_level.&pageSize=50"
curl "http://localhost:3000/api/v1/permissions?searchTerm=document_type.&pageSize=50"
curl "http://localhost:3000/api/v1/permissions?searchTerm=document.&pageSize=50"
curl "http://localhost:3000/api/v1/permissions?searchTerm=designation.&pageSize=50"
curl "http://localhost:3000/api/v1/permissions?searchTerm=specialization.&pageSize=50"
curl "http://localhost:3000/api/v1/permissions?searchTerm=learning_goal.&pageSize=50"
curl "http://localhost:3000/api/v1/permissions?searchTerm=social_media.&pageSize=50"
curl "http://localhost:3000/api/v1/permissions?searchTerm=category.&pageSize=50"
curl "http://localhost:3000/api/v1/permissions?searchTerm=sub_category.&pageSize=50"
```

Each query must return exactly **five** rows — `read`, `create`, `update`, `delete`, `restore`.

### 4b. Check Super Admin has all of them

Super Admin is role level `0`, so the auto-grant gives it every new permission.

```bash
curl "http://localhost:3000/api/v1/role-permissions?roleName=super_admin&resource=state"
```

Should return all five `state.*` entries.

### 4c. Check Admin has all of them except `delete`

Admin is role level `1`; the auto-grant gives it everything **except `.delete`**.

```bash
curl "http://localhost:3000/api/v1/role-permissions?roleName=admin&resource=state"
```

Should return four entries: `state.read`, `state.create`, `state.update`, `state.restore`. No `state.delete`.

Repeat the checks for `city`, `skill`, `language`, `education_level`, `document_type`, `document`, `designation`, `specialization`, `learning_goal`, `social_media`, `category`, and `sub_category`.

---

## 5. Soft delete + restore round-trip

Pick any row created above and prove the soft-delete semantics work:

```bash
curl -X DELETE http://localhost:3000/api/v1/cities/$CITY_ID
curl "http://localhost:3000/api/v1/cities?isDeleted=true&pageSize=100"   # the row is here
curl "http://localhost:3000/api/v1/cities?isDeleted=false&pageSize=100"  # the row is NOT here
curl -X POST  http://localhost:3000/api/v1/cities/$CITY_ID/restore
curl "http://localhost:3000/api/v1/cities?isDeleted=false&pageSize=100"  # the row is back
```

As **Super Admin** every step succeeds. As **Admin** the `DELETE` step returns `403 FORBIDDEN` — that is the point of the auto-seed's `include_own=false, skip delete for admin` behaviour.

---

## 6. Automated end-to-end verification

The equivalent of the above walkthrough is codified in `api/scripts/verify-master-data.ts` — a standalone Node script that:

1. boots the real Express app against Supabase + Redis,
2. logs in as Super Admin to mint a JWT,
3. walks through every route of every phase 2 resource (list, get, create, patch, delete, restore),
4. asserts response shape, status codes, and envelope integrity,
5. cleans up after itself.

Run it with:

```bash
cd api
npx tsx --tsconfig tsconfig.scripts.json scripts/verify-master-data.ts
```

A successful run ends with `ALL PHASE 2 MASTER DATA CHECKS PASSED ✓` and exit code 0. The current baseline is **175 assertions across 15 sections** — setup + auth + six flat/joined modules (states/cities/skills/languages/education-levels/document-types/documents/designations) + specializations with icon upload, and **batch 3**: learning-goals (CRUD + icon happy/replace/oversize/clear), social-medias (CRUD + icon happy/replace/oversize/clear), categories (CRUD + combined translation insert + icon + image + translation sub-resource + restore), and sub-categories (CRUD + combined translation insert + reparenting + icon + image + translation sub-resource + restore). See the script itself for the individual assertions.

> **Rate-limit bypass for the script.** `verify-master-data.ts` fires ~175 requests in a few seconds, which comfortably exceeds the default `RATE_LIMIT_MAX=100/15m`. The script sets `process.env.SKIP_GLOBAL_RATE_LIMIT = '1'` **before** any `src/` import so the `skip` function on `globalRateLimiter` and `authRateLimiter` turns both into no-ops for the run. Never set this flag in production.

---

## 7. Index

| File | Topic |
|---|---|
| [00 overview](00%20-%20overview.md) | How phase 2 fits together; permission auto-seed contract. |
| [01 states](01%20-%20states.md) | `/api/v1/states` — country-joined list + CRUD + restore. |
| [02 cities](02%20-%20cities.md) | `/api/v1/cities` — state + country joined list + CRUD + restore. |
| [03 skills](03%20-%20skills.md) | `/api/v1/skills` — flat taxonomy with category enum. |
| [04 languages](04%20-%20languages.md) | `/api/v1/languages` — ISO 639 code, script, native name. |
| [05 education-levels](05%20-%20education-levels.md) | `/api/v1/education-levels` — ordered ladder with category enum. |
| **06 walkthrough and index** *(you are here)* | End-to-end happy path + verify script entry point. |
| [07 document-types](07%20-%20document-types.md) | `/api/v1/document-types` — flat parent catalogue. |
| [08 documents](08%20-%20documents.md) | `/api/v1/documents` — document-type-joined list with parent/child guard. |
| [09 designations](09%20-%20designations.md) | `/api/v1/designations` — job title taxonomy with level + level_band. |
| [10 specializations](10%20-%20specializations.md) | `/api/v1/specializations` — category enum + multipart WebP icon upload. |
| [11 learning-goals](11%20-%20learning-goals.md) | `/api/v1/learning-goals` — flat display-ordered list + WebP icon upload. |
| [12 social-medias](12%20-%20social-medias.md) | `/api/v1/social-medias` — platform_type enum + WebP icon upload. |
| [13 categories](13%20-%20categories.md) | `/api/v1/categories` — translations sub-resource + combined parent+translation insert + icon + image uploads. |
| [14 sub-categories](14%20-%20sub-categories.md) | `/api/v1/sub-categories` — category-joined with reparenting + translations sub-resource + combined insert + icon + image uploads. |
