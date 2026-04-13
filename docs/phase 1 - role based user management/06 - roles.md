# Phase 1 — Roles

RBAC role catalog. All routes require auth. Permission codes: `role.read`, `role.create`, `role.update`, `role.delete`, `role.restore`.

All examples below use the Postman environment variables **`{{baseUrl}}`** (e.g. `http://localhost:3000`) and **`{{accessToken}}`** (a Super Admin JWT minted via `POST {{baseUrl}}/api/v1/auth/login`). Set these once on your Postman environment — see [§7 in 00 - overview](00%20-%20overview.md#7-postman-environment).

> **System roles** (`super_admin`, `admin`, `instructor`, `student`) are protected by the database — they cannot be deleted, even by a super-admin. Attempts return **400 BAD_REQUEST**.

← [05 countries](05%20-%20countries.md) · **Next →** [07 permissions](07%20-%20permissions.md)

---

## Endpoint summary

Quick reference of every endpoint documented on this page. Section numbers link down to the detailed request/response contracts below.

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§6.1](#61) | `GET` | `{{baseUrl}}/api/v1/roles` | role.read | List roles with filters and sort. |
| [§6.2](#62) | `GET` | `{{baseUrl}}/api/v1/roles/:id` | role.read | Get a single role by id. |
| [§6.3](#63) | `POST` | `{{baseUrl}}/api/v1/roles` | role.create | Create a new role. |
| [§6.4](#64) | `PATCH` | `{{baseUrl}}/api/v1/roles/:id` | role.update | Partial update of a role. |
| [§6.5](#65) | `DELETE` | `{{baseUrl}}/api/v1/roles/:id` | **super_admin** + role.delete | Soft-delete a role. |
| [§6.6](#66) | `POST` | `{{baseUrl}}/api/v1/roles/:id/restore` | **super_admin** + role.restore | Undo a soft-delete. |

---

## 6.1 `GET /api/v1/roles`

List roles. Backed by `udf_get_roles`, which exposes filters and sort keys across the role catalog.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/roles` |
| Permission | `role.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | Page number (1-based). |
| `pageSize` | int | `20` | Max `200`. |
| `searchTerm` | string | — | `ILIKE` across name and code. |
| `isActive` | bool | — | Filter by active status. |
| `level` | int | — | Exact level match (0–99). |
| `parentRoleId` | int | — | Filter by parent role id. |
| `isSystemRole` | bool | — | Filter by system role flag. |
| `code` | string | — | Exact code match (slug-style). |
| `sortColumn` | enum | `display_order` | One of `display_order`, `name`, `code`, `level`, `created_at`. |
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
      "name": "Super Admin",
      "code": "super_admin",
      "description": "Full system access",
      "parentRoleId": null,
      "level": 0,
      "isSystemRole": true,
      "displayOrder": 10,
      "icon": "crown",
      "color": "#ef4444",
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z",
      "deletedAt": null
    },
    {
      "id": 4,
      "name": "Student",
      "code": "student",
      "description": "Default end-user role",
      "parentRoleId": null,
      "level": 90,
      "isSystemRole": true,
      "displayOrder": 40,
      "icon": "graduation-cap",
      "color": "#3b82f6",
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
    "totalCount": 4,
    "totalPages": 1
  }
}
```

#### 400 VALIDATION_ERROR — invalid query param

Triggered by invalid `level` (> 99), unknown `sortColumn`, `pageSize` > 200, or any query coercion failure.

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "path": "level",
      "message": "Number must be less than or equal to 99",
      "code": "too_big"
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
{ "success": false, "message": "Permission denied: role.read", "code": "FORBIDDEN" }
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
| Search name / code — `admin` | `?searchTerm=admin` |
| Search + pagination | `?pageIndex=1&pageSize=50&searchTerm=admin` |
| Active only | `?isActive=true` |
| Inactive only | `?isActive=false` |
| Filter by level (exact) | `?level=50` |
| Filter by parent role id | `?parentRoleId=1` |
| System roles only | `?isSystemRole=true` |
| Non-system roles only | `?isSystemRole=false` |
| Filter by code (exact) | `?code=instructor` |
| Sort by `display_order` ASC | `?sortColumn=display_order&sortDirection=ASC` |
| Sort by `display_order` DESC | `?sortColumn=display_order&sortDirection=DESC` |
| Sort by `name` ASC | `?sortColumn=name&sortDirection=ASC` |
| Sort by `code` ASC | `?sortColumn=code&sortDirection=ASC` |
| Sort by `level` ASC | `?sortColumn=level&sortDirection=ASC` |
| Sort by `created_at` DESC | `?sortColumn=created_at&sortDirection=DESC` |
| Combo — active non-system roles, sort by level | `?pageIndex=1&pageSize=50&isActive=true&isSystemRole=false&sortColumn=level&sortDirection=ASC` |
| Combo — children of role 1, sorted by order | `?pageIndex=1&pageSize=50&parentRoleId=1&sortColumn=display_order&sortDirection=ASC` |

---

## 6.2 `GET /api/v1/roles/:id`

Read a single role by id.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/roles/:id` |
| Permission | `role.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric role id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 4,
    "name": "Student",
    "code": "student",
    "description": "Default end-user role",
    "parentRoleId": null,
    "level": 90,
    "isSystemRole": true,
    "displayOrder": 40,
    "icon": "graduation-cap",
    "color": "#3b82f6",
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
{ "success": false, "message": "Permission denied: role.read", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Role 9999 not found", "code": "NOT_FOUND" }
```

---

## 6.3 `POST /api/v1/roles`

Create a custom role. Permission: `role.create`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/roles` |
| Permission | `role.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

```json
{
  "name": "Course Author",
  "code": "course_author",
  "description": "Can author and publish courses",
  "parentRoleId": 3,
  "level": 50,
  "isSystemRole": false,
  "displayOrder": 25,
  "icon": "pen",
  "color": "#10b981",
  "isActive": true
}
```

**Required fields**: `name`, `code`.

**Optional fields**: `description`, `parentRoleId`, `level` (defaults to `99`), `isSystemRole` (defaults to `false`), `displayOrder` (defaults to `0`), `icon`, `color`, `isActive` (defaults to `true`).

**Field constraints**:
- `code` must be lowercase alphanumerics, dot, or underscore
- `color` must be hex format (`#fff` or `#ffffff`)
- `level` must be 0–99
- `name` and `description` have length constraints

### Responses

#### 201 CREATED — happy path

```json
{
  "success": true,
  "message": "Role created",
  "data": {
    "id": 12,
    "name": "Course Author",
    "code": "course_author",
    "description": "Can author and publish courses",
    "parentRoleId": 3,
    "level": 50,
    "isSystemRole": false,
    "displayOrder": 25,
    "icon": "pen",
    "color": "#10b981",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T13:14:55.221Z",
    "updatedAt": "2026-04-10T13:14:55.221Z",
    "deletedAt": null
  }
}
```

#### 400 VALIDATION_ERROR — invalid code

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

#### 400 VALIDATION_ERROR — bad hex color

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "color", "message": "color must be a hex code (#fff or #ffffff)", "code": "invalid_string" }
  ]
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: role.create", "code": "FORBIDDEN" }
```

#### 409 DUPLICATE_ENTRY

```json
{
  "success": false,
  "message": "Role with code=course_author already exists",
  "code": "DUPLICATE_ENTRY"
}
```

---

## 6.4 `PATCH /api/v1/roles/:id`

Partial update — supply any subset of fields, but at least one. Permission: `role.update`. Same field constraints as create.

**Postman request**

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/roles/:id` |
| Permission | `role.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric role id. |

**Request body** — sample variants:

*Update description and display order*

```json
{
  "description": "Authors and publishes courses, manages enrolments",
  "displayOrder": 30
}
```

*Change color*

```json
{
  "color": "#16a34a"
}
```

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Role updated",
  "data": {
    "id": 12,
    "name": "Course Author",
    "code": "course_author",
    "description": "Authors and publishes courses, manages enrolments",
    "parentRoleId": 3,
    "level": 50,
    "isSystemRole": false,
    "displayOrder": 30,
    "icon": "pen",
    "color": "#16a34a",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T13:14:55.221Z",
    "updatedAt": "2026-04-10T13:42:08.117Z",
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
{ "success": false, "message": "Permission denied: role.update", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Role 9999 not found", "code": "NOT_FOUND" }
```

#### 409 DUPLICATE_ENTRY

```json
{ "success": false, "message": "Role with code=course_author already exists", "code": "DUPLICATE_ENTRY" }
```

---

## 6.5 `DELETE /api/v1/roles/:id`

Soft delete — sets `is_deleted = TRUE`. **Blocked at the DB layer if the role's `isSystemRole = true`**. **Requires `super_admin` role** + permission: `role.delete`.

**Postman request**

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/roles/:id` |
| Permission | `**super_admin** + role.delete` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric role id. |

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Role deleted",
  "data": { "id": 12, "deleted": true }
}
```

#### 400 BAD_REQUEST — system role

```json
{
  "success": false,
  "message": "System roles cannot be deleted",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: role.delete", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Role 9999 not found", "code": "NOT_FOUND" }
```

---

## 6.6 `POST /api/v1/roles/:id/restore`

Reverse a soft delete. **Requires `super_admin` role** + permission: `role.restore`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/roles/:id/restore` |
| Permission | `**super_admin** + role.restore` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric role id. |

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Role restored",
  "data": {
    "id": 12,
    "name": "Course Author",
    "code": "course_author",
    "description": "Authors and publishes courses, manages enrolments",
    "parentRoleId": 3,
    "level": 50,
    "isSystemRole": false,
    "displayOrder": 30,
    "icon": "pen",
    "color": "#16a34a",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T13:14:55.221Z",
    "updatedAt": "2026-04-10T14:01:37.224Z",
    "deletedAt": null
  }
}
```

#### 400 BAD_REQUEST — not deleted

```json
{
  "success": false,
  "message": "Role 12 is not deleted",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: role.restore", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Role 9999 not found", "code": "NOT_FOUND" }
```

---

## Common errors across all role routes

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | zod rejected query, params, or body. |
| 400 | `BAD_REQUEST` | Tried to delete a system role. |
| 401 | `UNAUTHORIZED` | Missing or expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No role with that id. |
| 409 | `DUPLICATE_ENTRY` | Another role already uses the same `code`. |
| 429 | `RATE_LIMIT_EXCEEDED` | Global rate-limit tripped (default `100 / 15m`). |
| 500 | `INTERNAL_ERROR` | Unhandled exception; production response omits the stack. |
