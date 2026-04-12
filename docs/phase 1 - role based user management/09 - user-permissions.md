# Phase 1 — User Permissions (junction)

User-level overrides on top of the role-based defaults. A user can be **granted** an extra permission their role doesn't carry, or **denied** a permission their role does carry. This mechanism lets you fine-tune access on a per-user basis without rewriting the entire role hierarchy.

All routes require auth. Permission codes: `permission.read` for reads, `permission.assign` for writes.

← [08 role-permissions](08%20-%20role-permissions.md) · **Next →** [10 walkthrough and index](10%20-%20walkthrough%20and%20index.md)

---

## Endpoint summary

Quick reference of every endpoint documented on this page. Section numbers link down to the detailed request/response contracts below.

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§9.1](#91) | `GET` | `{{baseUrl}}/api/v1/user-permissions` | user.manage_permissions | List user-permission overrides. |
| [§9.2](#92) | `GET` | `{{baseUrl}}/api/v1/user-permissions/:id` | user.manage_permissions | Get a user-permission override by id. |
| [§9.3](#93) | `POST` | `{{baseUrl}}/api/v1/user-permissions` | user.manage_permissions | Create a user-level grant or deny. |
| [§9.4](#94) | `POST` | `{{baseUrl}}/api/v1/user-permissions/revoke` | user.manage_permissions | Revoke an override by tuple lookup. |
| [§9.5](#95) | `DELETE` | `{{baseUrl}}/api/v1/user-permissions/:id` | user.manage_permissions | Soft-delete an override. |
| [§9.6](#96) | `POST` | `{{baseUrl}}/api/v1/user-permissions/:id/restore` | user.manage_permissions | Undo a soft-delete. |

---

## 9.1 `GET /api/v1/user-permissions`

List user-level overrides. Backed by `udf_get_user_permissions`.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-permissions` |
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
| `searchTerm` | string | — | `ILIKE` across `user_name`, `perm_name`, `perm_code`. |
| `userId` | int | — | Filter to one user. |
| `permissionId` | int | — | Filter to one permission. |
| `grantType` | enum | — | `grant` or `deny`. |
| `resource` | string | — | Lowercase identifier (e.g., `course`). |
| `action` | string | — | Lowercase identifier (e.g., `publish`). |
| `scope` | string | — | Lowercase identifier (e.g., `global`, `own`). |
| `isActive` | bool | — | Filter active/inactive overrides. |
| `isDeleted` | bool | — | Filter deleted/undeleted overrides. |
| `sortColumn` | enum | `id` | One of `id`, `user_id`, `user_name`, `perm_name`, `perm_code`, `resource`, `grant_type`, `created_at`. |
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
      "id": 91,
      "userId": 42,
      "userName": "Asha Patel",
      "permissionId": 28,
      "permName": "Publish courses",
      "permCode": "course.publish",
      "resource": "course",
      "action": "publish",
      "scope": "global",
      "grantType": "grant",
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-08T13:00:00.000Z",
      "updatedAt": "2026-04-08T13:00:00.000Z",
      "deletedAt": null
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "totalCount": 23,
    "totalPages": 2
  }
}
```

#### 400 VALIDATION_ERROR

Triggered by `pageSize > 200`, unknown `grantType`, unknown `sortColumn`, non-numeric `userId`, or query coercion failure.

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "grantType", "message": "Invalid enum value. Expected 'grant' | 'deny', received 'allow'", "code": "invalid_enum_value" }
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
| Search — text match on user/perm | `?searchTerm=publish` |
| Filter by user id | `?userId=42` |
| Filter by permission id | `?permissionId=12` |
| Grant-type `grant` only | `?grantType=grant` |
| Grant-type `deny` only | `?grantType=deny` |
| Filter by resource | `?resource=course` |
| Filter by action | `?action=publish` |
| Filter by scope | `?scope=global` |
| Active overrides only | `?isActive=true` |
| Inactive overrides only | `?isActive=false` |
| Deleted overrides only | `?isDeleted=true` |
| Non-deleted overrides only | `?isDeleted=false` |
| Sort by `id` DESC | `?sortColumn=id&sortDirection=DESC` |
| Sort by `user_id` ASC | `?sortColumn=user_id&sortDirection=ASC` |
| Sort by `user_name` ASC | `?sortColumn=user_name&sortDirection=ASC` |
| Sort by `perm_name` ASC | `?sortColumn=perm_name&sortDirection=ASC` |
| Sort by `perm_code` ASC | `?sortColumn=perm_code&sortDirection=ASC` |
| Sort by `resource` ASC | `?sortColumn=resource&sortDirection=ASC` |
| Sort by `grant_type` ASC | `?sortColumn=grant_type&sortDirection=ASC` |
| Sort by `created_at` DESC | `?sortColumn=created_at&sortDirection=DESC` |
| Combo — active grants for user 42 | `?pageIndex=1&pageSize=100&userId=42&grantType=grant&isActive=true&sortColumn=perm_name&sortDirection=ASC` |
| Combo — deny overrides on `course.publish` | `?pageIndex=1&pageSize=100&permissionId=12&grantType=deny&sortColumn=user_name&sortDirection=ASC` |

---

## 9.2 `GET /api/v1/user-permissions/:id`

Read one override by junction id.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-permissions/:id` |
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
    "id": 91,
    "userId": 42,
    "userName": "Asha Patel",
    "permissionId": 28,
    "permName": "Publish courses",
    "permCode": "course.publish",
    "resource": "course",
    "action": "publish",
    "scope": "global",
    "grantType": "grant",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-08T13:00:00.000Z",
    "updatedAt": "2026-04-08T13:00:00.000Z",
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

Same as 9.1.

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: permission.read", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "User-permission 9999 not found", "code": "NOT_FOUND" }
```

---

## 9.3 `POST /api/v1/user-permissions`

Assign a grant or deny override to a user. Permission: `permission.assign`. The `grantType` defaults to `grant` if omitted.

> **Grant vs. Deny semantics.** A `deny` row strips a permission the user would otherwise inherit from their role. A `grant` row adds a permission the user's role does not carry. The effective permission set is computed at login as (role-based perms) ∪ (granted overrides) − (denied overrides).

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-permissions` |
| Permission | `permission.assign` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** (`application/json`)

```json
{
  "userId": 42,
  "permissionId": 28,
  "grantType": "grant"
}
```

**Required fields**: `userId`, `permissionId` — both positive integers. **Optional fields**: `grantType` (defaults to `grant`).

### Responses

#### 201 CREATED — happy path

```json
{
  "success": true,
  "message": "User-permission assigned",
  "data": {
    "id": 91,
    "userId": 42,
    "userName": "Asha Patel",
    "permissionId": 28,
    "permName": "Publish courses",
    "permCode": "course.publish",
    "resource": "course",
    "action": "publish",
    "scope": "global",
    "grantType": "grant",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T16:18:55.412Z",
    "updatedAt": "2026-04-10T16:18:55.412Z",
    "deletedAt": null
  }
}
```

#### 400 VALIDATION_ERROR — missing required field or bad enum

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "grantType", "message": "Invalid enum value. Expected 'grant' | 'deny', received 'allow'", "code": "invalid_enum_value" }
  ]
}
```

#### 401 UNAUTHORIZED

Same as 9.1.

#### 403 FORBIDDEN — missing permission or hierarchy guard tripped

```json
{ "success": false, "message": "Permission denied: permission.assign", "code": "FORBIDDEN" }
```

> **Hierarchy guard.** The UDF rejects attempts to grant a permission to a user who outranks the caller in the role hierarchy (role level < caller's level). An admin cannot grant permissions to a super-admin; a student cannot grant anything.

#### 404 NOT_FOUND — referenced user or permission does not exist

```json
{ "success": false, "message": "User 9999 not found", "code": "NOT_FOUND" }
```

#### 409 DUPLICATE_ENTRY — composite uniqueness on (userId, permissionId)

```json
{
  "success": false,
  "message": "User 42 already has an override for permission 28",
  "code": "DUPLICATE_ENTRY"
}
```

---

## 9.4 `POST /api/v1/user-permissions/revoke`

Revoke a user-level override by `(userId, permissionId)` pair instead of junction id. Permission: `permission.assign`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-permissions/revoke` |
| Permission | `permission.assign` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** (`application/json`)

```json
{
  "userId": 42,
  "permissionId": 28
}
```

**Required fields**: `userId`, `permissionId` — both positive integers.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "User-permission override revoked",
  "data": {
    "userId": 42,
    "permissionId": 28,
    "revoked": true
  }
}
```

#### 400 VALIDATION_ERROR

Missing or invalid `userId`/`permissionId` (non-numeric, non-positive).

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "userId", "message": "must be positive", "code": "too_small" }
  ]
}
```

#### 401 UNAUTHORIZED

Same as 9.1.

#### 403 FORBIDDEN — missing permission or hierarchy guard tripped

```json
{ "success": false, "message": "Permission denied: permission.assign", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "User 42 has no override for permission 28", "code": "NOT_FOUND" }
```

---

## 9.5 `DELETE /api/v1/user-permissions/:id`

Soft delete the override by junction id. Sets `is_deleted = TRUE` on the row. Permission: `permission.assign`.

**Postman request**

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/user-permissions/:id` |
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
  "message": "User-permission deleted",
  "data": {
    "id": 91,
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

Same as 9.1.

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: permission.assign", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "User-permission 9999 not found", "code": "NOT_FOUND" }
```

---

## 9.6 `POST /api/v1/user-permissions/:id/restore`

Reverse a soft delete by junction id. Sets `is_deleted = FALSE` and returns the full restored row. Permission: `permission.assign`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-permissions/:id/restore` |
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
  "message": "User-permission restored",
  "data": {
    "id": 91,
    "userId": 42,
    "userName": "Asha Patel",
    "permissionId": 28,
    "permName": "Publish courses",
    "permCode": "course.publish",
    "resource": "course",
    "action": "publish",
    "scope": "global",
    "grantType": "grant",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T16:18:55.412Z",
    "updatedAt": "2026-04-10T16:42:11.005Z",
    "deletedAt": null
  }
}
```

#### 400 BAD_REQUEST — row was never deleted

```json
{
  "success": false,
  "message": "User-permission 91 is not deleted",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED

Same as 9.1.

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: permission.assign", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "User-permission 9999 not found", "code": "NOT_FOUND" }
```

---

## Common errors across all user-permissions routes

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod rejected query, params, or body (invalid grantType, non-numeric id, bad pageSize, etc). |
| 400 | `BAD_REQUEST` | Business-rule violation (row was never deleted, cannot restore). |
| 401 | `UNAUTHORIZED` | Missing or expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission (`permission.read` or `permission.assign`), or hierarchy guard blocked the operation. |
| 404 | `NOT_FOUND` | No user-permission with that id, or a referenced user/permission not found. |
| 409 | `DUPLICATE_ENTRY` | Duplicate override on (userId, permissionId) pair. |
| 429 | `RATE_LIMIT_EXCEEDED` | Global rate-limit tripped (default `100 / 15m`). |
| 500 | `INTERNAL_ERROR` | Unhandled exception; production response omits the stack. |
