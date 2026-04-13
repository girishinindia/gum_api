# Phase 3 — Branch-Departments

The `branch_departments` junction table is the **M:M glue** between a physical branch and a functional department, carrying the per-location metadata that only makes sense at the intersection: which floor/wing the team occupies, how many people it can seat, a local extension to ring, and an optional local head who runs that department *at that branch*. A department can be mapped into many branches; a branch can host many departments; but any given `(branchId, departmentId)` pair can exist at most once as a non-deleted row, guarded by the DB-level unique constraint `uq_branch_department`.

All routes require auth. Permission code is **`branch_department`** (snake_case — `branch_department.read`, `branch_department.create`, …), even though the URL is kebab-case `/branch-departments`. See [§1 in 00-overview](00%20-%20overview.md#1-the-three-resources).

All examples below use `{{baseUrl}}` and `{{accessToken}}` — see [§7 in 00 - overview](00%20-%20overview.md#7-postman-environment).

← [02 departments](02%20-%20departments.md) · **Next →** [04 walkthrough and index](04%20-%20walkthrough%20and%20index.md)

---

## Endpoint summary

Quick reference of every endpoint documented on this page. Section numbers link down to the detailed request/response contracts below.

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§3.1](#31) | `GET` | `{{baseUrl}}/api/v1/branch-departments` | branch_department.read | List branch↔department bindings with multi-layer filters and sort. |
| [§3.2](#32) | `GET` | `{{baseUrl}}/api/v1/branch-departments/:id` | branch_department.read | Get a single binding by id. |
| [§3.3](#33) | `POST` | `{{baseUrl}}/api/v1/branch-departments` | branch_department.create | Create a new binding. |
| [§3.4](#34) | `PATCH` | `{{baseUrl}}/api/v1/branch-departments/:id` | branch_department.update | Partial update of a binding. |
| [§3.5](#35) | `DELETE` | `{{baseUrl}}/api/v1/branch-departments/:id` | branch_department.delete | Soft-delete a binding. |
| [§3.6](#36) | `POST` | `{{baseUrl}}/api/v1/branch-departments/:id/restore` | branch_department.restore | Undo a soft-delete. |

---

## 3.1 `GET /api/v1/branch-departments`

List junction rows. Backed by `udf_get_branch_departments`, which joins `branch_departments` → `branches` → `cities → states → countries` and `branch_departments` → `departments` (LEFT-joined to itself for parent department name) in one shot.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/branch-departments` |
| Permission | `branch_department.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | |
| `pageSize` | int | `20` | Max `200`. |
| `searchTerm` | string | — | `ILIKE` across branch name, branch code, department name, department code, floor/wing. |
| `isActive` | bool | — | Target the junction layer. |
| `isDeleted` | bool | — | Target the junction layer. |
| `branchId` | int | — | Restrict to one branch. |
| `departmentId` | int | — | Restrict to one department. |
| `branchType` | enum | — | `headquarters` / `office` / `campus` / `remote` / `warehouse` / `other`. |
| `branchName` | string | — | Exact-match (case-insensitive, trimmed). |
| `departmentName` | string | — | Exact-match (case-insensitive, trimmed). |
| `sortTable` | enum | `bd` | `bd` / `branch` / `department`. |
| `sortColumn` | enum | `id` | `id`, `branch_id`, `department_id`, `is_active`, `is_deleted`, `created_at`, `updated_at`, `name` (branch/department layer), `code` (branch/department layer). |
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
      "id": 101,
      "branchId": 1,
      "departmentId": 13,
      "localHeadUserId": 42,
      "employeeCapacity": 80,
      "floorOrWing": "Level 9, East Wing",
      "extensionNumber": "1234",
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-11T00:00:00.000Z",
      "updatedAt": "2026-04-11T00:00:00.000Z",
      "deletedAt": null,
      "branch": {
        "id": 1,
        "name": "Mumbai HQ",
        "code": "MUM-HQ",
        "branchType": "headquarters",
        "isActive": true
      },
      "department": {
        "id": 13,
        "name": "Frontend Development",
        "code": "TECH-FE",
        "parentDepartmentId": 1,
        "parentDepartmentName": "Technology",
        "isActive": true
      },
      "location": {
        "cityName": "Mumbai",
        "stateName": "Maharashtra",
        "countryName": "India"
      }
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 1, "totalPages": 1 }
}
```

The `location` block is a flattened convenience — just the three names, no ids or active flags. If you need the full nested geography tree, query `GET /api/v1/branches/:branchId` instead.

#### 400 VALIDATION_ERROR

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "sortTable", "message": "Invalid enum value. Expected 'bd' | 'branch' | 'department', received 'foo'", "code": "invalid_enum_value" }
  ]
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: branch_department.read", "code": "FORBIDDEN" }
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
| Search — `mumbai` | `?searchTerm=mumbai` |
| Search + pagination | `?pageIndex=1&pageSize=50&searchTerm=mumbai` |
| Active bindings only | `?isActive=true` |
| Inactive bindings only | `?isActive=false` |
| Deleted bindings only | `?isDeleted=true` |
| Non-deleted bindings only | `?isDeleted=false` |
| Filter by branch id | `?branchId=1` |
| Filter by department id | `?departmentId=3` |
| Branch type `headquarters` | `?branchType=headquarters` |
| Branch type `campus` | `?branchType=campus` |
| Branch type `remote` | `?branchType=remote` |
| Branch type `office` | `?branchType=office` |
| Branch type `warehouse` | `?branchType=warehouse` |
| Branch type `other` | `?branchType=other` |
| Exact branch name | `?branchName=Mumbai%20HQ` |
| Exact department name | `?departmentName=Engineering` |
| Sort by junction `id` DESC | `?sortTable=bd&sortColumn=id&sortDirection=DESC` |
| Sort by junction `branch_id` ASC | `?sortTable=bd&sortColumn=branch_id&sortDirection=ASC` |
| Sort by junction `department_id` ASC | `?sortTable=bd&sortColumn=department_id&sortDirection=ASC` |
| Sort by junction `is_active` DESC | `?sortTable=bd&sortColumn=is_active&sortDirection=DESC` |
| Sort by junction `is_deleted` DESC | `?sortTable=bd&sortColumn=is_deleted&sortDirection=DESC` |
| Sort by junction `created_at` DESC | `?sortTable=bd&sortColumn=created_at&sortDirection=DESC` |
| Sort by junction `updated_at` DESC | `?sortTable=bd&sortColumn=updated_at&sortDirection=DESC` |
| Sort by branch `name` ASC | `?sortTable=branch&sortColumn=name&sortDirection=ASC` |
| Sort by branch `code` ASC | `?sortTable=branch&sortColumn=code&sortDirection=ASC` |
| Sort by department `name` ASC | `?sortTable=department&sortColumn=name&sortDirection=ASC` |
| Sort by department `code` ASC | `?sortTable=department&sortColumn=code&sortDirection=ASC` |
| Combo — active bindings for branch 1, by dept name | `?pageIndex=1&pageSize=50&branchId=1&isActive=true&sortTable=department&sortColumn=name&sortDirection=ASC` |
| Combo — all HQ↔Engineering bindings | `?pageIndex=1&pageSize=50&branchType=headquarters&departmentName=Engineering&sortTable=branch&sortColumn=name&sortDirection=ASC` |

---

## 3.2 `GET /api/v1/branch-departments/:id`

Read a single junction row by id, with nested `branch`, `department`, and flattened `location` payloads. Soft-deleted rows are still returned by id.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/branch-departments/:id` |
| Permission | `branch_department.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric branch-department id. |

**Request body** — none.

### Responses

#### 200 OK

Same row shape as 3.1, wrapped in `{ "success": true, "message": "OK", "data": { ... } }`.

#### 400 VALIDATION_ERROR — non-numeric id

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [ { "path": "id", "message": "Expected number, received nan", "code": "invalid_type" } ]
}
```

#### 401 / 403 — shape as 3.1.

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Branch-department 9999 not found", "code": "NOT_FOUND" }
```

---

## 3.3 `POST /api/v1/branch-departments`

Create an assignment. Permission: `branch_department.create`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/branch-departments` |
| Permission | `branch_department.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** (`application/json`)

```json
{
  "branchId": 1,
  "departmentId": 13,
  "localHeadUserId": 42,
  "employeeCapacity": 80,
  "floorOrWing": "Level 9, East Wing",
  "extensionNumber": "1234",
  "isActive": true
}
```

**Required fields**: `branchId`, `departmentId`.

**Optional fields**: `localHeadUserId`, `employeeCapacity`, `floorOrWing`, `extensionNumber`, `isActive` (defaults to **`false`** — see [§6 in 00 - overview](00%20-%20overview.md#6-active-flag-defaults)).

> **API does not expose address-override fields.** The old `sp_branch_departments_insert` procedure referenced `address_line_1`, `pincode`, `country_id`, `state_id`, `city_id`, `phone`, `google_maps_url` — **those columns do not exist on `branch_departments`**. The UDF rewrite dropped them, and the API schema intentionally does not accept them. If you need a different address for a department at a specific branch, create a new branch row for that address and assign the department there instead.

**Field hard-limits**

| Field | Min | Max | Extra rule |
|---|---|---|---|
| `floorOrWing` | 1 | 64 | trimmed |
| `extensionNumber` | 1 | 16 | `^[0-9+\-() ]+$` |
| `employeeCapacity` | 0 | 100,000 | integer |

### Responses

#### 201 CREATED — happy path

Same row shape as 3.1, wrapped in `{ "success": true, "message": "Branch-department created", "data": { ... } }`.

#### 400 VALIDATION_ERROR

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "branchId", "message": "Required", "code": "invalid_type" },
    { "path": "extensionNumber", "message": "extension may only contain digits, +, -, parentheses and spaces", "code": "invalid_string" }
  ]
}
```

#### 400 BAD_REQUEST — parent deleted

```json
{ "success": false, "message": "Branch \"Mumbai HQ\" is deleted.", "code": "BAD_REQUEST" }
```

#### 400 BAD_REQUEST — activating under inactive parent

```json
{
  "success": false,
  "message": "Department \"Technology\" must be active to activate this assignment.",
  "code": "BAD_REQUEST"
}
```

Inactive assignments skip this check so you can pre-stage data under inactive parents.

#### 400 BAD_REQUEST — invalid localHeadUserId

```json
{
  "success": false,
  "message": "Local head user 999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED / 403 FORBIDDEN — shape as 3.1.

#### 404 NOT_FOUND — branch or department id unknown

```json
{ "success": false, "message": "Branch 9999 not found.", "code": "NOT_FOUND" }
```

#### 409 DUPLICATE_ENTRY

```json
{
  "success": false,
  "message": "Department \"Technology\" is already assigned to branch \"Mumbai HQ\".",
  "code": "DUPLICATE_ENTRY"
}
```

To "move" an assignment, soft-delete the old one first — see the note in 3.4 below.

---

## 3.4 `PATCH /api/v1/branch-departments/:id`

Partial update. Every field is optional, but the body must contain **at least one** known key.

Patchable fields: `localHeadUserId`, `employeeCapacity`, `floorOrWing`, `extensionNumber`, `isActive`, **`clearLocalHead`**.

**Postman request**

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/branch-departments/:id` |
| Permission | `branch_department.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric branch-department id. |

**Request body** (`application/json`) — sample variants:

*Resize and re-seat*

```json
{ "employeeCapacity": 120, "floorOrWing": "Level 10, West Wing" }
```

*Unassign the local head*

```json
{ "clearLocalHead": true }
```

*Mark a staged row live*

```json
{ "isActive": true }
```

> **`branchId` and `departmentId` are immutable.** The update UDF deliberately does not accept `p_branch_id` or `p_department_id` — changing either side of the junction is semantically equivalent to deleting the old row and inserting a new one. To re-assign a department to a different branch, `DELETE` the existing row and `POST` a fresh one.

### The `clearLocalHead` flag — three distinct states for `localHeadUserId`

| Request body | Meaning |
|---|---|
| `{}` (field omitted) | Leave local head unchanged |
| `{ "localHeadUserId": 88 }` | Re-assign to user 88 |
| `{ "clearLocalHead": true }` | Set `local_head_user_id = NULL` → unassign |

Passing `{ "localHeadUserId": null }` is **not** accepted by the zod schema — use `clearLocalHead` explicitly. Same pattern as `clearParent` on departments.

### Responses

#### 200 OK

Same row shape as 3.1, wrapped in `{ "success": true, "message": "Branch-department updated", "data": { ... } }`.

#### 400 VALIDATION_ERROR — empty body

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [ { "path": "", "message": "Provide at least one field to update", "code": "custom" } ]
}
```

#### 400 BAD_REQUEST — activating under inactive parent

```json
{
  "success": false,
  "message": "Branch \"Mumbai HQ\" must be active to activate this assignment.",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — invalid localHeadUserId

```json
{ "success": false, "message": "Local head user 999 does not exist or is deleted.", "code": "BAD_REQUEST" }
```

#### 401 / 403 — shape as 3.1.

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Branch-department 9999 not found", "code": "NOT_FOUND" }
```

---

## 3.5 `DELETE /api/v1/branch-departments/:id`

Soft delete — sets `is_deleted = TRUE`, `is_active = FALSE`, `deleted_at = NOW()`. Permission: `branch_department.delete`.

**Leaf resource — nothing blocks the delete.** Unlike branches and departments (which have to guard against orphaning active junction rows), the junction itself has no downstream children, so soft-deleting a row is always allowed as long as the id exists and isn't already deleted. This is what makes the "delete the old mapping first" workflow safe whenever you need to re-assign a department to a different branch.

**Postman request**

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/branch-departments/:id` |
| Permission | `branch_department.delete` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric branch-department id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Branch-department deleted",
  "data": { "id": 101, "deleted": true }
}
```

#### 400 BAD_REQUEST — already deleted

```json
{
  "success": false,
  "message": "Branch-department with ID 101 does not exist or is already deleted.",
  "code": "BAD_REQUEST"
}
```

#### 401 / 403 — shape as 3.1.

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Branch-department 9999 not found", "code": "NOT_FOUND" }
```

---

## 3.6 `POST /api/v1/branch-departments/:id/restore`

Reverse a soft delete. Permission: `branch_department.restore`. Returns the full restored row.

Restore semantics here are **nuanced** — different from branches and departments, which always set `is_active = TRUE` on restore.

1. **Uniqueness guard.** If a *different* non-deleted row already exists for the same `(branchId, departmentId)` pair, restore is rejected. The fix is to soft-delete the newer row first.
2. **Conditional `is_active` on restore.** The UDF checks both parents at restore time. If **both** parents are alive and active, the row comes back with `is_active = TRUE`. If **either** is inactive or deleted, the row still comes back with `is_deleted = FALSE` but `is_active = FALSE`, and you get a different success message. Re-activate later with `PATCH { "isActive": true }` once both parents are back online.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/branch-departments/:id/restore` |
| Permission | `branch_department.restore` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric branch-department id. |

**Request body** — none.

### Responses

#### 200 OK — restored and reactivated

```json
{
  "success": true,
  "message": "Branch-department restored",
  "data": {
    "id": 101,
    "isActive": true,
    "isDeleted": false,
    "...": "full row as in 3.1"
  }
}
```

#### 200 OK — restored but left inactive

UDF message embedded in the envelope: *"Branch-department assignment 101 restored but left inactive (parent branch or department is inactive/deleted)."* The `data.isActive` field is `false`.

```json
{
  "success": true,
  "message": "Branch-department restored",
  "data": {
    "id": 101,
    "isActive": false,
    "isDeleted": false,
    "...": "full row"
  }
}
```

#### 400 BAD_REQUEST — not deleted

```json
{
  "success": false,
  "message": "Branch-department assignment 101 is not deleted or does not exist.",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — live duplicate pair blocks restore

```json
{
  "success": false,
  "message": "Cannot restore: a live assignment already exists for this (branch, department) pair.",
  "code": "BAD_REQUEST"
}
```

Fix: soft-delete the newer row first, then retry.

#### 401 / 403 — shape as 3.1.

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Branch-department 9999 not found", "code": "NOT_FOUND" }
```

---

## Common errors across all branch-department routes

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | zod rejected query, params, or body. |
| 400 | `BAD_REQUEST` | Business-rule violation raised by the UDF (parent deleted, activating under inactive parent, live duplicate on restore, etc). |
| 401 | `UNAUTHORIZED` | Missing / expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required `branch_department.<action>` permission. |
| 404 | `NOT_FOUND` | No junction row with that id, or `branchId` / `departmentId` unknown. |
| 409 | `DUPLICATE_ENTRY` | A non-deleted row already exists for the `(branchId, departmentId)` pair. |
| 429 | `RATE_LIMIT_EXCEEDED` | Global rate-limit tripped (default `100 / 15m`). |
| 500 | `INTERNAL_ERROR` | Unhandled exception. |
