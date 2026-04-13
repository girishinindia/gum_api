# Phase 2 — Walkthrough and Index

End-to-end walkthrough for phase-2 master data management — from logging in as Super Admin through creating a geography chain (country → state → city), seeding leaf resources (skills, languages, etc.), and verifying the 65-row auto-seeded permission set. All requests use the Postman collection and environment variables established in [§7 of 00 - overview](00%20-%20overview.md#7-postman-environment).

← [05 education-levels](05%20-%20education-levels.md) · **Next →** [07 document-types](07%20-%20document-types.md) · [Phase 1 walkthrough](../phase%201%20-%20role%20based%20user%20management/10%20-%20walkthrough%20and%20index.md)

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
| Admin has read/create/update | `GET {{baseUrl}}/api/v1/role-permissions?roleName=admin&resource=state&pageSize=50` | 3 rows: `read`, `create`, `update` (no `delete` or `restore` — both require `super_admin` role) |

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
| 1 | States | GET | `/api/v1/states` | `state.read` | [01](01%20-%20states.md) |
| 2 | States | GET | `/api/v1/states/:id` | `state.read` | [01](01%20-%20states.md) |
| 3 | States | POST | `/api/v1/states` | `state.create` | [01](01%20-%20states.md) |
| 4 | States | PATCH | `/api/v1/states/:id` | `state.update` | [01](01%20-%20states.md) |
| 5 | States | DELETE | `/api/v1/states/:id` | **super_admin** + `state.delete` | [01](01%20-%20states.md) |
| 6 | States | POST | `/api/v1/states/:id/restore` | **super_admin** + `state.restore` | [01](01%20-%20states.md) |
| 7 | Cities | GET | `/api/v1/cities` | `city.read` | [02](02%20-%20cities.md) |
| 8 | Cities | GET | `/api/v1/cities/:id` | `city.read` | [02](02%20-%20cities.md) |
| 9 | Cities | POST | `/api/v1/cities` | `city.create` | [02](02%20-%20cities.md) |
| 10 | Cities | PATCH | `/api/v1/cities/:id` | `city.update` | [02](02%20-%20cities.md) |
| 11 | Cities | DELETE | `/api/v1/cities/:id` | **super_admin** + `city.delete` | [02](02%20-%20cities.md) |
| 12 | Cities | POST | `/api/v1/cities/:id/restore` | **super_admin** + `city.restore` | [02](02%20-%20cities.md) |
| 13 | Skills | GET | `/api/v1/skills` | `skill.read` | [03](03%20-%20skills.md) |
| 14 | Skills | GET | `/api/v1/skills/:id` | `skill.read` | [03](03%20-%20skills.md) |
| 15 | Skills | POST | `/api/v1/skills` | `skill.create` | [03](03%20-%20skills.md) |
| 16 | Skills | PATCH | `/api/v1/skills/:id` | `skill.update` | [03](03%20-%20skills.md) |
| 17 | Skills | DELETE | `/api/v1/skills/:id` | **super_admin** + `skill.delete` | [03](03%20-%20skills.md) |
| 18 | Skills | POST | `/api/v1/skills/:id/restore` | **super_admin** + `skill.restore` | [03](03%20-%20skills.md) |
| 19 | Languages | GET | `/api/v1/languages` | `language.read` | [04](04%20-%20languages.md) |
| 20 | Languages | GET | `/api/v1/languages/:id` | `language.read` | [04](04%20-%20languages.md) |
| 21 | Languages | POST | `/api/v1/languages` | `language.create` | [04](04%20-%20languages.md) |
| 22 | Languages | PATCH | `/api/v1/languages/:id` | `language.update` | [04](04%20-%20languages.md) |
| 23 | Languages | DELETE | `/api/v1/languages/:id` | **super_admin** + `language.delete` | [04](04%20-%20languages.md) |
| 24 | Languages | POST | `/api/v1/languages/:id/restore` | **super_admin** + `language.restore` | [04](04%20-%20languages.md) |
| 25 | Education Levels | GET | `/api/v1/education-levels` | `education_level.read` | [05](05%20-%20education-levels.md) |
| 26 | Education Levels | GET | `/api/v1/education-levels/:id` | `education_level.read` | [05](05%20-%20education-levels.md) |
| 27 | Education Levels | POST | `/api/v1/education-levels` | `education_level.create` | [05](05%20-%20education-levels.md) |
| 28 | Education Levels | PATCH | `/api/v1/education-levels/:id` | `education_level.update` | [05](05%20-%20education-levels.md) |
| 29 | Education Levels | DELETE | `/api/v1/education-levels/:id` | **super_admin** + `education_level.delete` | [05](05%20-%20education-levels.md) |
| 30 | Education Levels | POST | `/api/v1/education-levels/:id/restore` | **super_admin** + `education_level.restore` | [05](05%20-%20education-levels.md) |
| 31 | Document Types | GET | `/api/v1/document-types` | `document_type.read` | [07](07%20-%20document-types.md) |
| 32 | Document Types | GET | `/api/v1/document-types/:id` | `document_type.read` | [07](07%20-%20document-types.md) |
| 33 | Document Types | POST | `/api/v1/document-types` | `document_type.create` | [07](07%20-%20document-types.md) |
| 34 | Document Types | PATCH | `/api/v1/document-types/:id` | `document_type.update` | [07](07%20-%20document-types.md) |
| 35 | Document Types | DELETE | `/api/v1/document-types/:id` | **super_admin** + `document_type.delete` | [07](07%20-%20document-types.md) |
| 36 | Document Types | POST | `/api/v1/document-types/:id/restore` | **super_admin** + `document_type.restore` | [07](07%20-%20document-types.md) |
| 37 | Documents | GET | `/api/v1/documents` | `document.read` | [08](08%20-%20documents.md) |
| 38 | Documents | GET | `/api/v1/documents/:id` | `document.read` | [08](08%20-%20documents.md) |
| 39 | Documents | POST | `/api/v1/documents` | `document.create` | [08](08%20-%20documents.md) |
| 40 | Documents | PATCH | `/api/v1/documents/:id` | `document.update` | [08](08%20-%20documents.md) |
| 41 | Documents | DELETE | `/api/v1/documents/:id` | **super_admin** + `document.delete` | [08](08%20-%20documents.md) |
| 42 | Documents | POST | `/api/v1/documents/:id/restore` | **super_admin** + `document.restore` | [08](08%20-%20documents.md) |
| 43 | Designations | GET | `/api/v1/designations` | `designation.read` | [09](09%20-%20designations.md) |
| 44 | Designations | GET | `/api/v1/designations/:id` | `designation.read` | [09](09%20-%20designations.md) |
| 45 | Designations | POST | `/api/v1/designations` | `designation.create` | [09](09%20-%20designations.md) |
| 46 | Designations | PATCH | `/api/v1/designations/:id` | `designation.update` | [09](09%20-%20designations.md) |
| 47 | Designations | DELETE | `/api/v1/designations/:id` | **super_admin** + `designation.delete` | [09](09%20-%20designations.md) |
| 48 | Designations | POST | `/api/v1/designations/:id/restore` | **super_admin** + `designation.restore` | [09](09%20-%20designations.md) |
| 49 | Specializations | GET | `/api/v1/specializations` | `specialization.read` | [10](10%20-%20specializations.md) |
| 50 | Specializations | GET | `/api/v1/specializations/:id` | `specialization.read` | [10](10%20-%20specializations.md) |
| 51 | Specializations | POST | `/api/v1/specializations` | `specialization.create` | [10](10%20-%20specializations.md) |
| 52 | Specializations | PATCH | `/api/v1/specializations/:id` | `specialization.update` | [10](10%20-%20specializations.md) |
| 53 | Specializations | DELETE | `/api/v1/specializations/:id` | **super_admin** + `specialization.delete` | [10](10%20-%20specializations.md) |
| 54 | Specializations | POST | `/api/v1/specializations/:id/restore` | **super_admin** + `specialization.restore` | [10](10%20-%20specializations.md) |
| 55 | Learning Goals | GET | `/api/v1/learning-goals` | `learning_goal.read` | [11](11%20-%20learning-goals.md) |
| 56 | Learning Goals | GET | `/api/v1/learning-goals/:id` | `learning_goal.read` | [11](11%20-%20learning-goals.md) |
| 57 | Learning Goals | POST | `/api/v1/learning-goals` | `learning_goal.create` | [11](11%20-%20learning-goals.md) |
| 58 | Learning Goals | PATCH | `/api/v1/learning-goals/:id` | `learning_goal.update` | [11](11%20-%20learning-goals.md) |
| 59 | Learning Goals | DELETE | `/api/v1/learning-goals/:id` | **super_admin** + `learning_goal.delete` | [11](11%20-%20learning-goals.md) |
| 60 | Learning Goals | POST | `/api/v1/learning-goals/:id/restore` | **super_admin** + `learning_goal.restore` | [11](11%20-%20learning-goals.md) |
| 61 | Social Medias | GET | `/api/v1/social-medias` | `social_media.read` | [12](12%20-%20social-medias.md) |
| 62 | Social Medias | GET | `/api/v1/social-medias/:id` | `social_media.read` | [12](12%20-%20social-medias.md) |
| 63 | Social Medias | POST | `/api/v1/social-medias` | `social_media.create` | [12](12%20-%20social-medias.md) |
| 64 | Social Medias | PATCH | `/api/v1/social-medias/:id` | `social_media.update` | [12](12%20-%20social-medias.md) |
| 65 | Social Medias | DELETE | `/api/v1/social-medias/:id` | **super_admin** + `social_media.delete` | [12](12%20-%20social-medias.md) |
| 66 | Social Medias | POST | `/api/v1/social-medias/:id/restore` | **super_admin** + `social_media.restore` | [12](12%20-%20social-medias.md) |
| 67 | Categories | GET | `/api/v1/categories` | `category.read` | [13](13%20-%20categories.md) |
| 68 | Categories | GET | `/api/v1/categories/:id` | `category.read` | [13](13%20-%20categories.md) |
| 69 | Categories | POST | `/api/v1/categories` | `category.create` | [13](13%20-%20categories.md) |
| 70 | Categories | PATCH | `/api/v1/categories/:id` | `category.update` | [13](13%20-%20categories.md) |
| 71 | Categories | DELETE | `/api/v1/categories/:id` | **super_admin** + `category.delete` | [13](13%20-%20categories.md) |
| 72 | Categories | POST | `/api/v1/categories/:id/restore` | **super_admin** + `category.restore` | [13](13%20-%20categories.md) |
| 73 | Categories | GET | `/api/v1/categories/:id/translations` | `category_translation.read` | [13](13%20-%20categories.md) |
| 74 | Categories | GET | `/api/v1/categories/:id/translations/:tid` | `category_translation.read` | [13](13%20-%20categories.md) |
| 75 | Categories | POST | `/api/v1/categories/:id/translations` | `category_translation.create` | [13](13%20-%20categories.md) |
| 76 | Categories | PATCH | `/api/v1/categories/:id/translations/:tid` | `category_translation.update` | [13](13%20-%20categories.md) |
| 77 | Categories | DELETE | `/api/v1/categories/:id/translations/:tid` | **super_admin** + `category_translation.delete` | [13](13%20-%20categories.md) |
| 78 | Categories | POST | `/api/v1/categories/:id/translations/:tid/restore` | **super_admin** + `category_translation.restore` | [13](13%20-%20categories.md) |
| 79 | Sub-Categories | GET | `/api/v1/sub-categories` | `sub_category.read` | [14](14%20-%20sub-categories.md) |
| 80 | Sub-Categories | GET | `/api/v1/sub-categories/:id` | `sub_category.read` | [14](14%20-%20sub-categories.md) |
| 81 | Sub-Categories | POST | `/api/v1/sub-categories` | `sub_category.create` | [14](14%20-%20sub-categories.md) |
| 82 | Sub-Categories | PATCH | `/api/v1/sub-categories/:id` | `sub_category.update` | [14](14%20-%20sub-categories.md) |
| 83 | Sub-Categories | DELETE | `/api/v1/sub-categories/:id` | **super_admin** + `sub_category.delete` | [14](14%20-%20sub-categories.md) |
| 84 | Sub-Categories | POST | `/api/v1/sub-categories/:id/restore` | **super_admin** + `sub_category.restore` | [14](14%20-%20sub-categories.md) |
| 85 | Sub-Categories | GET | `/api/v1/sub-categories/:id/translations` | `sub_category_translation.read` | [14](14%20-%20sub-categories.md) |
| 86 | Sub-Categories | GET | `/api/v1/sub-categories/:id/translations/:tid` | `sub_category_translation.read` | [14](14%20-%20sub-categories.md) |
| 87 | Sub-Categories | POST | `/api/v1/sub-categories/:id/translations` | `sub_category_translation.create` | [14](14%20-%20sub-categories.md) |
| 88 | Sub-Categories | PATCH | `/api/v1/sub-categories/:id/translations/:tid` | `sub_category_translation.update` | [14](14%20-%20sub-categories.md) |
| 89 | Sub-Categories | DELETE | `/api/v1/sub-categories/:id/translations/:tid` | **super_admin** + `sub_category_translation.delete` | [14](14%20-%20sub-categories.md) |
| 90 | Sub-Categories | POST | `/api/v1/sub-categories/:id/translations/:tid/restore` | **super_admin** + `sub_category_translation.restore` | [14](14%20-%20sub-categories.md) |

---

## 10. File index

| File | Topic |
|---|---|
| [00 overview](00%20-%20overview.md) | How phase 2 fits; the thirteen resources; permission auto-seed; list contract; Postman environment variables. |
| [01 states](01%20-%20states.md) | `/api/v1/states` — country-joined CRUD, soft-delete, restore. |
| [02 cities](02%20-%20cities.md) | `/api/v1/cities` — state/country-joined CRUD, soft-delete, restore. |
| [03 skills](03%20-%20skills.md) | `/api/v1/skills` — flat resource with category enum; also exposes Bunny-backed icon upload. |
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
