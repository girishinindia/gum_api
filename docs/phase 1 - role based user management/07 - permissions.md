# Phase 1 — Permissions

RBAC permission catalog. All routes require auth. Permission codes: `permission.read`, `permission.create`, `permission.update`, `permission.delete`, `permission.restore`.

All examples below use the Postman environment variables **`{{baseUrl}}`** (e.g. `http://localhost:3000`) and **`{{accessToken}}`** (a Super Admin JWT minted via `POST {{baseUrl}}/api/v1/auth/login`). Set these once on your Postman environment — see [§7 in 00 - overview](00%20-%20overview.md#7-postman-environment).

← [06 roles](06%20-%20roles.md) · **Next →** [08 role-permissions](08%20-%20role-permissions.md)

---

## Endpoint summary

Quick reference of every endpoint documented on this page. Section numbers link down to the detailed request/response contracts below.

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§7.1](#71) | `GET` | `{{baseUrl}}/api/v1/permissions` | permission.read | List permissions with filters and sort. |
| [§7.2](#72) | `GET` | `{{baseUrl}}/api/v1/permissions/:id` | permission.read | Get a single permission by id. |
| [§7.3](#73) | `POST` | `{{baseUrl}}/api/v1/permissions` | permission.create | Create a new permission. |
| [§7.4](#74) | `PATCH` | `{{baseUrl}}/api/v1/permissions/:id` | permission.update | Partial update of a permission. |
| [§7.5](#75) | `DELETE` | `{{baseUrl}}/api/v1/permissions/:id` | **super_admin** + permission.delete | Soft-delete a permission. |
| [§7.6](#76) | `POST` | `{{baseUrl}}/api/v1/permissions/:id/restore` | **super_admin** + permission.restore | Undo a soft-delete. |

---

## 7.1 `GET /api/v1/permissions`

List permissions. Backed by `udf_get_permissions`, which exposes filters and sort keys across the permission catalog.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/permissions` |
| Permission | `permission.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | Page number (1-based). |
| `pageSize` | int | `20` | Max `200`. |
| `searchTerm` | string | — | `ILIKE` across name, code, and description. |
| `isActive` | bool | — | Filter by active status. |
| `isDeleted` | bool | — | Filter by deleted status. |
| `resource` | string | — | Lowercase identifier (e.g. `course`). |
| `action` | string | — | Lowercase identifier (e.g. `read`, `create`). |
| `scope` | string | — | Lowercase identifier (e.g. `global`, `own`). |
| `code` | string | — | Exact code match (slug-style). |
| `sortColumn` | enum | `display_order` | One of `id`, `display_order`, `name`, `code`, `resource`, `action`, `scope`, `is_active`, `created_at`, `updated_at`. |
| `sortDirection` | enum | `ASC` | `ASC` / `DESC`. |

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 1,
      "name": "Read users",
      "code": "user.read",
      "resource": "user",
      "action": "read",
      "scope": "global",
      "description": "View any user in the system",
      "displayOrder": 10,
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z",
      "deletedAt": null
    },
    {
      "id": 17,
      "name": "Read courses",
      "code": "course.read",
      "resource": "course",
      "action": "read",
      "scope": "global",
      "description": "View any course in the catalog",
      "displayOrder": 100,
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z",
      "deletedAt": null
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "totalCount": 42,
    "totalPages": 3
  }
}
```

#### 400 VALIDATION_ERROR — invalid query param

Triggered by invalid `resource` (uppercase rejected), unknown `sortColumn`, `pageSize` > 200, or any query coercion failure.

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "resource", "message": "must be lowercase alphanumerics or underscore", "code": "invalid_string" }
  ]
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: permission.read", "code": "FORBIDDEN" }
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
| Search name / code / description | `?searchTerm=create` |
| Active only | `?isActive=true` |
| Inactive only | `?isActive=false` |
| Deleted only | `?isDeleted=true` |
| Non-deleted only | `?isDeleted=false` |
| Filter by resource | `?resource=course` |
| Filter by action | `?action=read` |
| Filter by scope (`global`/`own`) | `?scope=global` |
| Filter by code (exact, slug-style) | `?code=course.read` |
| Sort by `id` DESC | `?sortColumn=id&sortDirection=DESC` |
| Sort by `display_order` ASC | `?sortColumn=display_order&sortDirection=ASC` |
| Sort by `name` ASC | `?sortColumn=name&sortDirection=ASC` |
| Sort by `code` ASC | `?sortColumn=code&sortDirection=ASC` |
| Sort by `resource` ASC | `?sortColumn=resource&sortDirection=ASC` |
| Sort by `action` ASC | `?sortColumn=action&sortDirection=ASC` |
| Sort by `scope` ASC | `?sortColumn=scope&sortDirection=ASC` |
| Sort by `is_active` DESC | `?sortColumn=is_active&sortDirection=DESC` |
| Sort by `created_at` DESC | `?sortColumn=created_at&sortDirection=DESC` |
| Sort by `updated_at` DESC | `?sortColumn=updated_at&sortDirection=DESC` |
| Combo — all global course permissions, by action | `?pageIndex=1&pageSize=50&resource=course&scope=global&sortColumn=action&sortDirection=ASC` |
| Combo — active permissions sorted by code | `?pageIndex=1&pageSize=200&isActive=true&sortColumn=code&sortDirection=ASC` |

---

## 7.2 `GET /api/v1/permissions/:id`

Read a single permission by id.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/permissions/:id` |
| Permission | `permission.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric permission id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 17,
    "name": "Read courses",
    "code": "course.read",
    "resource": "course",
    "action": "read",
    "scope": "global",
    "description": "View any course in the catalog",
    "displayOrder": 10,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z",
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
    { "path": "id", "message": "must be positive", "code": "too_small" }
  ]
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: permission.read", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Permission 9999 not found", "code": "NOT_FOUND" }
```

---

## 7.3 `POST /api/v1/permissions`

Create a permission. Permission: `permission.create`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/permissions` |
| Permission | `permission.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

```json
{
  "name": "Publish courses",
  "code": "course.publish",
  "resource": "course",
  "action": "publish",
  "scope": "global",
  "description": "Move a course from draft to published",
  "displayOrder": 30,
  "isActive": true
}
```

**Required fields**: `name`, `code`, `resource`, `action`.

**Optional fields**: `scope` (defaults to `global`), `description`, `displayOrder`, `isActive` (defaults to `true`).

**Field constraints**:
- `resource`, `action`, `scope` must be lowercase identifiers (`[a-z0-9_]+`)
- `code` must be lowercase alphanumerics, dot, or underscore
- `name` and `description` have length constraints

### Responses

#### 201 CREATED — happy path

```json
{
  "success": true,
  "message": "Permission created",
  "data": {
    "id": 43,
    "name": "Publish courses",
    "code": "course.publish",
    "resource": "course",
    "action": "publish",
    "scope": "global",
    "description": "Move a course from draft to published",
    "displayOrder": 30,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T14:25:11.802Z",
    "updatedAt": "2026-04-10T14:25:11.802Z",
    "deletedAt": null
  }
}
```

#### 400 VALIDATION_ERROR — uppercase resource

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "resource", "message": "must be lowercase alphanumerics or underscore", "code": "invalid_string" }
  ]
}
```

#### 400 VALIDATION_ERROR — bad code slug

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "code", "message": "code must be lowercase alphanumerics, dot or underscore", "code": "invalid_string" }
  ]
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: permission.create", "code": "FORBIDDEN" }
```

#### 409 DUPLICATE_ENTRY

```json
{
  "success": false,
  "message": "Permission with code=course.publish already exists",
  "code": "DUPLICATE_ENTRY"
}
```

---

## 7.4 `PATCH /api/v1/permissions/:id`

Partial update — supply any subset of fields, but at least one. Permission: `permission.update`. Same field constraints as create.

**Postman request**

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/permissions/:id` |
| Permission | `permission.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric permission id. |

**Request body** — sample variants:

*Update description and display order*

```json
{
  "description": "Move a course from draft to published, including curriculum review",
  "displayOrder": 35
}
```

*Deactivate permission*

```json
{
  "isActive": false
}
```

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Permission updated",
  "data": {
    "id": 43,
    "name": "Publish courses",
    "code": "course.publish",
    "resource": "course",
    "action": "publish",
    "scope": "global",
    "description": "Move a course from draft to published, including curriculum review",
    "displayOrder": 35,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T14:25:11.802Z",
    "updatedAt": "2026-04-10T14:48:33.910Z",
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
  "details": [
    { "path": "", "message": "Provide at least one field to update", "code": "custom" }
  ]
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: permission.update", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Permission 9999 not found", "code": "NOT_FOUND" }
```

#### 409 DUPLICATE_ENTRY

```json
{ "success": false, "message": "Permission with code=course.publish already exists", "code": "DUPLICATE_ENTRY" }
```

---

## 7.5 `DELETE /api/v1/permissions/:id`

Soft delete — sets `is_deleted = TRUE`. **Requires `super_admin` role** + permission: `permission.delete`.

**Postman request**

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/permissions/:id` |
| Permission | `**super_admin** + permission.delete` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric permission id. |

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Permission deleted",
  "data": { "id": 43, "deleted": true }
}
```

#### 400 VALIDATION_ERROR

Non-numeric id.

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "id", "message": "must be positive", "code": "too_small" }
  ]
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: permission.delete", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Permission 9999 not found", "code": "NOT_FOUND" }
```

