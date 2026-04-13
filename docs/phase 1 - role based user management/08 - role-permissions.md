# Phase 1 — Role Permissions (junction)

Bind permissions to roles. All routes require auth. Permission codes: `permission.read` for reads, `permission.assign` for writes.

← [07 permissions](07%20-%20permissions.md) · **Next →** [09 user-permissions](09%20-%20user-permissions.md)

---

## Endpoint summary

Quick reference of every endpoint documented on this page. Section numbers link down to the detailed request/response contracts below.

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§8.1](#81) | `GET` | `{{baseUrl}}/api/v1/role-permissions` | role.read · permission.read | List role↔permission bindings. |
| [§8.2](#82) | `GET` | `{{baseUrl}}/api/v1/role-permissions/:id` | role.read · permission.read | Get a binding by id. |
| [§8.3](#83) | `POST` | `{{baseUrl}}/api/v1/role-permissions` | role.manage_permissions | Grant a permission to a role. |
| [§8.4](#84) | `POST` | `{{baseUrl}}/api/v1/role-permissions/revoke` | role.manage_permissions | Revoke a binding (tuple lookup, no id needed). |
| [§8.5](#85) | `DELETE` | `{{baseUrl}}/api/v1/role-permissions/:id` | role.manage_permissions | Soft-delete a binding. |
| [§8.6](#86) | `POST` | `{{baseUrl}}/api/v1/role-permissions/:id/restore` | role.manage_permissions | Undo a soft-delete. |

---

## 8.1 `GET /api/v1/role-permissions`

List role↔permission bindings. Backed by `udf_get_role_permissions`, with filters at role and permission layers and configurable sort keys.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/role-permissions` |
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
| `searchTerm` | string | — | `ILIKE` across `role_name`, `perm_name`, `perm_code`. |
| `roleId` | int | — | Filter by role. |
| `roleCode` | string | — | Filter by role code (e.g., `student`). |
| `permissionId` | int | — | Filter by permission. |
| `resource` | string | — | Lowercase identifier (e.g., `course`). |
| `action` | string | — | Lowercase identifier (e.g., `read`). |
| `scope` | string | — | Lowercase identifier (e.g., `global`, `own`). |
| `isActive` | bool | — | Filter active/inactive bindings. |
| `isDeleted` | bool | — | Filter deleted/undeleted bindings. |
| `sortColumn` | enum | `role_level` | One of `id`, `role_id`, `role_name`, `role_level`, `perm_name`, `perm_code`, `resource`, `created_at`. |
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
      "id": 312,
      "roleId": 4,
      "roleName": "Student",
      "roleLevel": 90,
      "permissionId": 17,
      "permName": "Read courses",
      "permCode": "course.read",
      "resource": "course",
      "action": "read",
      "scope": "global",
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
    "totalCount": 168,
    "totalPages": 9
  }
}
```

#### 400 VALIDATION_ERROR

Triggered by `pageSize > 200`, unknown `sortColumn`, non-positive `roleId`, unknown `resource`/`action`/`scope`, or query coercion failure.

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "pageSize", "message": "must be at most 200", "code": "too_big" }
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
| Search — text match on role/perm | `?searchTerm=course` |
| Filter by role id | `?roleId=4` |
| Filter by role code | `?roleCode=student` |
| Filter by permission id | `?permissionId=12` |
| Filter by resource | `?resource=course` |
| Filter by action | `?action=read` |
| Filter by scope | `?scope=global` |
| Active bindings only | `?isActive=true` |
| Inactive bindings only | `?isActive=false` |
| Deleted bindings only | `?isDeleted=true` |
| Non-deleted bindings only | `?isDeleted=false` |
| Sort by `id` DESC | `?sortColumn=id&sortDirection=DESC` |
| Sort by `role_id` ASC | `?sortColumn=role_id&sortDirection=ASC` |
| Sort by `role_name` ASC | `?sortColumn=role_name&sortDirection=ASC` |
| Sort by `role_level` ASC | `?sortColumn=role_level&sortDirection=ASC` |
| Sort by `perm_name` ASC | `?sortColumn=perm_name&sortDirection=ASC` |
| Sort by `perm_code` ASC | `?sortColumn=perm_code&sortDirection=ASC` |
| Sort by `resource` ASC | `?sortColumn=resource&sortDirection=ASC` |
| Sort by `created_at` DESC | `?sortColumn=created_at&sortDirection=DESC` |
| Combo — all perms for student role, by resource | `?pageIndex=1&pageSize=200&roleCode=student&isActive=true&sortColumn=resource&sortDirection=ASC` |
| Combo — global read perms across all roles | `?pageIndex=1&pageSize=200&resource=course&action=read&scope=global&sortColumn=role_name&sortDirection=ASC` |

---

## 8.2 `GET /api/v1/role-permissions/:id`

Read one binding by junction id.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/role-permissions/:id` |
| Permission | `permission.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric junction id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 312,
    "roleId": 4,
    "roleName": "Student",
    "roleLevel": 90,
    "permissionId": 17,
    "permName": "Read courses",
    "permCode": "course.read",
    "resource": "course",
    "action": "read",
    "scope": "global",
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
  "details": [{ "path": "id", "message": "Expected number, received nan", "code": "invalid_type" }]
}
```

#### 401 UNAUTHORIZED

Same as 8.1.

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: permission.read", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Role-permission 9999 not found", "code": "NOT_FOUND" }
```

---

## 8.3 `POST /api/v1/role-permissions`

Assign a permission to a role. Permission: `permission.assign`. Returns the full junction row on success.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/role-permissions` |
| Permission | `permission.assign` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** (`application/json`)

```json
{
  "roleId": 4,
  "permissionId": 17
}
```

**Required fields**: `roleId`, `permissionId` — both positive integers.

### Responses

#### 201 CREATED — happy path

```json
{
  "success": true,
  "message": "Role-permission assigned",
  "data": {
    "id": 312,
    "roleId": 4,
    "roleName": "Student",
    "roleLevel": 90,
    "permissionId": 17,
    "permName": "Read courses",
    "permCode": "course.read",
    "resource": "course",
    "action": "read",
    "scope": "global",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T15:30:42.115Z",
    "updatedAt": "2026-04-10T15:30:42.115Z",
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
    { "path": "permissionId", "message": "Required", "code": "invalid_type" }
  ]
}
```

#### 401 UNAUTHORIZED

Same as 8.1.

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: permission.assign", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND — referenced role or permission does not exist

```json
{ "success": false, "message": "Role 9999 not found", "code": "NOT_FOUND" }
```

#### 409 DUPLICATE_ENTRY — composite uniqueness on (roleId, permissionId)

```json
{
  "success": false,
  "message": "Role 4 already has permission 17",
  "code": "DUPLICATE_ENTRY"
}
```

---

## 8.4 `POST /api/v1/role-permissions/revoke`

Revoke by `(roleId, permissionId)` pair instead of junction id — handy when the caller doesn't know the row id. Permission: `permission.assign`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/role-permissions/revoke` |
| Permission | `permission.assign` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** (`application/json`)

```json
{
  "roleId": 4,
  "permissionId": 17
}
```

**Required fields**: `roleId`, `permissionId` — both positive integers.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Role-permission assignment revoked",
  "data": {
    "roleId": 4,
    "permissionId": 17,
    "revoked": true
  }
}
```

#### 400 VALIDATION_ERROR

Missing or invalid `roleId`/`permissionId` (non-numeric, non-positive).

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "roleId", "message": "must be positive", "code": "too_small" }
  ]
}
```

#### 401 UNAUTHORIZED

Same as 8.1.

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: permission.assign", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Role 4 does not have permission 17", "code": "NOT_FOUND" }
```

---

## 8.5 `DELETE /api/v1/role-permissions/:id`

Soft delete the binding by junction id. Sets `is_deleted = TRUE` on the row. Permission: `permission.assign`.

**Postman request**

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/role-permissions/:id` |
| Permission | `permission.assign` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric junction id. |

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Role-permission deleted",
  "data": {
    "id": 312,
    "deleted": true
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
  "details": [{ "path": "id", "message": "Expected number, received nan", "code": "invalid_type" }]
}
```

#### 401 UNAUTHORIZED

Same as 8.1.

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: permission.assign", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Role-permission 9999 not found", "code": "NOT_FOUND" }
```

---

## 8.6 `POST /api/v1/role-permissions/:id/restore`

Reverse a soft delete by junction id. Sets `is_deleted = FALSE` and returns the full restored row. Permission: `permission.assign`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/role-permissions/:id/restore` |
| Permission | `permission.assign` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric junction id. |

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Role-permission restored",
  "data": {
    "id": 312,
    "roleId": 4,
    "roleName": "Student",
    "roleLevel": 90,
    "permissionId": 17,
    "permName": "Read courses",
    "permCode": "course.read",
    "resource": "course",
    "action": "read",
    "scope": "global",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T15:30:42.115Z",
    "updatedAt": "2026-04-10T15:55:09.221Z",
    "deletedAt": null
  }
}
```

#### 400 BAD_REQUEST — row was never deleted

```json
{
  "success": false,
  "message": "Role-permission 312 is not deleted",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED

Same as 8.1.

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: permission.assign", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Role-permission 9999 not found", "code": "NOT_FOUND" }
```

---

## Common errors across all role-permissions routes

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod rejected query, params, or body (invalid enum, non-numeric id, bad pageSize, etc). |
| 400 | `BAD_REQUEST` | Business-rule violation (row was never deleted, cannot restore). |
| 401 | `UNAUTHORIZED` | Missing or expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission (`permission.read` or `permission.assign`). |
| 404 | `NOT_FOUND` | No role-permission with that id, or a referenced role/permission not found. |
| 409 | `DUPLICATE_ENTRY` | Duplicate binding on (roleId, permissionId) pair. |
| 429 | `RATE_LIMIT_EXCEEDED` | Global rate-limit tripped (default `100 / 15m`). |
| 500 | `INTERNAL_ERROR` | Unhandled exception; production response omits the stack. |
