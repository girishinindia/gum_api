# Phase 2 — Walkthrough and Index

End-to-end walkthrough for phase-2 master data management — from logging in as Super Admin through creating a geography chain (country → state → city), seeding leaf resources (skills, languages, etc.), and verifying the 65-row auto-seeded permission set. All requests use the Postman collection and environment variables established in [§7 of 00 - overview](00%20-%20overview.md#7-postman-environment).

← [05 education-levels](05%20-%20education-levels.md) · **Next →** [07 document-types](07%20-%20document-types.md) · [Phase 1 walkthrough](../phase%201%20-%20role%20based%20user%20management/10%20-%20walkthrough%20and%20index.md) · [Phase 3 walkthrough](../phase%203%20-%20branch%20management/04%20-%20walkthrough%20and%20index.md)

---

## 1. Prerequisites

- API running locally at `http://localhost:3000` (see repo `README.md`).
- Phase 1 seed data applied — the Super Admin user exists and has a password.
- Phase 2 permission seed applied — `phase-02-master-data-management/06_seed_permissions.sql` has been run, producing **65 permission rows** (13 resources × 5 actions).
- Postman with `baseUrl` and `accessToken` environment variables configured (see [§7 in 00 - overview](00%20-%20overview.md#7-postman-environment)).
- Phase 2 Postman collection imported: `api/docs/postman/phase-2.postman_collection.json`.

---

## 2. Mint an access token

Use the **Setup — Mint access token** folder in the Postman collection:

| Step | Request | Expected |
|---|---|---|
| 1 | `POST {{baseUrl}}/api/v1/auth/login` with Super Admin credentials | `201` with `data.accessToken` |
| 2 | Copy `data.accessToken` and paste it into the `accessToken` environment variable | Can now run any authenticated request |

---

## 3. The happy path — India → Maharashtra → Mumbai

This sequence builds the geographical join tree that underpins all phase-2 resources.

### Step 1 — Verify India exists

India should exist from phase-1 seed. Verify with:

| Request | Doc |
|---|---|
| `GET {{baseUrl}}/api/v1/countries?iso3=IND&pageSize=1` | [Phase 1 — Countries §1.1](../phase%201%20-%20role%20based%20user%20management/05%20-%20countries.md#11-get-apiv1countries) |

Capture the returned `id` (typically `1`) as `COUNTRY_ID` in Postman.

### Step 2 — Create Maharashtra under India

| Step | Request | Doc |
|---|---|---|
| 1 | `POST {{baseUrl}}/api/v1/states` with body: `{ "countryId": 1, "name": "Maharashtra", "iso3": "MH", "languages": ["Marathi", "Hindi", "English"], "isActive": true }` | [01 states §1.3](01%20-%20states.md#13-post-apiv1states) |
| 2 | Capture returned `data.id` as `STATE_ID` in environment | — |

### Step 3 — Create Mumbai under Maharashtra

| Step | Request | Doc |
|---|---|---|
| 1 | `POST {{baseUrl}}/api/v1/cities` with body: `{ "stateId": {{STATE_ID}}, "name": "Mumbai", "phoneCode": "022", "timezone": "Asia/Kolkata", "isActive": true }` | [02 cities §2.3](02%20-%20cities.md#23-post-apiv1cities) |
| 2 | Capture returned `data.id` as `CITY_ID` in environment | — |

The response echoes the full tree — city → state → country — so one call produces a complete "Mumbai, Maharashtra, India" label.

### Step 4 — Drill back down from the country

| Request | Doc | Purpose |
|---|---|---|
| `GET {{baseUrl}}/api/v1/cities?countryIso3=IND&pageSize=100` | [02 cities §2.1](02%20-%20cities.md#21-get-apiv1cities) | List all Indian cities; each carries nested state and country |
| `GET {{baseUrl}}/api/v1/states?countryId=1&pageSize=50` | [01 states §1.1](01%20-%20states.md#11-get-apiv1states) | List all states in India |

---

## 4. Creating flat taxonomy resources

Each of the following leaf resources follows the same CRUD + soft-delete + restore pattern. Use the Postman collection requests under each resource's folder.

| Resource | Create Request | Doc |
|---|---|---|
| Skills | `POST {{baseUrl}}/api/v1/skills` with `{ "name": "TypeScript", "category": "language", "description": "...", "isActive": true }` | [03 skills §3.3](03%20-%20skills.md#33-post-apiv1skills) |
| Languages | `POST {{baseUrl}}/api/v1/languages` with `{ "code": "EN", "name": "English", "nativeName": "English", "rtl": false, "isActive": true }` | [04 languages §4.3](04%20-%20languages.md#43-post-apiv1languages) |
| Education Levels | `POST {{baseUrl}}/api/v1/education-levels` with `{ "code": "HS", "name": "High School", "displayOrder": 1, "isActive": true }` | [05 education-levels §5.3](05%20-%20education-levels.md#53-post-apiv1education-levels) |
| Document Types | `POST {{baseUrl}}/api/v1/document-types` with `{ "name": "Passport", "code": "PASSPORT", "description": "...", "isActive": true }` | [07 document-types §7.3](07%20-%20document-types.md#73-post-apiv1document-types) |
| Designations | `POST {{baseUrl}}/api/v1/designations` with `{ "name": "Software Engineer", "description": "...", "isActive": true }` | [09 designations §9.3](09%20-%20designations.md#93-post-apiv1designations) |
| Specializations | `POST {{baseUrl}}/api/v1/specializations` with `{ "name": "Full Stack", "description": "...", "isActive": true }` | [10 specializations §10.3](10%20-%20specializations.md#103-post-apiv1specializations) |
| Learning Goals | `POST {{baseUrl}}/api/v1/learning-goals` with `{ "name": "Master React", "description": "...", "isActive": true }` | [11 learning-goals §11.3](11%20-%20learning-goals.md#113-post-apiv1learning-goals) |
| Social Medias | `POST {{baseUrl}}/api/v1/social-medias` with `{ "name": "LinkedIn", "code": "LINKEDIN", "isActive": true }` | [12 social-medias §12.3](12%20-%20social-medias.md#123-post-apiv1social-medias) |

Each POST returns a `201 CREATED` with the full row. Capture IDs for later reference if building join tables.

---

## 5. Creating a document under document-type

Documents are the only phase-2 resource with a parent FK (to document_types).

| Step | Request | Doc |
|---|---|---|
| 1 | Ensure a document_type exists (from §4 above, or query `GET {{baseUrl}}/api/v1/document-types`) | [07 document-types §7.1](07%20-%20document-types.md#71-get-apiv1document-types) |
| 2 | Create a document: `POST {{baseUrl}}/api/v1/documents` with `{ "userId": 1, "documentTypeId": 1, "documentNumber": "AB123456", "issuedAt": "2020-01-01", "expiresAt": "2030-01-01", "isActive": true }` | [08 documents §8.3](08%20-%20documents.md#83-post-apiv1documents) |
| 3 | Query `GET {{baseUrl}}/api/v1/documents?userId=1` to list documents for a user | [08 documents §8.1](08%20-%20documents.md#81-get-apiv1documents) |

---

## 6. Creating a category → sub-category tree

Categories and sub-categories form a two-level hierarchy, both with per-language translations.

| Step | Request | Doc |
|---|---|---|
| 1 | Create a category: `POST {{baseUrl}}/api/v1/categories` with `{ "code": "TECH", "slug": "tech", "displayOrder": 1, "isActive": true }` | [13 categories §13.3](13%20-%20categories.md#133-post-apiv1categories) |
| 2 | Capture the returned category `id` as `CATEGORY_ID` | — |
| 3 | Create a sub-category under it: `POST {{baseUrl}}/api/v1/sub-categories` with `{ "categoryId": {{CATEGORY_ID}}, "code": "WEB", "slug": "web", "displayOrder": 1, "isActive": true }` | [14 sub-categories §14.3](14%20-%20sub-categories.md#143-post-apiv1sub-categories) |
| 4 | Query the tree: `GET {{baseUrl}}/api/v1/sub-categories?categoryId={{CATEGORY_ID}}` | [14 sub-categories §14.1](14%20-%20sub-categories.md#141-get-apiv1sub-categories) |

---

## 7. Verifying the auto-seeded permissions

Phase 2 permission seed calls `udf_auto_create_resource_permissions` 13 times, producing 65 rows total. Verify:

| What | Request | Expectation |
|---|---|---|
| All state permissions | `GET {{baseUrl}}/api/v1/permissions?searchTerm=state.&pageSize=50` | 5 rows: `read`, `create`, `update`, `delete`, `restore` |
| All permissions (spot check) | `GET {{baseUrl}}/api/v1/permissions?pageSize=100` | At least 65 rows across the 13 resources |
| Super Admin has all | `GET {{baseUrl}}/api/v1/role-permissions?roleName=super_admin&pageSize=100` | All 65 rows (role level 0 gets everything) |
| Admin has all except delete | `GET {{baseUrl}}/api/v1/role-permissions?roleName=admin&resource=state&pageSize=50` | 4 rows: `read`, `create`, `update`, `restore` (no `delete`) |

---

## 8. Soft-delete and restore lifecycle

All phase-2 resources follow the same pattern:

| Operation | Request | Doc |
|---|---|---|
| Delete a state | `DELETE {{baseUrl}}/api/v1/states/:id` | [01 states §1.5](01%20-%20states.md#15-delete-apiv1statesid) |
| Restore a state | `POST {{baseUrl}}/api/v1/states/:id/restore` | [01 states §1.6](01%20-%20states.md#16-post-apiv1statesidrestore) |
| Query soft-deleted only | `GET {{baseUrl}}/api/v1/states?isDeleted=true` | [01 states §1.1 "Saved examples"](01%20-%20states.md#saved-examples-to-add-in-postman) |
| Get a soft-deleted row by id | `GET {{baseUrl}}/api/v1/states/:id` (where id was deleted) | [01 states §1.2 — returns row with `isDeleted: true`](01%20-%20states.md#12-get-apiv1statesid) |

---

## 9. Endpoint index

Full reference table for all phase-2 routes:

| # | Resource | Method | URL | Permission | Doc |
|---|---|---|---|---|---|
| 1 | States | GET | `{{baseUrl}}/api/v1/states` | `state.read` | [01 §1.1](01%20-%20states.md#11-get-apiv1states) |
| 2 | States | GET | `{{baseUrl}}/api/v1/states/:id` | `state.read` | [01 §1.2](01%20-%20states.md#12-get-apiv1statesid) |
| 3 | States | POST | `{{baseUrl}}/api/v1/states` | `state.create` | [01 §1.3](01%20-%20states.md#13-post-apiv1states) |
| 4 | States | PATCH | `{{baseUrl}}/api/v1/states/:id` | `state.update` | [01 §1.4](01%20-%20states.md#14-patch-apiv1statesid) |
| 5 | States | DELETE | `{{baseUrl}}/api/v1/states/:id` | `state.delete` | [01 §1.5](01%20-%20states.md#15-delete-apiv1statesid) |
| 6 | States | POST | `{{baseUrl}}/api/v1/states/:id/restore` | `state.restore` | [01 §1.6](01%20-%20states.md#16-post-apiv1statesidrestore) |
| 7 | Cities | GET | `{{baseUrl}}/api/v1/cities` | `city.read` | [02 §2.1](02%20-%20cities.md#21-get-apiv1cities) |
| 8 | Cities | GET | `{{baseUrl}}/api/v1/cities/:id` | `city.read` | [02 §2.2](02%20-%20cities.md#22-get-apiv1citiesid) |
| 9 | Cities | POST | `{{baseUrl}}/api/v1/cities` | `city.create` | [02 §2.3](02%20-%20cities.md#23-post-apiv1cities) |
| 10 | Cities | PATCH | `{{baseUrl}}/api/v1/cities/:id` | `city.update` | [02 §2.4](02%20-%20cities.md#24-patch-apiv1citiesid) |
| 11 | Cities | DELETE | `{{baseUrl}}/api/v1/cities/:id` | `city.delete` | [02 §2.5](02%20-%20cities.md#25-delete-apiv1citiesid) |
| 12 | Cities | POST | `{{baseUrl}}/api/v1/cities/:id/restore` | `city.restore` | [02 §2.6](02%20-%20cities.md#26-post-apiv1citiesidrestore) |
| (13-78) | Skills, Languages, Education Levels, Document Types, Documents, Designations, Specializations, Learning Goals, Social Medias, Categories, Sub-Categories | GET, GET /:id, POST, PATCH, DELETE, POST /:id/restore | `/api/v1/<resource>` and variants | `<resource>.read/create/update/delete/restore` | [03–14] |

---

## 10. File index

| File | Topic |
|---|---|
| [00 overview](00%20-%20overview.md) | How phase 2 fits; the thirteen resources; permission auto-seed; list contract; Postman environment variables. |
| [01 states](01%20-%20states.md) | `/api/v1/states` — country-joined CRUD, soft-delete, restore. |
| [02 cities](02%20-%20cities.md) | `/api/v1/cities` — state/country-joined CRUD, soft-delete, restore. |
| [03 skills](03%20-%20skills.md) | `/api/v1/skills` — flat resource with category enum. |
| [04 languages](04%20-%20languages.md) | `/api/v1/languages` — flat resource with code and native name. |
| [05 education-levels](05%20-%20education-levels.md) | `/api/v1/education-levels` — flat resource with display order. |
| **06 walkthrough and index** | *(you are here)* End-to-end walkthrough + endpoint index + verify script entry point. |
| [07 document-types](07%20-%20document-types.md) | `/api/v1/document-types` — flat reference type. |
| [08 documents](08%20-%20documents.md) | `/api/v1/documents` — document-type-joined CRUD; user document instances. |
| [09 designations](09%20-%20designations.md) | `/api/v1/designations` — flat resource. |
| [10 specializations](10%20-%20specializations.md) | `/api/v1/specializations` — flat resource; also exposes Bunny-backed icon upload. |
| [11 learning-goals](11%20-%20learning-goals.md) | `/api/v1/learning-goals` — flat resource; also exposes Bunny-backed icon upload. |
| [12 social-medias](12%20-%20social-medias.md) | `/api/v1/social-medias` — flat resource; also exposes Bunny-backed icon upload. |
| [13 categories](13%20-%20categories.md) | `/api/v1/categories` — flat resource with per-language translations; also exposes Bunny-backed icon and image uploads. |
| [14 sub-categories](14%20-%20sub-categories.md) | `/api/v1/sub-categories` — category-joined resource with per-language translations; also exposes Bunny-backed icon and image uploads. |
| `api/docs/postman/phase-2.postman_collection.json` | Importable Postman v2.1 collection with a folder per resource (13 folders × 6 requests each). |
