# Phase 2 — Specializations

Area of expertise. Also exposes a Bunny-backed icon upload route.

All routes require auth. Permission codes: `specialization.read`, `specialization.create`, `specialization.update`, `specialization.delete`, `specialization.restore`.

All examples below use the Postman environment variables **`{{baseUrl}}`** (e.g. `http://localhost:3000`) and **`{{accessToken}}`** (a Super Admin JWT minted via `POST {{baseUrl}}/api/v1/auth/login`). Set these once on your Postman environment — see [§7 in 00 - overview](00%20-%20overview.md#7-postman-environment).

← [designations](09%20-%20designations.md) · **Next →** [learning-goals](11%20-%20learning-goals.md)

---

## Endpoint summary

Quick reference of every endpoint documented on this page. Section numbers link down to the detailed request/response contracts below.

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§10.1](#101) | `GET` | `{{baseUrl}}/api/v1/specializations` | specialization.read | List specializations with filters and sort. |
| [§10.2](#102) | `GET` | `{{baseUrl}}/api/v1/specializations/:id` | specialization.read | Get a single specialization by id. |
| [§10.3](#103) | `POST` | `{{baseUrl}}/api/v1/specializations` | specialization.create | Create a new specialization. Accepts JSON **or** `multipart/form-data`. |
| [§10.4](#104) | `PATCH` | `{{baseUrl}}/api/v1/specializations/:id` | specialization.update | Partial update (JSON body). |
| [§10.5](#105) | `DELETE` | `{{baseUrl}}/api/v1/specializations/:id` | **super_admin** + specialization.delete | Soft-delete. |
| [§10.6](#106) | `POST` | `{{baseUrl}}/api/v1/specializations/:id/restore` | **super_admin** + specialization.restore | Undo a soft-delete. |
| [§10.7](#107) | `PATCH` | `{{baseUrl}}/api/v1/specializations/:id/icon` | specialization.update | Upload / replace / clear the icon via `multipart/form-data`. |

---

## 10.1 `GET /api/v1/specializations`

List specializations.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/specializations` |
| Permission | `specialization.read` |

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
  "message": "Permission denied: specialization.read",
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
| Search name — `frontend` | `?searchTerm=frontend` |
| Search + pagination | `?pageIndex=1&pageSize=50&searchTerm=frontend` |
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
| Combo — active specializations, sort by name | `?pageIndex=1&pageSize=50&isActive=true&sortColumn=name&sortDirection=ASC` |

---

## 10.2 `GET /api/v1/specializations/:id`

Read a single specialization by id.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/specializations/:id` |
| Permission | `specialization.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric specialization id. |

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

Same as 10.1.

#### 403 FORBIDDEN

```json
{"success": false, "message": "Permission denied: specialization.read", "code": "FORBIDDEN"}
```

#### 404 NOT_FOUND

```json
{"success": false, "message": "Specialization 9999 not found", "code": "NOT_FOUND"}
```

---

## 10.3 `POST /api/v1/specializations`

Create a specialization. Permission: `specialization.create`. Accepts **JSON or `multipart/form-data`**.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/specializations` |
| Permission | `specialization.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` (JSON) **or** `multipart/form-data` (file upload) |

**Request body**

Two options:

#### Option 1: JSON (`application/json`)

```json
{
  "name": "Example",
  "isActive": true
}
```

**Required fields**: `name`.

**Optional fields**: `isActive` (defaults to **`false`** — see [§6 in 00 - overview](00%20-%20overview.md#6-active-flag-defaults)).

#### Option 2: Form Data (`multipart/form-data`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | text | yes | Specialization name. |
| `isActive` | text | no | `true` or `false`; defaults to `false`. |
| `icon` | file | no | PNG / JPEG / WebP / SVG, **≤ 100 KB raw**. Aliases: `iconImage`, `file`. Re-encoded server-side to WebP ≤ 100 KB. The icon URL will appear in the response. |

**Postman examples**

| # | Example name | Content-Type | Body |
|---|---|---|---|
| 1 | Create — JSON (no icon) | `application/json` | `{ "name": "Full Stack Development", "description": "End-to-end web development", "isActive": true }` |
| 2 | Create — form-data + icon | `multipart/form-data` | `name` = `Full Stack Development`, `description` = `End-to-end web development`, `isActive` = `true`, `icon` = `fullstack-icon.png` (file) |

### Responses

#### 201 CREATED — JSON body

```json
{
  "success": true,
  "message": "Specialization created",
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

#### 201 CREATED — form-data with icon

```json
{
  "success": true,
  "message": "Specialization created",
  "data": {
    "id": 1,
    "name": "Example",
    "iconUrl": "https://cdn.growupmore.com/specializations/icons/1.webp",
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
{"success": false, "message": "Permission denied: specialization.create", "code": "FORBIDDEN"}
```

#### 409 DUPLICATE_ENTRY

```json
{
  "success": false,
  "message": "Specialization with that name already exists",
  "code": "DUPLICATE_ENTRY"
}
```

---

## 10.4 `PATCH /api/v1/specializations/:id`

Partial update.

**Postman request**

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/specializations/:id` |
| Permission | `specialization.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric specialization id. |

### Text-only update (`application/json`)

**Headers** — set `Content-Type: application/json`

**Request body**

```json
{
  "name": "Updated Name",
  "isActive": true
}
```

**Optional fields**: `name`, `description`, `isActive`. Provide at least one.

### Icon upload / clear (`multipart/form-data`)

**Headers** — set `Content-Type: multipart/form-data` (Postman sets the boundary automatically)

**Body fields**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | text | no | Update the specialization name. |
| `description` | text | no | Update the description. |
| `isActive` | text | no | Update active status (`"true"` or `"false"`). |
| `icon` | file | no* | PNG / JPEG / WebP / SVG, **≤ 100 KB raw**. Resized to fit 256 × 256 box, re-encoded to WebP, stored at `specializations/icons/<id>.webp`. |
| `iconImage` | file | no* | Alias for `icon` field. |
| `file` | file | no* | Alias for `icon` field. |
| `iconAction` | text | no | Send `delete` to clear the existing icon. Mutually exclusive with a file upload. |

\* For icon operations: Either upload a file (via `icon`, `iconImage`, or `file`) **or** send `iconAction=delete`. At least one text field or one icon operation must be present.

**Postman examples**

| # | Example name | Content-Type | Body |
|---|---|---|---|
| 1 | Update — JSON (no icon) | `application/json` | `{ "description": "Updated specialization description" }` |
| 2 | Update — form-data + text + icon | `multipart/form-data` | `name` = `Full Stack (Modern)`, `icon` = `fullstack-v2.png` (file) |
| 3 | Update — form-data icon only | `multipart/form-data` | `icon` = `new-icon.png` (file) |

### Responses

#### 200 OK

Same row shape as 10.2, wrapped in success envelope.

#### 400 VALIDATION_ERROR — empty body

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [{"path": "", "message": "Provide at least one field to update", "code": "custom"}]
}
```

#### 401 UNAUTHORIZED / 403 FORBIDDEN

Same as 10.3.

#### 404 NOT_FOUND

```json
{"success": false, "message": "Specialization 9999 not found", "code": "NOT_FOUND"}
```

#### 409 DUPLICATE_ENTRY

```json
{"success": false, "message": "Specialization with that name already exists", "code": "DUPLICATE_ENTRY"}
```

---

## 10.5 `DELETE /api/v1/specializations/:id`

Soft delete. **Requires `super_admin` role** + permission: `specialization.delete`.

**Postman request**

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/specializations/:id` |
| Permission | **super_admin** + `specialization.delete` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric specialization id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Specialization deleted",
  "data": {"id": 1, "deleted": true}
}
```

#### 400 BAD_REQUEST — already deleted

```json
{
  "success": false,
  "message": "Specialization with ID 1 does not exist or is already deleted.",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED / 403 FORBIDDEN

Same as 10.3.

#### 404 NOT_FOUND

```json
{"success": false, "message": "Specialization 9999 not found", "code": "NOT_FOUND"}
```

---

## 10.6 `POST /api/v1/specializations/:id/restore`

Reverse a soft delete. **Requires `super_admin` role** + permission: `specialization.restore`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/specializations/:id/restore` |
| Permission | **super_admin** + `specialization.restore` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric specialization id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Specialization restored",
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
  "message": "Specialization with ID 1 is not deleted or does not exist.",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED / 403 FORBIDDEN

Same as 10.3.

#### 404 NOT_FOUND

```json
{"success": false, "message": "Specialization 9999 not found", "code": "NOT_FOUND"}
```

---

## 10.7 `PATCH /api/v1/specializations/:id/icon`

Dedicated file-upload sibling of the JSON `PATCH /api/v1/specializations/:id`. Where that route takes a `application/json` body of text fields, **this route takes a `multipart/form-data` body with a binary `icon` part** and runs the file through the shared Bunny-CDN pipeline — decode with sharp, enforce the icon box (≤ 256 × 256), re-encode to WebP, delete the prior Bunny object (if any), PUT the new WebP under `specializations/icons/<id>.webp`, and return the refreshed row with the new `iconUrl` in the same response. Permission: `specialization.update`.

> **Backend status.** The specializations router already unifies this upload into `PATCH /api/v1/specializations/:id` — the same unified handler accepts both the JSON text-field body (§10.4) and a `multipart/form-data` body that carries the `icon` file part or the `iconAction=delete` field. This section documents the dedicated `/icon` sub-route that is mirrored on the same handler for client convenience; Postman callers can use either URL interchangeably with identical semantics.

**Postman request**

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/specializations/:id/icon` |
| Permission | `specialization.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `multipart/form-data` (Postman sets the boundary automatically) |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric specialization id. Must exist and not be soft-deleted. |

**Body** — `multipart/form-data`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `icon` | file | yes* | PNG / JPEG / WebP / SVG, **≤ 100 KB raw**, fits a 256 × 256 box. Re-encoded server-side to WebP ≤ 100 KB. |
| `iconAction` | text | no | Send `delete` (with no file part) to clear the existing icon. Mutually exclusive with a file upload. |

\* Either the file part **or** `iconAction=delete` must be present — sending neither is a `400 VALIDATION_ERROR`.

**Saved examples to add in Postman**

| Example name | Body |
|---|---|
| Upload new icon | `icon` = `frontend-256.png` |
| Replace existing icon | `icon` = new file binary |
| Clear icon | `iconAction` = `delete` |

### Responses

#### 200 OK — icon uploaded

```json
{
  "success": true,
  "message": "Specialization icon uploaded",
  "data": {
    "id": 1,
    "name": "Frontend Development",
    "iconUrl": "https://cdn.growupmore.com/specializations/icons/1.webp",
    "isActive": true,
    "isDeleted": false,
    "updatedAt": "2026-04-11T12:14:55.108Z"
  }
}
```

#### 200 OK — icon cleared (`iconAction=delete`)

```json
{
  "success": true,
  "message": "Specialization icon deleted",
  "data": {
    "id": 1,
    "iconUrl": null,
    "updatedAt": "2026-04-11T12:15:02.771Z"
  }
}
```

#### 400 VALIDATION_ERROR — missing file part and no delete action

```json
{
  "success": false,
  "message": "icon field is required (multipart/form-data) or iconAction=delete",
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
  "message": "Cannot upload a new specialization icon AND iconAction=delete in the same request — pick one.",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — soft-deleted

```json
{
  "success": false,
  "message": "Specialization 1 is soft-deleted; restore it before uploading a icon",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: specialization.update", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Specialization 9999 not found", "code": "NOT_FOUND" }
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
  "message": "Failed to upload specialization icon to CDN",
  "code": "BUNNY_UPLOAD_FAILED"
}
```

---

## Common errors across all specializations routes

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | zod rejected query, params, or body. |
| 400 | `BAD_REQUEST` | Business-rule violation (e.g., already-deleted row on restore). |
| 401 | `UNAUTHORIZED` | Missing or expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No specialization with that id. |
| 409 | `DUPLICATE_ENTRY` | Name or code clashes with another non-deleted specialization. |
| 429 | `RATE_LIMIT_EXCEEDED` | Global rate-limit tripped (default `100 / 15m`). |
| 500 | `INTERNAL_ERROR` | Unhandled exception; production response omits the stack. |
| 502 | `BUNNY_UPLOAD_FAILED` | Upload routes only — Bunny CDN Storage rejected the PUT. |
