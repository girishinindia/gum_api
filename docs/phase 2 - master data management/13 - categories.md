# Phase 2 — Categories

Top-level content taxonomy with translations per language. Also exposes Bunny-backed icon and image upload routes.

All routes require auth. Permission codes: `category.read`, `category.create`, `category.update`, `category.delete`, `category.restore`.

All examples below use the Postman environment variables **`{{baseUrl}}`** (e.g. `http://localhost:3000`) and **`{{accessToken}}`** (a Super Admin JWT minted via `POST {{baseUrl}}/api/v1/auth/login`). Set these once on your Postman environment — see [§7 in 00 - overview](00%20-%20overview.md#7-postman-environment).

← [social-medias](12%20-%20social-medias.md) · **Next →** [sub-categories](14%20-%20sub-categories.md)

---

## Endpoint summary

Quick reference of every endpoint documented on this page. Section numbers link down to the detailed request/response contracts below.

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§13.1](#131) | `GET` | `{{baseUrl}}/api/v1/categories` | category.read | List categories with filters and sort. |
| [§13.2](#132) | `GET` | `{{baseUrl}}/api/v1/categories/:id` | category.read | Get a single category by id. |
| [§13.3](#133) | `POST` | `{{baseUrl}}/api/v1/categories` | category.create | Create a new category. JSON **or** `multipart/form-data`. |
| [§13.4](#134) | `PATCH` | `{{baseUrl}}/api/v1/categories/:id` | category.update | Partial update — JSON or multipart with `icon`/`image`. |
| [§13.5](#135) | `DELETE` | `{{baseUrl}}/api/v1/categories/:id` | **super_admin** + category.delete | Soft-delete. |
| [§13.6](#136) | `POST` | `{{baseUrl}}/api/v1/categories/:id/restore` | **super_admin** + category.restore | Undo a soft-delete. |
| [§13.7](#137) | `PATCH` | `{{baseUrl}}/api/v1/categories/:id/icon` | category.update | Upload / replace / clear icon via `multipart/form-data`. |
| [§13.9](#139) | `PATCH` | `{{baseUrl}}/api/v1/categories/:id/image` | category.update | Upload / replace / clear image via `multipart/form-data`. |

---

## 13.1 `GET /api/v1/categories`

List categories.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/categories` |
| Permission | `category.read` |

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
  "message": "Permission denied: category.read",
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
| Search name — `tech` | `?searchTerm=tech` |
| Search + pagination | `?pageIndex=1&pageSize=50&searchTerm=tech` |
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
| Combo — active categories, sort by name | `?pageIndex=1&pageSize=50&isActive=true&sortColumn=name&sortDirection=ASC` |

---

## 13.2 `GET /api/v1/categories/:id`

Read a single category by id.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/categories/:id` |
| Permission | `category.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric category id. |

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

Same as 13.1.

#### 403 FORBIDDEN

```json
{"success": false, "message": "Permission denied: category.read", "code": "FORBIDDEN"}
```

#### 404 NOT_FOUND

```json
{"success": false, "message": "Category 9999 not found", "code": "NOT_FOUND"}
```

---

## 13.3 `POST /api/v1/categories`

Create a category. Permission: `category.create`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/categories` |
| Permission | `category.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` or `multipart/form-data` |

**Request body** — JSON or multipart/form-data

#### Option 1: `application/json`

```json
{
  "name": "Example",
  "isActive": true
}
```

**Required fields**: `name`.

**Optional fields**: `isActive` (defaults to **`false`** — see [§6 in 00 - overview](00%20-%20overview.md#6-active-flag-defaults)).

#### Option 2: `multipart/form-data`

Include text fields plus optional image files. All files are processed through the WebP pipeline.

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | text | yes | Category name. |
| `isActive` | text | no | `true` or `false`; defaults to `false`. |
| `icon` | file | no | PNG / JPEG / WebP / SVG, **≤ 100 KB raw**. Processed to WebP. Optional field aliases: `iconImage`, `file`. |
| `image` / `categoryImage` | file | no | PNG / JPEG / WebP / SVG, **≤ 100 KB raw**. Processed to WebP. Optional field alias: `categoryImage`. |

When both files are provided, both `iconUrl` and `imageUrl` will appear in the response.

**Postman examples**

| # | Example name | Content-Type | Body |
|---|---|---|---|
| 1 | Create — JSON (no images) | `application/json` | `{ "name": "Technology", "isActive": true }` |
| 2 | Create — form-data + icon + image | `multipart/form-data` | `name` = `Technology`, `isActive` = `true`, `icon` = `tech-icon.png` (file), `image` = `tech-hero.png` (file) |

### Responses

#### 201 CREATED

**JSON or form-data (without files):**

```json
{
  "success": true,
  "message": "Category created",
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

**Form-data with `icon` and/or `image` files:**

```json
{
  "success": true,
  "message": "Category created",
  "data": {
    "id": 1,
    "name": "Example",
    "iconUrl": "https://cdn.growupmore.com/categories/icons/1.webp",
    "imageUrl": "https://cdn.growupmore.com/categories/images/1.webp",
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
{"success": false, "message": "Permission denied: category.create", "code": "FORBIDDEN"}
```

#### 400 BAD_REQUEST — file too large (form-data only)

```json
{
  "success": false,
  "message": "File too large: icon must be ≤ 100 KB raw",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — unsupported file type (form-data only)

```json
{
  "success": false,
  "message": "Unsupported media type: expected image/png, image/jpeg, image/webp, or image/svg+xml",
  "code": "BAD_REQUEST"
}
```

#### 409 DUPLICATE_ENTRY

```json
{
  "success": false,
  "message": "Category with that name already exists",
  "code": "DUPLICATE_ENTRY"
}
```

---

## 13.4 `PATCH /api/v1/categories/:id`

Partial update.

**Postman request**

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/categories/:id` |
| Permission | `category.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric category id. |

**Request body** (`application/json`)

```json
{
  "name": "Updated Name",
  "isActive": true
}
```

**Postman examples**

| # | Example name | Content-Type | Body |
|---|---|---|---|
| 1 | Update — JSON (no images) | `application/json` | `{ "displayOrder": 2, "isActive": true }` |
| 2 | Update — form-data + text + icon + image | `multipart/form-data` | `slug` = `technology`, `icon` = `tech-v2.png` (file), `image` = `tech-hero-v2.png` (file) |
| 3 | Update — form-data image only | `multipart/form-data` | `icon` = `new-icon.png` (file) |

### Responses

#### 200 OK

Same row shape as 13.2, wrapped in success envelope.

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

Same as 13.3.

#### 404 NOT_FOUND

```json
{"success": false, "message": "Category 9999 not found", "code": "NOT_FOUND"}
```

#### 409 DUPLICATE_ENTRY

```json
{"success": false, "message": "Category with that name already exists", "code": "DUPLICATE_ENTRY"}
```

---

## 13.5 `DELETE /api/v1/categories/:id`

Soft delete. **Requires `super_admin` role** + permission: `category.delete`.

**Postman request**

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/categories/:id` |
| Permission | **super_admin** + `category.delete` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric category id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Category deleted",
  "data": {"id": 1, "deleted": true}
}
```

#### 400 BAD_REQUEST — already deleted

```json
{
  "success": false,
  "message": "Category with ID 1 does not exist or is already deleted.",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED / 403 FORBIDDEN

Same as 13.3.

#### 404 NOT_FOUND

```json
{"success": false, "message": "Category 9999 not found", "code": "NOT_FOUND"}
```

---

## 13.6 `POST /api/v1/categories/:id/restore`

Reverse a soft delete. **Requires `super_admin` role** + permission: `category.restore`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/categories/:id/restore` |
| Permission | **super_admin** + `category.restore` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric category id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Category restored",
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
  "message": "Category with ID 1 is not deleted or does not exist.",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED / 403 FORBIDDEN

Same as 13.3.

#### 404 NOT_FOUND

```json
{"success": false, "message": "Category 9999 not found", "code": "NOT_FOUND"}
```

---

## 13.7 `PATCH /api/v1/categories/:id/icon`

Dedicated file-upload sibling of the JSON `PATCH /api/v1/categories/:id`. Where that route takes a `application/json` body of text fields, **this route takes a `multipart/form-data` body with a binary `icon` part** and runs the file through the shared Bunny-CDN pipeline — decode with sharp, enforce the icon box (≤ 256 × 256), re-encode to WebP, delete the prior Bunny object (if any), PUT the new WebP under `categories/icons/<id>.webp`, and return the refreshed row with the new `iconUrl` in the same response. Permission: `category.update`.

> **Backend status.** The categories router already unifies icon uploads into `PATCH /api/v1/categories/:id` — the single handler accepts both JSON text-field bodies (§13.4) and `multipart/form-data` bodies with `icon` / `image` file parts or `iconAction=delete` / `imageAction=delete` fields. This section documents the dedicated `/icon` sub-route that is mirrored on the same handler for client convenience.

**Postman request**

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/categories/:id/icon` |
| Permission | `category.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `multipart/form-data` (Postman sets the boundary automatically) |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric categorie id. Must exist and not be soft-deleted. |

**Body** — `multipart/form-data`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `icon` | file | yes* | PNG / JPEG / WebP / SVG, **≤ 100 KB raw**, fits a 256 × 256 box. Re-encoded server-side to WebP ≤ 100 KB. |
| `iconAction` | text | no | Send `delete` (with no file part) to clear the existing icon. Mutually exclusive with a file upload. |

\* Either the file part **or** `iconAction=delete` must be present — sending neither is a `400 VALIDATION_ERROR`.

**Saved examples to add in Postman**

| Example name | Body |
|---|---|
| Upload new icon | `icon` = `technology-256.png` |
| Replace existing icon | `icon` = new file binary |
| Clear icon | `iconAction` = `delete` |

### Responses

#### 200 OK — icon uploaded

```json
{
  "success": true,
  "message": "Category icon uploaded",
  "data": {
    "id": 5,
    "name": "Technology",
    "iconUrl": "https://cdn.growupmore.com/categories/icons/5.webp",
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
  "message": "Category icon deleted",
  "data": {
    "id": 5,
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
  "message": "Cannot upload a new categorie icon AND iconAction=delete in the same request — pick one.",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — soft-deleted

```json
{
  "success": false,
  "message": "Category 5 is soft-deleted; restore it before uploading a icon",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: category.update", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Category 9999 not found", "code": "NOT_FOUND" }
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
  "message": "Failed to upload categorie icon to CDN",
  "code": "BUNNY_UPLOAD_FAILED"
}
```

---

## 13.9 `PATCH /api/v1/categories/:id/image`

Dedicated file-upload sibling of the JSON `PATCH /api/v1/categories/:id`. Where that route takes a `application/json` body of text fields, **this route takes a `multipart/form-data` body with a binary `image` part** and runs the file through the shared Bunny-CDN pipeline — decode with sharp, enforce the image box (≤ 1024 × 1024), re-encode to WebP, delete the prior Bunny object (if any), PUT the new WebP under `categories/images/<id>.webp`, and return the refreshed row with the new `imageUrl` in the same response. Permission: `category.update`.

> **Backend status.** Same unified handler as §13.7 — `PATCH /api/v1/categories/:id` also accepts the `image` multipart field and the `imageAction=delete` clearer. This dedicated `/image` sub-route is a client convenience that hits the same backing code.

**Postman request**

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/categories/:id/image` |
| Permission | `category.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `multipart/form-data` (Postman sets the boundary automatically) |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric categorie id. Must exist and not be soft-deleted. |

**Body** — `multipart/form-data`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `image` | file | yes* | PNG / JPEG / WebP / SVG, **≤ 100 KB raw**, fits a 1024 × 1024 box. Re-encoded server-side to WebP ≤ 100 KB. |
| `imageAction` | text | no | Send `delete` (with no file part) to clear the existing image. Mutually exclusive with a file upload. |

\* Either the file part **or** `imageAction=delete` must be present — sending neither is a `400 VALIDATION_ERROR`.

**Saved examples to add in Postman**

| Example name | Body |
|---|---|
| Upload new image | `image` = `technology-hero-1024.webp` |
| Replace existing image | `image` = new file binary |
| Clear image | `imageAction` = `delete` |

### Responses

#### 200 OK — image uploaded

```json
{
  "success": true,
  "message": "Category image uploaded",
  "data": {
    "id": 5,
    "name": "Technology",
    "imageUrl": "https://cdn.growupmore.com/categories/images/5.webp",
    "isActive": true,
    "isDeleted": false,
    "updatedAt": "2026-04-11T12:14:55.108Z"
  }
}
```

#### 200 OK — image cleared (`imageAction=delete`)

```json
{
  "success": true,
  "message": "Category image deleted",
  "data": {
    "id": 5,
    "imageUrl": null,
    "updatedAt": "2026-04-11T12:15:02.771Z"
  }
}
```

#### 400 VALIDATION_ERROR — missing file part and no delete action

```json
{
  "success": false,
  "message": "image field is required (multipart/form-data) or imageAction=delete",
  "code": "VALIDATION_ERROR"
}
```

#### 400 BAD_REQUEST — file too large

```json
{
  "success": false,
  "message": "File too large: image must be ≤ 100 KB raw",
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
  "message": "Cannot upload a new categorie image AND imageAction=delete in the same request — pick one.",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — soft-deleted

```json
{
  "success": false,
  "message": "Category 5 is soft-deleted; restore it before uploading a image",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: category.update", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Category 9999 not found", "code": "NOT_FOUND" }
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
  "message": "Failed to upload categorie image to CDN",
  "code": "BUNNY_UPLOAD_FAILED"
}
```

---

## Common errors across all categories routes

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | zod rejected query, params, or body. |
| 400 | `BAD_REQUEST` | Business-rule violation (e.g., already-deleted row on restore). |
| 401 | `UNAUTHORIZED` | Missing or expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No category with that id. |
| 409 | `DUPLICATE_ENTRY` | Name or code clashes with another non-deleted category. |
| 429 | `RATE_LIMIT_EXCEEDED` | Global rate-limit tripped (default `100 / 15m`). |
| 500 | `INTERNAL_ERROR` | Unhandled exception; production response omits the stack. |
| 502 | `BUNNY_UPLOAD_FAILED` | Upload routes only — Bunny CDN Storage rejected the PUT. |