---

## 7.6 `POST /api/v1/permissions/:id/restore`

Reverse a soft delete. **Requires `super_admin` role** + permission: `permission.restore`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/permissions/:id/restore` |
| Permission | `**super_admin** + permission.restore` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric permission id. |

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Permission restored",
  "data": {
    "id": 43,
    "name": "Publish courses",
    "code": "course.publish",
    "resource": "course",
    "action": "publish",
    "scope": "global",
    "description": "Move a course from draft to published, including curriculum review",
    "displayOrder": 35,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T14:25:11.802Z",
    "updatedAt": "2026-04-10T15:02:48.118Z",
    "deletedAt": null
  }
}
```

#### 400 BAD_REQUEST — not deleted

```json
{
  "success": false,
  "message": "Permission 43 is not deleted",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: permission.restore", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Permission 9999 not found", "code": "NOT_FOUND" }
```

---

## Common errors across all permission routes

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | zod rejected query, params, or body. |
| 400 | `BAD_REQUEST` | Business-rule violation (e.g., restoring a non-deleted permission). |
| 401 | `UNAUTHORIZED` | Missing or expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No permission with that id. |
| 409 | `DUPLICATE_ENTRY` | Another permission already uses the same `code`. |
| 429 | `RATE_LIMIT_EXCEEDED` | Global rate-limit tripped (default `100 / 15m`). |
| 500 | `INTERNAL_ERROR` | Unhandled exception; production response omits the stack. |
