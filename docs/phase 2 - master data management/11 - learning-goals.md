# Phase 2 — Learning Goals

Learning objective a user can track. Also exposes a Bunny-backed icon upload route.

All routes require auth. Permission codes: `learning_goal.read`, `learning_goal.create`, `learning_goal.update`, `learning_goal.delete`, `learning_goal.restore`.

All examples below use the Postman environment variables **`{{baseUrl}}`** (e.g. `http://localhost:3000`) and **`{{accessToken}}`** (a Super Admin JWT minted via `POST {{baseUrl}}/api/v1/auth/login`). Set these once on your Postman environment — see [§7 in 00 - overview](00%20-%20overview.md#7-postman-environment).

← [specializations](10%20-%20specializations.md) · **Next →** [social-medias](12%20-%20social-medias.md)

---

## Endpoint summary

Quick reference of every endpoint documented on this page. Section numbers link down to the detailed request/response contracts below.

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§11.1](#111) | `GET` | `{{baseUrl}}/api/v1/learning-goals` | learning_goal.read | List learning goals with filters and sort. |
| [§11.2](#112) | `GET` | `{{baseUrl}}/api/v1/learning-goals/:id` | learning_goal.read | Get a single learning goal by id. |
| [§11.3](#113) | `POST` | `{{baseUrl}}/api/v1/learning-goals` | learning_goal.create | Create a new learning goal. |
| [§11.4](#114) | `PATCH` | `{{baseUrl}}/api/v1/learning-goals/:id` | learning_goal.update | Partial update: `application/json` (text-only) or `multipart/form-data` (text fields + optional icon file). |
| [§11.5](#115) | `DELETE` | `{{baseUrl}}/api/v1/learning-goals/:id` | **super_admin** + learning_goal.delete | Soft-delete. |
| [§11.6](#116) | `POST` | `{{baseUrl}}/api/v1/learning-goals/:id/restore` | **super_admin** + learning_goal.restore | Undo a soft-delete. |

---

## 11.1 `GET /api/v1/learning-goals`

List learning goals.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/learning-goals` |
| Permission | `learning_goal.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | Page number (1-based). |
| `pageSize` | int | `20` | Max `100`. |
| `searchTerm` | string | — | `ILIKE` across primary text columns. |
| `isActive` | bool | — | Filter by active status. |
| `isDeleted` | bool | — | Filter by soft-delete status. |
| `sortColumn` | enum | `id` | Whitelisted: `id`, `name`, `is_active`, `is_deleted`, `created_at`, `updated_at`. |
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
      "id": 1,
      "name": "Example",
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

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [{"code": "invalid_enum_value", "path": ["sortColumn"], "message": "Invalid enum value"}]
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
  "message": "Permission denied: learning_goal.read",
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
| Search name — `python` | `?searchTerm=python` |
| Search + pagination | `?pageIndex=1&pageSize=50&searchTerm=python` |
| Active only | `?isActive=true` |
| Inactive only | `?isActive=false` |
| Deleted only | `?isDeleted=true` |
| Non-deleted only | `?isDeleted=false` |
| Sort by `id` ASC | `?sortColumn=id&sortDirection=ASC` |
| Sort by `name` ASC | `?sortColumn=name&sortDirection=ASC` |
| Sort by `is_active` DESC | `?sortColumn=is_active&sortDirection=DESC` |
| Sort by `is_deleted` DESC | `?sortColumn=is_deleted&sortDirection=DESC` |
| Sort by `created_at` DESC | `?sortColumn=created_at&sortDirection=DESC` |
| Sort by `updated_at` DESC | `?sortColumn=updated_at&sortDirection=DESC` |
| Combo — active goals, sort by name | `?pageIndex=1&pageSize=50&isActive=true&sortColumn=name&sortDirection=ASC` |

---

## 11.2 `GET /api/v1/learning-goals/:id`

Read a single learning goal by id.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/learning-goals/:id` |
| Permission | `learning_goal.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric learning goal id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 1,
    "name": "Example",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-11T00:00:00.000Z",
    "updatedAt": "2026-04-11T00:00:00.000Z",
    "deletedAt": null
  }
}
```

#### 400 VALIDATION_ERROR

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [{"path": "id", "message": "Expected number, received nan", "code": "invalid_type"}]
}
```

#### 401 UNAUTHORIZED

Same as 11.1.

#### 403 FORBIDDEN

```json
{"success": false, "message": "Permission denied: learning_goal.read", "code": "FORBIDDEN"}
```

#### 404 NOT_FOUND

```json
{"success": false, "message": "Learning Goal 9999 not found", "code": "NOT_FOUND"}
```

---

## 11.3 `POST /api/v1/learning-goals`

Create a learning goal. Permission: `learning_goal.create`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/learning-goals` |
| Permission | `learning_goal.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** (`application/json`)

```json
{
  "name": "Example",
  "isActive": true
}
```

**Required fields**: `name`.

**Optional fields**: `isActive` (defaults to **`false`** — see [§6 in 00 - overview](00%20-%20overview.md#6-active-flag-defaults)).

### Responses

#### 201 CREATED

```json
{
  "success": true,
  "message": "Learning Goal created",
  "data": {
    "id": 1,
    "name": "Example",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-11T00:00:00.000Z",
    "updatedAt": "2026-04-11T00:00:00.000Z",
    "deletedAt": null
  }
}
```

#### 400 VALIDATION_ERROR

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [{"path": "name", "message": "Required", "code": "invalid_type"}]
}
```

#### 401 UNAUTHORIZED

```json
{"success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED"}
```

#### 403 FORBIDDEN

```json
{"success": false, "message": "Permission denied: learning_goal.create", "code": "FORBIDDEN"}
```

#### 409 DUPLICATE_ENTRY

```json
{
  "success": false,
  "message": "Learning Goal with that name already exists",
  "code": "DUPLICATE_ENTRY"
}
```

---

## 11.4 `PATCH /api/v1/learning-goals/:id`

Partial update. Accepts either `application/json` for text-only changes, or `multipart/form-data` to update text fields and/or upload a new icon. Icon file is optional; text fields are optional.

**Postman request**

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/learning-goals/:id` |
| Permission | `learning_goal.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` or `multipart/form-data` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric learning goal id. |

### JSON request body (`application/json`)

Text-only patch: update name and/or isActive. At least one field is required.

```json
{
  "name": "Updated Name",
  "isActive": true
}
```

### Multipart request body (`multipart/form-data`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | text | no | New name (if updating). |
| `isActive` | text | no | New active status: `"true"` or `"false"`. |
| `icon` | file | no | PNG / JPEG / WebP / SVG, **≤ 100 KB raw**, fits a 256 × 256 box. Re-encoded server-side to WebP. Field aliases: `iconImage`, `file`. |
| `iconAction` | text | no | Send `delete` (with no file part) to clear the existing icon. Mutually exclusive with a file upload. |

**At least one field** (text field or icon/iconAction) **is required.**

**Icon pipeline**: Uploaded files are decoded, enforced to fit a 256×256 box, re-encoded to WebP ≤100 KB, and stored at `learning-goals/icons/<id>.webp`.

**Saved examples to add in Postman**

| Example name | Body |
|---|---|
| Update name (JSON) | `Content-Type: application/json`; `{"name": "New Name"}` |
| Update name + active status (JSON) | `Content-Type: application/json`; `{"name": "New Name", "isActive": false}` |
| Update + upload new icon (multipart) | `name` = "New Name"; `icon` = file binary |
| Upload icon only (multipart) | `icon` = file binary |
| Clear icon (multipart) | `iconAction` = `delete` |

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Learning Goal updated",
  "data": {
    "id": 1,
    "name": "Updated Name",
    "iconUrl": "https://cdn.growupmore.com/learning-goals/icons/1.webp",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-11T00:00:00.000Z",
    "updatedAt": "2026-04-11T00:00:00.000Z",
    "deletedAt": null
  }
}
```

#### 400 VALIDATION_ERROR — empty body

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [{"path": "", "message": "Provide at least one field to update", "code": "custom"}]
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
  "message": "Cannot upload a new learning goal icon AND iconAction=delete in the same request — pick one.",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — soft-deleted

```json
{
  "success": false,
  "message": "Learning goal 3 is soft-deleted; restore it before uploading an icon",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED / 403 FORBIDDEN

Same as 11.3.

#### 404 NOT_FOUND

```json
{"success": false, "message": "Learning Goal 9999 not found", "code": "NOT_FOUND"}
```

#### 409 DUPLICATE_ENTRY

```json
{"success": false, "message": "Learning Goal with that name already exists", "code": "DUPLICATE_ENTRY"}
```

#### 502 BUNNY_UPLOAD_FAILED

```json
{
  "success": false,
  "message": "Failed to upload learning goal icon to CDN",
  "code": "BUNNY_UPLOAD_FAILED"
}
```

---

## 11.5 `DELETE /api/v1/learning-goals/:id`

Soft delete. **Requires `super_admin` role** + permission: `learning_goal.delete`.

**Postman request**

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/learning-goals/:id` |
| Permission | **super_admin** + `learning_goal.delete` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric learning goal id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Learning Goal deleted",
  "data": {"id": 1, "deleted": true}
}
```

#### 400 BAD_REQUEST — already deleted

```json
{
  "success": false,
  "message": "Learning Goal with ID 1 does not exist or is already deleted.",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED / 403 FORBIDDEN

Same as 11.3.

#### 404 NOT_FOUND

```json
{"success": false, "message": "Learning Goal 9999 not found", "code": "NOT_FOUND"}
```

---

## 11.6 `POST /api/v1/learning-goals/:id/restore`

Reverse a soft delete. **Requires `super_admin` role** + permission: `learning_goal.restore`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/learning-goals/:id/restore` |
| Permission | **super_admin** + `learning_goal.restore` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric learning goal id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Learning Goal restored",
  "data": {
    "id": 1,
    "name": "Example",
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
  "message": "Learning Goal with ID 1 is not deleted or does not exist.",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED / 403 FORBIDDEN

Same as 11.3.

#### 404 NOT_FOUND

```json
{"success": false, "message": "Learning Goal 9999 not found", "code": "NOT_FOUND"}
```

---

## Common errors across all learning goals routes

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | zod rejected query, params, or body. |
| 400 | `BAD_REQUEST` | Business-rule violation (e.g., already-deleted row on restore). |
| 401 | `UNAUTHORIZED` | Missing or expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No learning goal with that id. |
| 409 | `DUPLICATE_ENTRY` | Name or code clashes with another non-deleted learning goal. |
| 429 | `RATE_LIMIT_EXCEEDED` | Global rate-limit tripped (default `100 / 15m`). |
| 500 | `INTERNAL_ERROR` | Unhandled exception; production response omits the stack. |
| 502 | `BUNNY_UPLOAD_FAILED` | Upload routes only — Bunny CDN Storage rejected the PUT. |
