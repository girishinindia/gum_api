# Phase 3 — Departments

A department is a **functional unit** of the organization (Technology, HR, Finance, Content, Marketing …). Departments form an optional self-referential tree: a top-level department has `parentDepartmentId = null`, and children nest under it (e.g. "Frontend Dev" under "Technology"). Every read endpoint returns the department plus a nested `parent` payload (or `null` for top-level rows).

All routes require auth. Permission codes: `department.read`, `department.create`, `department.update`, `department.delete`, `department.restore`.

All examples below use `{{baseUrl}}` and `{{accessToken}}` — see [§7 in 00 - overview](00%20-%20overview.md#7-postman-environment).

← [01 branches](01%20-%20branches.md) · **Next →** [03 branch-departments](03%20-%20branch-departments.md)

---

## Endpoint summary

Quick reference of every endpoint documented on this page. Section numbers link down to the detailed request/response contracts below.

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§2.1](#21) | `GET` | `{{baseUrl}}/api/v1/departments` | department.read | List departments with parent filter and sort. |
| [§2.2](#22) | `GET` | `{{baseUrl}}/api/v1/departments/:id` | department.read | Get a single department by id. |
| [§2.3](#23) | `POST` | `{{baseUrl}}/api/v1/departments` | department.create | Create a new department. |
| [§2.4](#24) | `PATCH` | `{{baseUrl}}/api/v1/departments/:id` | department.update | Partial update. |
| [§2.5](#25) | `DELETE` | `{{baseUrl}}/api/v1/departments/:id` | department.delete | Soft-delete. |
| [§2.6](#26) | `POST` | `{{baseUrl}}/api/v1/departments/:id/restore` | department.restore | Undo a soft-delete. |

---

## 2.1 `GET /api/v1/departments`

List departments. Backed by `udf_get_departments`, which `LEFT JOIN`s the table against itself so every row carries its (optional) parent.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/departments` |
| Permission | `department.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | Page number (1-based). |
| `pageSize` | int | `20` | Max `200`. |
| `searchTerm` | string | — | `ILIKE` across department name, code, description, and parent department name. |
| `isActive` | bool | — | Target the department layer. |
| `isDeleted` | bool | — | Target the department layer. |
| `parentDepartmentId` | int | — | Return only children of a specific department. |
| `topLevelOnly` | bool | — | Shortcut for "only rows where `parent_department_id IS NULL`". |
| `code` | string | — | Exact-match filter on department code (case-insensitive, `CITEXT`). |
| `sortColumn` | enum | `id` | Whitelisted: `id`, `name`, `code`, `parent_department_id`, `is_active`, `is_deleted`, `created_at`, `updated_at`. |
| `sortDirection` | enum | `ASC` | `ASC` / `DESC`. |

Unlike `branches` and `branch-departments`, departments have no `sortTable` param — everything sorts on the department row itself.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 13,
      "name": "Frontend Development",
      "code": "TECH-FE",
      "description": "Web and mobile UI engineering.",
      "parentDepartmentId": 1,
      "headUserId": 42,
      "createdBy": 1,
      "updatedBy": 1,
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-11T00:00:00.000Z",
      "updatedAt": "2026-04-11T00:00:00.000Z",
      "deletedAt": null,
      "parent": {
        "id": 1,
        "name": "Technology",
        "code": "TECH",
        "description": "Engineering organization.",
        "isActive": true,
        "isDeleted": false
      }
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

Top-level departments return `"parent": null`.

#### 400 VALIDATION_ERROR

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "path": "sortColumn",
      "message": "Invalid enum value. Expected 'id' | 'name' | 'code' | 'parent_department_id' | 'is_active' | 'is_deleted' | 'created_at' | 'updated_at', received 'foo'",
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
{ "success": false, "message": "Permission denied: department.read", "code": "FORBIDDEN" }
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
| Search name/code/description/parent — `engineering` | `?searchTerm=engineering` |
| Search + pagination | `?pageIndex=1&pageSize=50&searchTerm=engineering` |
| Active only | `?isActive=true` |
| Inactive only | `?isActive=false` |
| Deleted only | `?isDeleted=true` |
| Non-deleted only | `?isDeleted=false` |
| Children of department id 1 | `?parentDepartmentId=1` |
| Top-level only | `?topLevelOnly=true` |
| Filter by exact code | `?code=ENG` |
| Sort by `id` DESC | `?sortColumn=id&sortDirection=DESC` |
| Sort by `name` ASC | `?sortColumn=name&sortDirection=ASC` |
| Sort by `code` ASC | `?sortColumn=code&sortDirection=ASC` |
| Sort by `parent_department_id` ASC | `?sortColumn=parent_department_id&sortDirection=ASC` |
| Sort by `is_active` DESC | `?sortColumn=is_active&sortDirection=DESC` |
| Sort by `is_deleted` DESC | `?sortColumn=is_deleted&sortDirection=DESC` |
| Sort by `created_at` DESC | `?sortColumn=created_at&sortDirection=DESC` |
| Sort by `updated_at` DESC | `?sortColumn=updated_at&sortDirection=DESC` |
| Combo — active top-level departments, sort by name | `?pageIndex=1&pageSize=50&isActive=true&topLevelOnly=true&sortColumn=name&sortDirection=ASC` |
| Combo — children of dep 1, active, by code | `?pageIndex=1&pageSize=50&parentDepartmentId=1&isActive=true&sortColumn=code&sortDirection=ASC` |

---

## 2.2 `GET /api/v1/departments/:id`

Read a single department by id, including nested `parent`. Soft-deleted departments are still returned by id (phase-2 soft-delete-GET convention).

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/departments/:id` |
| Permission | `department.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric department id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 13,
    "name": "Frontend Development",
    "code": "TECH-FE",
    "description": "Web and mobile UI engineering.",
    "parentDepartmentId": 1,
    "headUserId": 42,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-11T00:00:00.000Z",
    "updatedAt": "2026-04-11T00:00:00.000Z",
    "deletedAt": null,
    "parent": {
      "id": 1,
      "name": "Technology",
      "code": "TECH",
      "description": "Engineering organization.",
      "isActive": true,
      "isDeleted": false
    }
  }
}
```

#### 400 VALIDATION_ERROR — non-numeric id

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [ { "path": "id", "message": "Expected number, received nan", "code": "invalid_type" } ]
}
```

#### 401 / 403 — shape as 2.1.

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Department 9999 not found", "code": "NOT_FOUND" }
```

---

## 2.3 `POST /api/v1/departments`

Create a department. Permission: `department.create`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/departments` |
| Permission | `department.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** (`application/json`)

*Top-level department*

```json
{
  "name": "Technology",
  "code": "TECH",
  "description": "Engineering organization.",
  "isActive": true
}
```

*Child department*

```json
{
  "name": "Frontend Development",
  "code": "TECH-FE",
  "description": "Web and mobile UI engineering.",
  "parentDepartmentId": 1,
  "headUserId": 42,
  "isActive": true
}
```

**Required fields**: `name`.

**Optional fields**: `code`, `description`, `parentDepartmentId`, `headUserId`, `isActive` (defaults to **`false`** — see [§6 in 00 - overview](00%20-%20overview.md#6-active-flag-defaults)).

`code` is normalised to upper-case server-side. `name` is `CITEXT` so "Technology" and "technology" are considered duplicates.

**Field hard-limits**

| Field | Min | Max | Extra rule |
|---|---|---|---|
| `name` | 2 | 128 | shared `nameSchema`, DB-wide `CITEXT` uniqueness |
| `code` | 2 | 32 | `^[A-Za-z0-9_.-]+$`, upper-cased, DB-wide unique |
| `description` | 2 | 1000 | |

### Responses

#### 201 CREATED — happy path

```json
{
  "success": true,
  "message": "Department created",
  "data": {
    "id": 13,
    "name": "Frontend Development",
    "code": "TECH-FE",
    "description": "Web and mobile UI engineering.",
    "parentDepartmentId": 1,
    "headUserId": 42,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-11T00:00:00.000Z",
    "updatedAt": "2026-04-11T00:00:00.000Z",
    "deletedAt": null,
    "parent": {
      "id": 1,
      "name": "Technology",
      "code": "TECH",
      "description": "Engineering organization.",
      "isActive": true,
      "isDeleted": false
    }
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

#### 400 BAD_REQUEST — active child under inactive/deleted parent

```json
{
  "success": false,
  "message": "Parent department \"Technology\" must be active to activate this department.",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — invalid headUserId

```json
{
  "success": false,
  "message": "Head user 999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: department.create", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND — parentDepartmentId unknown

```json
{ "success": false, "message": "Parent department 9999 not found", "code": "NOT_FOUND" }
```

#### 409 DUPLICATE_ENTRY — name or code collision

```json
{
  "success": false,
  "message": "Department name \"Technology\" is already taken.",
  "code": "DUPLICATE_ENTRY"
}
```

---

## 2.4 `PATCH /api/v1/departments/:id`

Partial update. Every field is optional, but the body must contain **at least one** known key.

Patchable fields: `name`, `code`, `description`, `parentDepartmentId`, `headUserId`, `isActive`, **`clearParent`**.

**Postman request**

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/departments/:id` |
| Permission | `department.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric department id. |

**Request body** (`application/json`) — sample variants:

*Rename + re-code*

```json
{ "name": "Frontend Engineering", "code": "TECH-FE-ENG" }
```

*Re-parent under a different top-level*

```json
{ "parentDepartmentId": 7 }
```

*Promote to top-level (the `clearParent` flag)*

```json
{ "clearParent": true }
```

### The `clearParent` flag — three distinct states for `parentDepartmentId`

| Request body | Meaning |
|---|---|
| `{}` (field omitted) | Leave parent unchanged |
| `{ "parentDepartmentId": 7 }` | Re-parent this department under department 7 |
| `{ "clearParent": true }` | Set `parent_department_id = NULL` → department becomes top-level |

Passing `{ "parentDepartmentId": null }` is **not** accepted by the zod schema — use `clearParent` explicitly. This mirrors the phase-2 `categoryId` re-parent on sub-categories.

**Self-parent rejection.** The UDF refuses a PATCH where `parentDepartmentId == :id`. It does **not** currently walk the chain to detect larger cycles — keep your tree shallow and sane.

### Responses

#### 200 OK — happy path

Same row shape as `2.2 GET /:id`, wrapped in:

```json
{ "success": true, "message": "Department updated", "data": { "id": 13, "...": "..." } }
```

#### 400 VALIDATION_ERROR — empty body

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [ { "path": "", "message": "Provide at least one field to update", "code": "custom" } ]
}
```

#### 400 BAD_REQUEST — self-parent

```json
{ "success": false, "message": "Department cannot be its own parent.", "code": "BAD_REQUEST" }
```

#### 400 BAD_REQUEST — activating child under inactive parent

```json
{
  "success": false,
  "message": "Parent department \"Technology\" must be active to activate this department.",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED / 403 FORBIDDEN — shape as 2.3.

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Department 9999 not found", "code": "NOT_FOUND" }
```

#### 409 DUPLICATE_ENTRY

```json
{
  "success": false,
  "message": "Department code \"TECH-FE-ENG\" is already taken.",
  "code": "DUPLICATE_ENTRY"
}
```

---

## 2.5 `DELETE /api/v1/departments/:id`

Soft delete — sets `is_deleted = TRUE`, `is_active = FALSE`, `deleted_at = NOW()`. Permission: `department.delete`.

**Postman request**

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/departments/:id` |
| Permission | `department.delete` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric department id. |

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Department deleted",
  "data": { "id": 13, "deleted": true }
}
```

#### 400 BAD_REQUEST — already deleted / not found

```json
{
  "success": false,
  "message": "Department with ID 13 does not exist or is already deleted.",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN — missing permission

```json
{ "success": false, "message": "Permission denied: department.delete", "code": "FORBIDDEN" }
```

#### 403 FORBIDDEN — active sub-departments

```json
{
  "success": false,
  "message": "Cannot delete department: it still has active sub-departments.",
  "code": "FORBIDDEN"
}
```

Soft-delete the subtree bottom-up (or re-parent the children via `PATCH` with `clearParent: true`) before the parent will go. The rationale: a soft-deleted parent with live children leaves the org tree in a "points at a tombstone" state.

#### 403 FORBIDDEN — active branch assignments

```json
{
  "success": false,
  "message": "Cannot delete department: it is still assigned to one or more active branches.",
  "code": "FORBIDDEN"
}
```

Mirrors the symmetric check on branches — both sides of the junction protect against orphaning active mappings.

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Department 9999 not found", "code": "NOT_FOUND" }
```

---

## 2.6 `POST /api/v1/departments/:id/restore`

Reverse a soft delete. Restore sets `is_deleted = FALSE` **and** `is_active = TRUE` in one shot — matching phase-02 `udf_states_restore` semantics. No follow-up PATCH is needed to bring the department back online.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/departments/:id/restore` |
| Permission | `department.restore` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric department id. |

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Department restored",
  "data": { "id": 13, "isActive": true, "isDeleted": false, "...": "full row" }
}
```

#### 400 BAD_REQUEST — not deleted

```json
{
  "success": false,
  "message": "Department with ID 13 is not deleted or does not exist.",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — parent deleted (clear parent first)

```json
{
  "success": false,
  "message": "Cannot restore department: parent department \"Technology\" is deleted. Clear the parent first.",
  "code": "BAD_REQUEST"
}
```

Fix: `PATCH { "clearParent": true }` to promote this row to top-level, then retry restore.

#### 400 BAD_REQUEST — parent inactive

```json
{
  "success": false,
  "message": "Cannot restore department: parent department \"Technology\" is inactive.",
  "code": "BAD_REQUEST"
}
```

Fix: reactivate the parent (or clear it) before retrying.

Top-level departments (parent NULL) skip the parent-alive gate entirely.

#### 401 / 403 — shape as 2.5.

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Department 9999 not found", "code": "NOT_FOUND" }
```

---

## Common errors across all department routes

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | zod rejected query, params, or body. |
| 400 | `BAD_REQUEST` | Business-rule violation (self-parent, parent inactive, already deleted on restore, etc). |
| 401 | `UNAUTHORIZED` | Missing / expired bearer token. |
| 403 | `FORBIDDEN` | Missing required permission, or delete blocked by active sub-departments / branch assignments. |
| 404 | `NOT_FOUND` | No department with that id, or `parentDepartmentId` unknown. |
| 409 | `DUPLICATE_ENTRY` | `name` or `code` already in use by another non-deleted department. |
| 429 | `RATE_LIMIT_EXCEEDED` | Global rate-limit tripped (default `100 / 15m`). |
| 500 | `INTERNAL_ERROR` | Unhandled exception. |
