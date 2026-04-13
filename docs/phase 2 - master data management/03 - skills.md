# Phase 2 — Skills

A flat taxonomy of skills that users, roles, courses, and jobs can reference. Each skill has a **category** from a fixed enum enforced both by the DB `CHECK` constraint and by the Zod schema — the two lists are kept in sync by hand. Categories are: `technical`, `soft_skill`, `tool`, `framework`, `language`, `domain`, `certification`, `other`.

All routes require auth. Permission codes: `skill.read`, `skill.create`, `skill.update`, `skill.delete`, `skill.restore`.

All examples below use the Postman environment variables **`{{baseUrl}}`** (e.g. `http://localhost:3000`) and **`{{accessToken}}`** (a Super Admin JWT minted via `POST {{baseUrl}}/api/v1/auth/login`). Set these once on your Postman environment — see [§7 in 00 - overview](00%20-%20overview.md#7-postman-environment).

← [02 cities](02%20-%20cities.md) · **Next →** [04 languages](04%20-%20languages.md)

---

## Endpoint summary

Quick reference of every endpoint documented on this page. Section numbers link down to the detailed request/response contracts below.

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§3.1](#31) | `GET` | `{{baseUrl}}/api/v1/skills` | skill.read | List skills with category filter, search, and sort. |
| [§3.2](#32) | `GET` | `{{baseUrl}}/api/v1/skills/:id` | skill.read | Get a single skill by id. |
| [§3.3](#33) | `POST` | `{{baseUrl}}/api/v1/skills` | skill.create | Create a new skill. |
| [§3.4](#34) | `PATCH` | `{{baseUrl}}/api/v1/skills/:id` | skill.update | Partial update of a skill (JSON body). |
| [§3.5](#35) | `DELETE` | `{{baseUrl}}/api/v1/skills/:id` | skill.delete | Soft-delete a skill. |
| [§3.6](#36) | `POST` | `{{baseUrl}}/api/v1/skills/:id/restore` | skill.restore | Undo a soft-delete. |
| [§3.7](#37) | `PATCH` | `{{baseUrl}}/api/v1/skills/:id/icon` | skill.update | Upload / replace / clear the skill icon via `multipart/form-data`. |

---

## 3.1 `GET /api/v1/skills`

List skills. Backed by `udf_get_skills`, which supports filtering by category, text search, and per-resource sort keys.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/skills` |
| Permission | `skill.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | Page number (1-based). |
| `pageSize` | int | `20` | Max `100`. |
| `searchTerm` | string | — | `ILIKE` across skill name and description. |
| `isActive` | bool | — | Filter by active status. |
| `isDeleted` | bool | — | Filter by soft-delete status. |
| `category` | enum | — | One of `technical`, `soft_skill`, `tool`, `framework`, `language`, `domain`, `certification`, `other`. |
| `sortColumn` | enum | `id` | Whitelisted: `id`, `name`, `category`, `is_active`, `is_deleted`, `created_at`, `updated_at`. |
| `sortDirection` | enum | `ASC` | `ASC` / `DESC`. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 14,
      "name": "TypeScript",
      "category": "language",
      "description": "Typed superset of JavaScript that compiles to plain JS.",
      "iconUrl": null,
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-11T00:00:00.000Z",
      "updatedAt": "2026-04-11T00:00:00.000Z",
      "deletedAt": null
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "totalCount": 1,
    "totalPages": 1
  }
}
```

#### 400 VALIDATION_ERROR

Triggered by unknown `category`, unknown `sortColumn`, `pageSize` > 100, or any query coercion failure.

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "path": "category",
      "message": "Invalid enum value. Expected 'technical' | 'soft_skill' | 'tool' | 'framework' | 'language' | 'domain' | 'certification' | 'other', received 'unknown'",
      "code": "invalid_enum_value"
    }
  ]
}
```

#### 401 UNAUTHORIZED

```json
{
  "success": false,
  "message": "Missing or invalid access token",
  "code": "UNAUTHORIZED"
}
```

#### 403 FORBIDDEN

```json
{
  "success": false,
  "message": "Permission denied: skill.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/...` — method, headers and auth stay the same as the base request above.

| Example name | Query string |
|---|---|
| Page 1 (defaults) | `?pageIndex=1&pageSize=20` |
| Page 2, default size | `?pageIndex=2&pageSize=20` |
| Page 1, small page (5 rows) | `?pageIndex=1&pageSize=5` |
| Page 1, large page (100 rows) | `?pageIndex=1&pageSize=100` |
| Page 3, large page | `?pageIndex=3&pageSize=100` |
| Out-of-range page (returns empty `data`) | `?pageIndex=9999&pageSize=20` |
| Search name/description — `typescript` | `?searchTerm=typescript` |
| Search + pagination | `?pageIndex=1&pageSize=50&searchTerm=java` |
| Active only | `?isActive=true` |
| Inactive only | `?isActive=false` |
| Deleted only | `?isDeleted=true` |
| Non-deleted only | `?isDeleted=false` |
| Category `technical` | `?category=technical` |
| Category `soft_skill` | `?category=soft_skill` |
| Category `tool` | `?category=tool` |
| Category `framework` | `?category=framework` |
| Category `language` | `?category=language` |
| Category `domain` | `?category=domain` |
| Category `certification` | `?category=certification` |
| Category `other` | `?category=other` |
| Sort by `id` DESC | `?sortColumn=id&sortDirection=DESC` |
| Sort by `name` ASC | `?sortColumn=name&sortDirection=ASC` |
| Sort by `name` DESC | `?sortColumn=name&sortDirection=DESC` |
| Sort by `category` ASC | `?sortColumn=category&sortDirection=ASC` |
| Sort by `is_active` DESC | `?sortColumn=is_active&sortDirection=DESC` |
| Sort by `is_deleted` DESC | `?sortColumn=is_deleted&sortDirection=DESC` |
| Sort by `created_at` DESC | `?sortColumn=created_at&sortDirection=DESC` |
| Sort by `updated_at` DESC | `?sortColumn=updated_at&sortDirection=DESC` |
| Combo — active technical skills, sort by name | `?pageIndex=1&pageSize=50&isActive=true&category=technical&sortColumn=name&sortDirection=ASC` |
| Combo — search `react`, framework category, newest | `?pageIndex=1&pageSize=20&searchTerm=react&category=framework&sortColumn=created_at&sortDirection=DESC` |

---

## 3.2 `GET /api/v1/skills/:id`

Read a single skill by id. Soft-deleted skills are returned by id (the UDF does not apply the `is_deleted` filter for `p_id` lookups).

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/skills/:id` |
| Permission | `skill.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric skill id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 14,
    "name": "TypeScript",
    "category": "language",
    "description": "Typed superset of JavaScript that compiles to plain JS.",
    "iconUrl": null,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-11T00:00:00.000Z",
    "updatedAt": "2026-04-11T00:00:00.000Z",
    "deletedAt": null
  }
}
```

#### 400 VALIDATION_ERROR

Non-numeric `:id`.

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "id", "message": "Expected number, received nan", "code": "invalid_type" }
  ]
}
```

#### 401 UNAUTHORIZED

Same shape as 3.1.

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: skill.read", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Skill 9999 not found", "code": "NOT_FOUND" }
```

---

## 3.3 `POST /api/v1/skills`

Create a skill. Permission: `skill.create`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/skills` |
| Permission | `skill.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** (`application/json`)

```json
{
  "name": "TypeScript",
  "category": "language",
  "description": "Typed superset of JavaScript that compiles to plain JS.",
  "iconUrl": null,
  "isActive": true
}
```

**Required fields**: `name`.

**Optional fields**: `category` (defaults to `technical`), `description`, `iconUrl`, `isActive` (defaults to **`false`** at the API layer — see [§6 in 00 - overview](00%20-%20overview.md#6-active-flag-defaults)).

**Field hard-limits** (zod-rejected before reaching the DB)

| Field | Min | Max | Extra rule |
|---|---|---|---|
| `name` | 1 | 128 | |
| `description` | — | 2000 | |
| `iconUrl` | — | 512 | Must parse as URL if provided. |

### Responses

#### 201 CREATED

```json
{
  "success": true,
  "message": "Skill created",
  "data": {
    "id": 14,
    "name": "TypeScript",
    "category": "language",
    "description": "Typed superset of JavaScript that compiles to plain JS.",
    "iconUrl": null,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-11T00:00:00.000Z",
    "updatedAt": "2026-04-11T00:00:00.000Z",
    "deletedAt": null
  }
}
```

#### 400 VALIDATION_ERROR — missing required field

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "name", "message": "Required", "code": "invalid_type" }
  ]
}
```

#### 400 VALIDATION_ERROR — bad enum or field length

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "path": "category",
      "message": "Invalid enum value. Expected 'technical' | 'soft_skill' | 'tool' | 'framework' | 'language' | 'domain' | 'certification' | 'other', received 'unknown'",
      "code": "invalid_enum_value"
    }
  ]
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: skill.create", "code": "FORBIDDEN" }
```

#### 409 DUPLICATE_ENTRY

Name is unique over `is_deleted = FALSE`, so soft-deleted skills free up their name.

```json
{
  "success": false,
  "message": "Skill with name \"TypeScript\" already exists",
  "code": "DUPLICATE_ENTRY"
}
```

---

## 3.4 `PATCH /api/v1/skills/:id`

Partial update. Every field is optional, but the body must contain **at least one** known key — an empty body returns `400 VALIDATION_ERROR` with `"Provide at least one field to update"`.

Patchable fields: `name`, `category`, `description`, `iconUrl`, `isActive`.

**Postman request**

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/skills/:id` |
| Permission | `skill.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric skill id. |

**Request body** (`application/json`) — some sample variants:

*Update description*

```json
{ "description": "Microsoft's typed flavour of JavaScript." }
```

*Change category and activate*

```json
{ "category": "tool", "isActive": true }
```

### Responses

#### 200 OK

Same row shape as `3.2 GET /:id`, wrapped in:

```json
{ "success": true, "message": "Skill updated", "data": { "id": 14, "...": "..." } }
```

#### 400 VALIDATION_ERROR — empty body

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "", "message": "Provide at least one field to update", "code": "custom" }
  ]
}
```

