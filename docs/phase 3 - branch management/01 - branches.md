# Phase 3 — Branches

A branch is a **physical location** in the organization — a head office, a regional office, a campus, a warehouse, a remote hub. Every branch anchors to exactly one `(country, state, city)` triple, optionally assigns a `branch_manager_id` from the users table, and is returned from every list/get endpoint together with its fully nested `city`, `state`, and `country` payloads (the same join tree that powers phase-2 `/cities`).

All routes require auth. Permission codes: `branch.read`, `branch.create`, `branch.update`, `branch.delete`, `branch.restore`.

All examples below use the Postman environment variables **`{{baseUrl}}`** (e.g. `http://localhost:3000`) and **`{{accessToken}}`** (a Super Admin JWT minted via `POST {{baseUrl}}/api/v1/auth/login`). Set these once on your Postman environment — see [§7 in 00 - overview](00%20-%20overview.md#7-postman-environment).

← [00 overview](00%20-%20overview.md) · **Next →** [02 departments](02%20-%20departments.md)

---

## Endpoint summary

Quick reference of every endpoint documented on this page. Section numbers link down to the detailed request/response contracts below.

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11) | `GET` | `{{baseUrl}}/api/v1/branches` | branch.read | List branches joined to city/state/country with multi-layer filters and sort. |
| [§1.2](#12) | `GET` | `{{baseUrl}}/api/v1/branches/:id` | branch.read | Get a single branch by id. |
| [§1.3](#13) | `POST` | `{{baseUrl}}/api/v1/branches` | branch.create | Create a new branch. |
| [§1.4](#14) | `PATCH` | `{{baseUrl}}/api/v1/branches/:id` | branch.update | Partial update of a branch. |
| [§1.5](#15) | `DELETE` | `{{baseUrl}}/api/v1/branches/:id` | branch.delete | Soft-delete a branch. |
| [§1.6](#16) | `POST` | `{{baseUrl}}/api/v1/branches/:id/restore` | branch.restore | Undo a soft-delete. |

---

## 1.1 `GET /api/v1/branches`

List branches. Backed by `udf_get_branches`, which joins `branches` → `cities` → `states` → `countries` via `uv_branches` and exposes filters and sort keys at all four layers.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/branches` |
| Permission | `branch.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | Page number (1-based). |
| `pageSize` | int | `20` | Max `200`. |
| `searchTerm` | string | — | `ILIKE` across branch name, code, address line 1, email, city name, state name, country name. |
| `isActive` | bool | — | Shortcut for the branch layer (equivalent to `branchIsActive`). |
| `isDeleted` | bool | — | Shortcut for the branch layer (equivalent to `branchIsDeleted`). |
| `branchIsActive` | bool | — | Target the branch layer explicitly. |
| `branchIsDeleted` | bool | — | Target the branch layer explicitly. |
| `cityIsActive` | bool | — | Target the city join layer. |
| `stateIsActive` | bool | — | Target the state join layer. |
| `countryIsActive` | bool | — | Target the country join layer. |
| `countryId` | int | — | Only branches under this country. |
| `stateId` | int | — | Only branches under this state. |
| `cityId` | int | — | Only branches under this city. |
| `branchType` | enum | — | One of `headquarters`, `office`, `campus`, `remote`, `warehouse`, `other`. |
| `sortTable` | enum | `branch` | One of `branch`, `city`, `state`, `country`. |
| `sortColumn` | enum | `id` | Whitelisted: `id`, `name`, `code`, `type`, `iso3` (country-layer only), `is_active`, `is_deleted`. |
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
      "countryId": 1,
      "stateId": 27,
      "cityId": 1421,
      "branchManagerId": null,
      "name": "Mumbai HQ",
      "code": "MUM-HQ",
      "branchType": "headquarters",
      "addressLine1": "Level 10, One BKC",
      "addressLine2": "Bandra Kurla Complex",
      "pincode": "400051",
      "phone": "+91-22-4000-0000",
      "email": "mumbai@growupmore.com",
      "website": "https://growupmore.com",
      "googleMapsUrl": "https://maps.google.com/...",
      "timezone": "Asia/Kolkata",
      "createdBy": 1,
      "updatedBy": 1,
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-11T00:00:00.000Z",
      "updatedAt": "2026-04-11T00:00:00.000Z",
      "deletedAt": null,
      "city": {
        "id": 1421,
        "stateId": 27,
        "name": "Mumbai",
        "phoneCode": "022",
        "timezone": "Asia/Kolkata",
        "website": null,
        "isActive": true,
        "isDeleted": false
      },
      "state": {
        "id": 27,
        "countryId": 1,
        "name": "Maharashtra",
        "languages": ["Marathi", "Hindi", "English"],
        "website": null,
        "isActive": true,
        "isDeleted": false
      },
      "country": {
        "id": 1,
        "name": "India",
        "iso2": "IN",
        "iso3": "IND",
        "phoneCode": "+91",
        "currency": "INR",
        "currencyName": "Indian Rupee",
        "currencySymbol": "₹",
        "nationalLanguage": "Hindi",
        "nationality": "Indian",
        "languages": ["Hindi", "English"],
        "tld": ".in",
        "flagImage": "https://cdn.growupmore.com/countries/flags/IND.webp",
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

#### 400 BAD_REQUEST — validation error

Triggered by unknown `sortColumn`, unknown `branchType`, `pageSize` > 200, or any query coercion failure.

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "path": "sortColumn",
      "message": "Invalid enum value. Expected 'id' | 'name' | 'code' | 'type' | 'iso3' | 'is_active' | 'is_deleted', received 'foo'",
      "code": "invalid_enum_value"
    }
  ]
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
  "message": "Permission denied: branch.read",
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
| Search — `mumbai` | `?searchTerm=mumbai` |
| Search + pagination | `?pageIndex=2&pageSize=50&searchTerm=mumbai` |
| Active (branch layer) only | `?isActive=true` |
| Inactive (branch layer) only | `?isActive=false` |
| Deleted (branch layer) only | `?isDeleted=true` |
| Non-deleted (branch layer) only | `?isDeleted=false` |
| Branch layer explicit — active | `?branchIsActive=true` |
| Branch layer explicit — not deleted | `?branchIsDeleted=false` |
| City layer — active | `?cityIsActive=true` |
| State layer — active | `?stateIsActive=true` |
| Country layer — active | `?countryIsActive=true` |
| Branches in country 1 | `?countryId=1` |
| Branches in state 27 | `?stateId=27` |
| Branches in city 1421 | `?cityId=1421` |
| Branches in country 1 + city 1421 | `?countryId=1&cityId=1421` |
| Branch type `headquarters` | `?branchType=headquarters` |
| Branch type `office` | `?branchType=office` |
| Branch type `campus` | `?branchType=campus` |
| Branch type `remote` | `?branchType=remote` |
| Branch type `warehouse` | `?branchType=warehouse` |
| Branch type `other` | `?branchType=other` |
| Sort by branch `id` DESC | `?sortTable=branch&sortColumn=id&sortDirection=DESC` |
| Sort by branch `name` ASC | `?sortTable=branch&sortColumn=name&sortDirection=ASC` |
| Sort by branch `code` ASC | `?sortTable=branch&sortColumn=code&sortDirection=ASC` |
| Sort by branch `type` ASC | `?sortTable=branch&sortColumn=type&sortDirection=ASC` |
| Sort by branch `is_active` DESC | `?sortTable=branch&sortColumn=is_active&sortDirection=DESC` |
| Sort by branch `is_deleted` DESC | `?sortTable=branch&sortColumn=is_deleted&sortDirection=DESC` |
| Sort by city `name` ASC | `?sortTable=city&sortColumn=name&sortDirection=ASC` |
| Sort by state `name` ASC | `?sortTable=state&sortColumn=name&sortDirection=ASC` |
| Sort by country `name` ASC | `?sortTable=country&sortColumn=name&sortDirection=ASC` |
| Sort by country `iso3` ASC | `?sortTable=country&sortColumn=iso3&sortDirection=ASC` |
| Combo — active HQs in India sorted by city | `?pageIndex=1&pageSize=50&countryId=1&branchType=headquarters&isActive=true&sortTable=city&sortColumn=name&sortDirection=ASC` |
| Combo — remote branches, newest first | `?pageIndex=1&pageSize=50&branchType=remote&isActive=true&sortTable=branch&sortColumn=id&sortDirection=DESC` |

---

## 1.2 `GET /api/v1/branches/:id`

Read a single branch by id, with nested `city`, `state`, `country` payloads — same row shape as the list endpoint. Soft-deleted branches are returned by id (the UDF does not apply the `is_deleted` filter for `p_id` lookups), matching the convention established by phase-2 `/cities/:id`.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/branches/:id` |
| Permission | `branch.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric branch id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 1,
    "countryId": 1,
    "stateId": 27,
    "cityId": 1421,
    "branchManagerId": null,
    "name": "Mumbai HQ",
    "code": "MUM-HQ",
    "branchType": "headquarters",
    "addressLine1": "Level 10, One BKC",
    "addressLine2": "Bandra Kurla Complex",
    "pincode": "400051",
    "phone": "+91-22-4000-0000",
    "email": "mumbai@growupmore.com",
    "website": "https://growupmore.com",
    "googleMapsUrl": null,
    "timezone": "Asia/Kolkata",
    "createdBy": 1,
    "updatedBy": 1,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-11T00:00:00.000Z",
    "updatedAt": "2026-04-11T00:00:00.000Z",
    "deletedAt": null,
    "city":    { "id": 1421, "name": "Mumbai",       "...": "..." },
    "state":   { "id":   27, "name": "Maharashtra",  "...": "..." },
    "country": { "id":    1, "name": "India",        "...": "..." }
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
    { "path": "id", "message": "Expected number, received nan", "code": "invalid_type" }
  ]
}
```

#### 401 UNAUTHORIZED

Same shape as 1.1.

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: branch.read", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Branch 9999 not found", "code": "NOT_FOUND" }
```

---

## 1.3 `POST /api/v1/branches`

Create a branch. Permission: `branch.create`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/branches` |
| Permission | `branch.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** (`application/json`)

```json
{
  "countryId": 1,
  "stateId": 27,
  "cityId": 1421,
  "name": "Mumbai HQ",
  "code": "MUM-HQ",
  "branchType": "headquarters",
  "addressLine1": "Level 10, One BKC",
  "addressLine2": "Bandra Kurla Complex",
  "pincode": "400051",
  "phone": "+91-22-4000-0000",
  "email": "mumbai@growupmore.com",
  "website": "https://growupmore.com",
  "googleMapsUrl": "https://maps.google.com/?cid=...",
  "timezone": "Asia/Kolkata",
  "branchManagerId": 42,
  "isActive": true
}
```

**Required fields**: `countryId`, `stateId`, `cityId`, `name`.

**Optional fields**: `code`, `branchType` (DB default `office`), `addressLine1`, `addressLine2`, `pincode`, `phone`, `email`, `website`, `googleMapsUrl`, `timezone`, `branchManagerId`, `isActive` (defaults to **`false`** at the API layer — see [§6 in 00 - overview](00%20-%20overview.md#6-active-flag-defaults)).

`code` is normalised to upper-case server-side by the zod transform, so `mum-hq` and `MUM-HQ` are equivalent on the wire. `email` is lower-cased.

**Field hard-limits** (zod-rejected before reaching the DB)

| Field | Min | Max | Extra rule |
|---|---|---|---|
| `name` | 2 | 128 | shared `nameSchema` |
| `code` | 2 | 32 | `^[A-Za-z0-9_.-]+$`, upper-cased |
| `addressLine1`, `addressLine2` | 2 | 255 | |
| `pincode` | 3 | 16 | |
| `phone` | 6 | 32 | digits, `+`, `-`, parens, spaces |
| `email` | — | 255 | RFC email |
| `website`, `googleMapsUrl` | — | 512 | must parse as URL |
| `timezone` | 3 | 64 | |

### Responses

#### 201 CREATED — happy path

```json
{
  "success": true,
  "message": "Branch created",
  "data": {
    "id": 1,
    "countryId": 1,
    "stateId": 27,
    "cityId": 1421,
    "name": "Mumbai HQ",
    "code": "MUM-HQ",
    "branchType": "headquarters",
    "addressLine1": "Level 10, One BKC",
    "addressLine2": "Bandra Kurla Complex",
    "pincode": "400051",
    "phone": "+91-22-4000-0000",
    "email": "mumbai@growupmore.com",
    "website": "https://growupmore.com",
    "googleMapsUrl": "https://maps.google.com/?cid=...",
    "timezone": "Asia/Kolkata",
    "branchManagerId": 42,
    "createdBy": 1,
    "updatedBy": 1,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-11T00:00:00.000Z",
    "updatedAt": "2026-04-11T00:00:00.000Z",
    "deletedAt": null,
    "city":    { "id": 1421, "name": "Mumbai",      "...": "..." },
    "state":   { "id":   27, "name": "Maharashtra", "...": "..." },
    "country": { "id":    1, "name": "India",       "...": "..." }
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
    { "path": "countryId", "message": "Required", "code": "invalid_type" },
    { "path": "name",      "message": "Required", "code": "invalid_type" }
  ]
}
```

#### 400 VALIDATION_ERROR — bad enum / length / regex

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "path": "branchType",
      "message": "Invalid enum value. Expected 'headquarters' | 'office' | 'campus' | 'remote' | 'warehouse' | 'other', received 'hq'",
      "code": "invalid_enum_value"
    },
    {
      "path": "code",
      "message": "code may only contain letters, digits, '_', '.', '-'",
      "code": "invalid_string"
    }
  ]
}
```

#### 400 BAD_REQUEST — parent chain inactive/deleted

```json
{
  "success": false,
  "message": "Country \"India\" must be active to activate this branch.",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — branch manager invalid

```json
{
  "success": false,
  "message": "Branch manager user 999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: branch.create", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND — geography id does not exist

```json
{ "success": false, "message": "City 9999 not found", "code": "NOT_FOUND" }
```

#### 409 DUPLICATE_ENTRY — code collision

`code` is unique over `is_deleted = FALSE`, so soft-deleted branches free up their code.

```json
{
  "success": false,
  "message": "Branch code \"MUM-HQ\" is already taken.",
  "code": "DUPLICATE_ENTRY"
}
```

---

## 1.4 `PATCH /api/v1/branches/:id`

Partial update. Every field is optional, but the body must contain **at least one** known key — an empty body returns `400 VALIDATION_ERROR` with `"Provide at least one field to update"`.

Patchable fields: `countryId`, `stateId`, `cityId`, `name`, `code`, `branchType`, `addressLine1`, `addressLine2`, `pincode`, `phone`, `email`, `website`, `googleMapsUrl`, `timezone`, `branchManagerId`, `isActive`.

**Postman request**

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/branches/:id` |
| Permission | `branch.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric branch id. |

**Request body** (`application/json`) — some sample variants:

*Rename + deactivate*

```json
{ "name": "Mumbai Head Office", "isActive": false }
```

*Re-locate to a different city (UDF validates internal consistency: state belongs to country, city belongs to state)*

```json
{ "countryId": 1, "stateId": 27, "cityId": 1789 }
```

*Assign a branch manager*

```json
{ "branchManagerId": 42 }
```

### Responses

#### 200 OK — happy path

Same row shape as `1.2 GET /:id`, wrapped in:

```json
{ "success": true, "message": "Branch updated", "data": { "id": 1, "...": "..." } }
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

#### 400 BAD_REQUEST — activation under inactive parent

```json
{
  "success": false,
  "message": "State \"Maharashtra\" is inactive; cannot activate this branch.",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — geography inconsistency

```json
{
  "success": false,
  "message": "City 1789 does not belong to state 27.",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED / 403 FORBIDDEN — shape as 1.3.

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Branch 9999 not found", "code": "NOT_FOUND" }
```

#### 409 DUPLICATE_ENTRY — code collision

```json
{ "success": false, "message": "Branch code \"MUM-HQ\" is already taken.", "code": "DUPLICATE_ENTRY" }
```

---

## 1.5 `DELETE /api/v1/branches/:id`

Soft delete — sets `is_deleted = TRUE`, `is_active = FALSE`, `deleted_at = NOW()`. Permission: `branch.delete`.

**Postman request**

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/branches/:id` |
| Permission | `branch.delete` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric branch id. |

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Branch deleted",
  "data": { "id": 1, "deleted": true }
}
```

#### 400 BAD_REQUEST — already deleted

```json
{
  "success": false,
  "message": "Branch with ID 1 does not exist or is already deleted.",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN — missing permission

```json
{ "success": false, "message": "Permission denied: branch.delete", "code": "FORBIDDEN" }
```

#### 403 FORBIDDEN — active child mappings block the delete

If the branch still has at least one **active, non-deleted** `branch_departments` row, the UDF refuses the delete. The rationale: soft-deleting a branch while it still "owns" live department mappings leaves the junction in a broken state where the `branch` side points to a deleted row but `branch_departments.is_deleted` is still `FALSE`. Soft-delete the junction rows first, then the branch.

```json
{
  "success": false,
  "message": "Cannot delete branch: it still has active department assignments. Remove or soft-delete those first.",
  "code": "FORBIDDEN"
}
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Branch 9999 not found", "code": "NOT_FOUND" }
```

---

## 1.6 `POST /api/v1/branches/:id/restore`

Reverse a soft delete. Permission: `branch.restore`. Restore sets `is_deleted = FALSE` **and** `is_active = TRUE` in one shot and returns the full refreshed row. Restoring a branch **does not** auto-restore its previously-soft-deleted `branch_departments` rows — those must be restored separately (by design: the admin should re-approve each mapping consciously).

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/branches/:id/restore` |
| Permission | `branch.restore` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric branch id. |

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Branch restored",
  "data": { "id": 1, "isActive": true, "isDeleted": false, "...": "full row" }
}
```

#### 400 BAD_REQUEST — not deleted

```json
{
  "success": false,
  "message": "Branch with ID 1 is not deleted or does not exist.",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — parent country dead

```json
{
  "success": false,
  "message": "Cannot restore branch: parent country is inactive or deleted.",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — parent state dead / unlinked

```json
{
  "success": false,
  "message": "Cannot restore branch: parent state is inactive, deleted, or no longer linked to its country.",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — parent city dead / unlinked

```json
{
  "success": false,
  "message": "Cannot restore branch: parent city is inactive, deleted, or no longer linked to its state.",
  "code": "BAD_REQUEST"
}
```

If any parent has drifted, you must first revive it (or `PATCH` the branch onto a different, live geography chain) before retrying the restore.

#### 401 UNAUTHORIZED / 403 FORBIDDEN — shape as 1.3.

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Branch 9999 not found", "code": "NOT_FOUND" }
```

---

## Common errors across all branch routes

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | zod rejected query, params, or body. |
| 400 | `BAD_REQUEST` | Business-rule violation raised by the UDF (parent-chain inactive, duplicate key surfaced through the UDF instead of the unique index, already-deleted row on restore, etc). |
| 401 | `UNAUTHORIZED` | Missing or expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission, or delete blocked by active `branch_departments` rows. |
| 404 | `NOT_FOUND` | No branch with that id, or a dependent id (country/state/city) not found. |
| 409 | `DUPLICATE_ENTRY` | `code` clashes with another non-deleted branch. |
| 429 | `RATE_LIMIT_EXCEEDED` | Global rate-limit tripped (default `100 / 15m`). |
| 500 | `INTERNAL_ERROR` | Unhandled exception; production response omits the stack. |
