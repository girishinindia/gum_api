# Phase 2 — Social Medias

Social media platform reference. Also exposes a Bunny-backed icon upload route.

All routes require auth. Permission codes: `social_media.read`, `social_media.create`, `social_media.update`, `social_media.delete`, `social_media.restore`.

All examples below use the Postman environment variables **`{{baseUrl}}`** (e.g. `http://localhost:3000`) and **`{{accessToken}}`** (a Super Admin JWT minted via `POST {{baseUrl}}/api/v1/auth/login`). Set these once on your Postman environment — see [§7 in 00 - overview](00%20-%20overview.md#7-postman-environment).

← [learning-goals](11%20-%20learning-goals.md) · **Next →** [categories](13%20-%20categories.md)

---

## Endpoint summary

Quick reference of every endpoint documented on this page. Section numbers link down to the detailed request/response contracts below.

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§12.1](#121) | `GET` | `{{baseUrl}}/api/v1/social-medias` | social_media.read | List social media platforms with filters and sort. |
| [§12.2](#122) | `GET` | `{{baseUrl}}/api/v1/social-medias/:id` | social_media.read | Get a single social media by id. |
| [§12.3](#123) | `POST` | `{{baseUrl}}/api/v1/social-medias` | social_media.create | Create a new social media. |
| [§12.4](#124) | `PATCH` | `{{baseUrl}}/api/v1/social-medias/:id` | social_media.update | Partial update (JSON body). |
| [§12.5](#125) | `DELETE` | `{{baseUrl}}/api/v1/social-medias/:id` | social_media.delete | Soft-delete. |
| [§12.6](#126) | `POST` | `{{baseUrl}}/api/v1/social-medias/:id/restore` | social_media.restore | Undo a soft-delete. |
| [§12.7](#127) | `PATCH` | `{{baseUrl}}/api/v1/social-medias/:id/icon` | social_media.update | Upload / replace / clear the icon via `multipart/form-data`. |

---

## 12.1 `GET /api/v1/social-medias`

List social medias.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/social-medias` |
| Permission | `social_media.read` |

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
  "message": "Permission denied: social_media.read",
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
| Search name — `linked` | `?searchTerm=linked` |
| Search + pagination | `?pageIndex=1&pageSize=50&searchTerm=linked` |
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
| Combo — active platforms, sort by name | `?pageIndex=1&pageSize=50&isActive=true&sortColumn=name&sortDirection=ASC` |

---

## 12.2 `GET /api/v1/social-medias/:id`

Read a single social media by id.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/social-medias/:id` |
| Permission | `social_media.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric social media id. |

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

Same as 12.1.

#### 403 FORBIDDEN

```json
{"success": false, "message": "Permission denied: social_media.read", "code": "FORBIDDEN"}
```

#### 404 NOT_FOUND

```json
{"success": false, "message": "Social Media 9999 not found", "code": "NOT_FOUND"}
```

---

## 12.3 `POST /api/v1/social-medias`

Create a social media. Permission: `social_media.create`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/social-medias` |
| Permission | `social_media.create` |

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
  "message": "Social Media created",
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
{"success": false, "message": "Permission denied: social_media.create", "code": "FORBIDDEN"}
```

#### 409 DUPLICATE_ENTRY

```json
{
  "success": false,
  "message": "Social Media with that name already exists",
  "code": "DUPLICATE_ENTRY"
}
```

---

## 12.4 `PATCH /api/v1/social-medias/:id`

Partial update.

**Postman request**

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/social-medias/:id` |
| Permission | `social_media.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric social media id. |

**Request body** (`application/json`)

```json
{
  "name": "Updated Name",
  "isActive": true
}
```

### Responses

#### 200 OK

Same row shape as 12.2, wrapped in success envelope.

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

Same as 12.3.

#### 404 NOT_FOUND

```json
{"success": false, "message": "Social Media 9999 not found", "code": "NOT_FOUND"}
```

#### 409 DUPLICATE_ENTRY

```json
{"success": false, "message": "Social Media with that name already exists", "code": "DUPLICATE_ENTRY"}
```

---

## 12.5 `DELETE /api/v1/social-medias/:id`

Soft delete. Permission: `social_media.delete`.

**Postman request**

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/social-medias/:id` |
| Permission | `social_media.delete` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric social media id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Social Media deleted",
  "data": {"id": 1, "deleted": true}
}
```

#### 400 BAD_REQUEST — already deleted

```json
{
  "success": false,
  "message": "Social Media with ID 1 does not exist or is already deleted.",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED / 403 FORBIDDEN

Same as 12.3.

#### 404 NOT_FOUND

```json
{"success": false, "message": "Social Media 9999 not found", "code": "NOT_FOUND"}
```

---

## 12.6 `POST /api/v1/social-medias/:id/restore`

Reverse a soft delete. Permission: `social_media.restore`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/social-medias/:id/restore` |
| Permission | `social_media.restore` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric social media id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Social Media restored",
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
  "message": "Social Media with ID 1 is not deleted or does not exist.",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED / 403 FORBIDDEN

Same as 12.3.

#### 404 NOT_FOUND

```json
{"success": false, "message": "Social Media 9999 not found", "code": "NOT_FOUND"}
```

---

## 12.7 `PATCH /api/v1/social-medias/:id/icon`

Dedicated file-upload sibling of the JSON `PATCH /api/v1/social-medias/:id`. Where that route takes a `application/json` body of text fields, **this route takes a `multipart/form-data` body with a binary `icon` part** and runs the file through the shared Bunny-CDN pipeline — decode with sharp, enforce the icon box (≤ 256 × 256), re-encode to WebP, delete the prior Bunny object (if any), PUT the new WebP under `social-medias/icons/<id>.webp`, and return the refreshed row with the new `iconUrl` in the same response. Permission: `social_media.update`.

> **Backend status.** The current Express router exposes this upload under `POST /api/v1/social-medias/:id/icon` (see `api/src/api/v1/resources/social-medias.routes.ts`) with `uploadSocialMediaIcon` multer middleware and the same Bunny pipeline described below. The `PATCH /api/v1/social-medias/:id/icon` form documented here is the target convention alignment with the other phase-2 resources; both `POST` and `PATCH` verbs are wired to the same handler during the transition.

**Postman request**

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/social-medias/:id/icon` |
| Permission | `social_media.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `multipart/form-data` (Postman sets the boundary automatically) |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric social media id. Must exist and not be soft-deleted. |

**Body** — `multipart/form-data`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `icon` | file | yes* | PNG / JPEG / WebP / SVG, **≤ 100 KB raw**, fits a 256 × 256 box. Re-encoded server-side to WebP ≤ 100 KB. |
| `iconAction` | text | no | Send `delete` (with no file part) to clear the existing icon. Mutually exclusive with a file upload. |

\* Either the file part **or** `iconAction=delete` must be present — sending neither is a `400 VALIDATION_ERROR`.

**Saved examples to add in Postman**

| Example name | Body |
|---|---|
| Upload new icon | `icon` = `linkedin-256.png` |
| Replace existing icon | `icon` = new file binary |
| Clear icon | `iconAction` = `delete` |

### Responses

#### 200 OK — icon uploaded

```json
{
  "success": true,
  "message": "Social media icon uploaded",
  "data": {
    "id": 2,
    "name": "LinkedIn",
    "iconUrl": "https://cdn.growupmore.com/social-medias/icons/2.webp",
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
  "message": "Social media icon deleted",
  "data": {
    "id": 2,
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
  "message": "Cannot upload a new social media icon AND iconAction=delete in the same request — pick one.",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — soft-deleted

```json
{
  "success": false,
  "message": "Social media 2 is soft-deleted; restore it before uploading a icon",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: social_media.update", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Social media 9999 not found", "code": "NOT_FOUND" }
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
  "message": "Failed to upload social media icon to CDN",
  "code": "BUNNY_UPLOAD_FAILED"
}
```

---

## Common errors across all social medias routes

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | zod rejected query, params, or body. |
| 400 | `BAD_REQUEST` | Business-rule violation (e.g., already-deleted row on restore). |
| 401 | `UNAUTHORIZED` | Missing or expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No social media with that id. |
| 409 | `DUPLICATE_ENTRY` | Name or code clashes with another non-deleted social media. |
| 429 | `RATE_LIMIT_EXCEEDED` | Global rate-limit tripped (default `100 / 15m`). |
| 500 | `INTERNAL_ERROR` | Unhandled exception; production response omits the stack. |
| 502 | `BUNNY_UPLOAD_FAILED` | Upload routes only — Bunny CDN Storage rejected the PUT. |