#### 401 UNAUTHORIZED / 403 FORBIDDEN — shape as 3.3.

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Skill 9999 not found", "code": "NOT_FOUND" }
```

#### 409 DUPLICATE_ENTRY

```json
{ "success": false, "message": "Skill with name \"TypeScript\" already exists", "code": "DUPLICATE_ENTRY" }
```

---

## 3.5 `DELETE /api/v1/skills/:id`

Soft delete — sets `is_deleted = TRUE`, `is_active = FALSE`, `deleted_at = NOW()`. Permission: `skill.delete`.

**Postman request**

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/skills/:id` |
| Permission | `skill.delete` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric skill id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Skill deleted",
  "data": { "id": 14, "deleted": true }
}
```

#### 400 BAD_REQUEST — already deleted

```json
{
  "success": false,
  "message": "Skill with ID 14 does not exist or is already deleted.",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: skill.delete", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Skill 9999 not found", "code": "NOT_FOUND" }
```

---

## 3.6 `POST /api/v1/skills/:id/restore`

Reverse a soft delete. Permission: `skill.restore`. Restore sets `is_deleted = FALSE` and `is_active = TRUE` in one shot and returns the full refreshed row.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/skills/:id/restore` |
| Permission | `skill.restore` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric skill id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Skill restored",
  "data": {
    "id": 14,
    "name": "TypeScript",
    "category": "language",
    "description": "Typed superset of JavaScript that compiles to plain JS.",
    "iconUrl": null,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-11T00:00:00.000Z",
    "updatedAt": "2026-04-11T00:00:00.000Z",
    "deletedAt": null
  }
}
```

#### 400 BAD_REQUEST — not deleted

```json
{
  "success": false,
  "message": "Skill with ID 14 is not deleted or does not exist.",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED / 403 FORBIDDEN — shape as 3.3.

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Skill 9999 not found", "code": "NOT_FOUND" }
```

---

## 3.7 `PATCH /api/v1/skills/:id/icon`

Dedicated file-upload sibling of §3.4. Where `PATCH /api/v1/skills/:id` takes a JSON body of text fields (and accepts `iconUrl` only as a plain string), **this route takes a `multipart/form-data` body with a binary `icon` part** and runs the file through the shared Bunny-CDN pipeline — decode with sharp, enforce the icon box (≤ 256 × 256), re-encode to WebP, delete the prior Bunny object (if any), PUT the new WebP under `skills/icons/<id>.webp`, and return the refreshed row with the new `iconUrl` in the same response. Permission: `skill.update`.

> **Implementation status.** The skills table already has the `icon_url` column and the sharp-backed upload pipeline is shared with specializations / learning-goals / social-medias / categories / sub-categories. The router entry itself is tracked as a follow-up alongside a new `udf_skills_set_icon_url` SQL setter and a `uploadSkillIcon` multer middleware — the doc is published here ahead of the code change so clients can wire Postman environments against the final convention. Until the route ships, fall back to setting `iconUrl` as a plain URL via §3.4 (and host the image yourself).

**Postman request**

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/skills/:id/icon` |
| Permission | `skill.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `multipart/form-data` (Postman sets the boundary automatically) |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric skill id. Must exist and not be soft-deleted. |

**Body** — `multipart/form-data`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `icon` | file | yes | PNG / JPEG / WebP / SVG, **≤ 100 KB raw**, fits a 256 × 256 box. Re-encoded server-side to WebP ≤ 100 KB. |
| `iconAction` | text | no | Send `delete` (with no file part) to clear the existing icon. Mutually exclusive with a file upload. |

**Saved examples to add in Postman**

| Example name | Body |
|---|---|
| Upload new icon | `icon` = `typescript-256.png` |
| Replace existing icon | `icon` = `typescript-v2.webp` |
| Clear icon | `iconAction` = `delete` |

### Responses

#### 200 OK — icon uploaded

```json
{
  "success": true,
  "message": "Skill icon uploaded",
  "data": {
    "id": 14,
    "name": "TypeScript",
    "category": "language",
    "description": "Typed superset of JavaScript that compiles to plain JS.",
    "iconUrl": "https://cdn.growupmore.com/skills/icons/14.webp",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-11T00:00:00.000Z",
    "updatedAt": "2026-04-11T12:14:55.108Z",
    "deletedAt": null
  }
}
```

#### 200 OK — icon cleared (`iconAction=delete`)

```json
{
  "success": true,
  "message": "Skill icon deleted",
  "data": {
    "id": 14,
    "iconUrl": null,
    "updatedAt": "2026-04-11T12:15:02.771Z"
  }
}
```

#### 400 VALIDATION_ERROR — missing file part

```json
{
  "success": false,
  "message": "icon field is required (multipart/form-data)",
  "code": "VALIDATION_ERROR"
}
```

#### 400 BAD_REQUEST — file too large

```json
{
  "success": false,
  "message": "File too large: icon must be ≤ 100 KB raw",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — unsupported media type

```json
{
  "success": false,
  "message": "Unsupported media type: expected image/png, image/jpeg, image/webp, or image/svg+xml",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — unreadable image

```json
{
  "success": false,
  "message": "Uploaded file is not a readable image",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — conflicting action

```json
{
  "success": false,
  "message": "Cannot upload a new skill icon AND iconAction=delete in the same request — pick one.",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — soft-deleted

```json
{
  "success": false,
  "message": "Skill 14 is soft-deleted; restore it before uploading an icon",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: skill.update", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Skill 9999 not found", "code": "NOT_FOUND" }
```

#### 429 RATE_LIMIT_EXCEEDED

```json
{
  "success": false,
  "message": "Too many requests from this IP, please try again later",
  "code": "RATE_LIMIT_EXCEEDED"
}
```

#### 500 INTERNAL_ERROR

```json
{ "success": false, "message": "An unexpected error occurred", "code": "INTERNAL_ERROR" }
```

#### 502 BUNNY_UPLOAD_FAILED

```json
{
  "success": false,
  "message": "Failed to upload skill icon to CDN",
  "code": "BUNNY_UPLOAD_FAILED"
}
```

---

## Common errors across all skill routes

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | zod rejected query, params, or body. |
| 400 | `BAD_REQUEST` | Business-rule violation raised by the UDF (already-deleted row on restore, etc). |
| 401 | `UNAUTHORIZED` | Missing or expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No skill with that id. |
| 409 | `DUPLICATE_ENTRY` | `name` clashes with another non-deleted skill. |
| 429 | `RATE_LIMIT_EXCEEDED` | Global rate-limit tripped (default `100 / 15m`). |
| 500 | `INTERNAL_ERROR` | Unhandled exception; production response omits the stack. |
| 502 | `BUNNY_UPLOAD_FAILED` | Icon-upload route only — Bunny CDN Storage rejected the PUT. |
