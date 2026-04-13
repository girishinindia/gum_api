# Phase 2 — States

First-class administrative region below a country (e.g. `IN-MH` Maharashtra, `US-CA` California). Every state is **owned by exactly one country** and is returned together with the nested country payload. Supports optional languages array and filtering/sorting across the state-country join tree.

All routes require auth. Permission codes: `state.read`, `state.create`, `state.update`, `state.delete`, `state.restore`.

All examples below use the Postman environment variables **`{{baseUrl}}`** (e.g. `http://localhost:3000`) and **`{{accessToken}}`** (a Super Admin JWT minted via `POST {{baseUrl}}/api/v1/auth/login`). Set these once on your Postman environment — see [§7 in 00 - overview](00%20-%20overview.md#7-postman-environment).

← [00 overview](00%20-%20overview.md) · **Next →** [02 cities](02%20-%20cities.md)

---

## Endpoint summary

Quick reference of every endpoint documented on this page. Section numbers link down to the detailed request/response contracts below.

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11) | `GET` | `{{baseUrl}}/api/v1/states` | state.read | List states with country filters, multi-layer sort. |
| [§1.2](#12) | `GET` | `{{baseUrl}}/api/v1/states/:id` | state.read | Get a single state by id. |
| [§1.3](#13) | `POST` | `{{baseUrl}}/api/v1/states` | state.create | Create a new state. |
| [§1.4](#14) | `PATCH` | `{{baseUrl}}/api/v1/states/:id` | state.update | Partial update of a state. |
| [§1.5](#15) | `DELETE` | `{{baseUrl}}/api/v1/states/:id` | state.delete | Soft-delete a state. |
| [§1.6](#16) | `POST` | `{{baseUrl}}/api/v1/states/:id/restore` | state.restore | Undo a soft-delete. |

---

## 1.1 `GET /api/v1/states`

List states. Backed by `udf_get_states`, which joins `states` → `countries` and exposes filters and sort keys at both layers.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/states` |
| Permission | `state.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | Page number (1-based). |
| `pageSize` | int | `20` | Max `100`. |
| `searchTerm` | string | — | `ILIKE` across state name, iso3, and country name. |
| `isActive` | bool | — | Shortcut for the state layer (`stateIsActive`). |
| `isDeleted` | bool | — | Shortcut for the state layer (`stateIsDeleted`). |
| `stateIsActive` | bool | — | Target the state layer explicitly. |
| `stateIsDeleted` | bool | — | Target the state layer explicitly. |
| `countryIsActive` | bool | — | Target the joined country layer. |
| `countryIsDeleted` | bool | — | Target the joined country layer. |
| `countryId` | int | — | Only states under this country. |
| `countryIso3` | string | — | Only states under this country (by 3-letter code, e.g. `IND`, normalized to upper-case server-side). |
| `sortTable` | enum | `state` | `state` or `country` — determines which table's column to sort by. |
| `sortColumn` | enum | `id` | For `sortTable=state`: `id`, `name`, `iso3`, `is_active`, `is_deleted`. For `sortTable=country`: `id`, `name`, `iso2`, `iso3`. |
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
      "id": 27,
      "countryId": 1,
      "name": "Maharashtra",
      "iso3": "MH",
      "languages": ["Marathi", "Hindi", "English"],
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-11T00:00:00.000Z",
      "updatedAt": "2026-04-11T00:00:00.000Z",
      "deletedAt": null,
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

#### 400 VALIDATION_ERROR

Triggered by unknown `sortColumn`, `pageSize` > 100, or any query coercion failure.

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "path": "sortColumn",
      "message": "Invalid enum value. Expected 'id' | 'name' | 'iso3' | 'is_active' | 'is_deleted' | 'iso2', received 'foo'",
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
  "message": "Permission denied: state.read",
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
| Search state/iso/country — `maha` | `?searchTerm=maha` |
| Search + pagination | `?pageIndex=2&pageSize=50&searchTerm=maha` |
| Active (state layer) only | `?isActive=true` |
| Inactive (state layer) only | `?isActive=false` |
| Deleted (state layer) only | `?isDeleted=true` |
| Non-deleted (state layer) only | `?isDeleted=false` |
| State layer explicit — active | `?stateIsActive=true` |
| State layer explicit — not deleted | `?stateIsDeleted=false` |
| Country layer — active only | `?countryIsActive=true` |
| Country layer — not deleted | `?countryIsDeleted=false` |
| States under country id 1 | `?countryId=1` |
| States under ISO-3 `IND` | `?countryIso3=IND` |
| States under country + active | `?countryId=1&isActive=true` |
| Sort by state `id` DESC | `?sortTable=state&sortColumn=id&sortDirection=DESC` |
| Sort by state `name` ASC | `?sortTable=state&sortColumn=name&sortDirection=ASC` |
| Sort by state `iso3` ASC | `?sortTable=state&sortColumn=iso3&sortDirection=ASC` |
| Sort by state `is_active` DESC | `?sortTable=state&sortColumn=is_active&sortDirection=DESC` |
| Sort by state `is_deleted` DESC | `?sortTable=state&sortColumn=is_deleted&sortDirection=DESC` |
| Sort by country `id` ASC | `?sortTable=country&sortColumn=id&sortDirection=ASC` |
| Sort by country `name` ASC | `?sortTable=country&sortColumn=name&sortDirection=ASC` |
| Sort by country `iso2` ASC | `?sortTable=country&sortColumn=iso2&sortDirection=ASC` |
| Sort by country `iso3` ASC | `?sortTable=country&sortColumn=iso3&sortDirection=ASC` |
| Combo — active states in India sorted by name | `?pageIndex=1&pageSize=50&countryIso3=IND&isActive=true&sortTable=state&sortColumn=name&sortDirection=ASC` |
| Combo — search `delhi`, country layer sort | `?pageIndex=1&pageSize=20&searchTerm=delhi&sortTable=country&sortColumn=name&sortDirection=ASC` |

---

## 1.2 `GET /api/v1/states/:id`

Read a single state by id, with nested country payload. Soft-deleted states are returned by id (the UDF does not apply the `is_deleted` filter for `p_id` lookups).

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/states/:id` |
| Permission | `state.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric state id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 27,
    "countryId": 1,
    "name": "Maharashtra",
    "iso3": "MH",
    "languages": ["Marathi", "Hindi", "English"],
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-11T00:00:00.000Z",
    "updatedAt": "2026-04-11T00:00:00.000Z",
    "deletedAt": null,
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
{ "success": false, "message": "Permission denied: state.read", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "State 9999 not found", "code": "NOT_FOUND" }
```

---

## 1.3 `POST /api/v1/states`

Create a state. Permission: `state.create`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/states` |
| Permission | `state.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** (`application/json`)

```json
{
  "countryId": 1,
  "name": "Maharashtra",
  "iso3": "MH",
  "languages": ["Marathi", "Hindi", "English"],
  "isActive": true
}
```

**Required fields**: `countryId`, `name`.

**Optional fields**: `iso3` (normalized to upper-case server-side), `languages` (array of strings), `isActive` (defaults to **`false`** — see [§6 in 00 - overview](00%20-%20overview.md#6-active-flag-defaults)).

### Responses

#### 201 CREATED

```json
{
  "success": true,
  "message": "State created",
  "data": {
    "id": 27,
    "countryId": 1,
    "name": "Maharashtra",
    "iso3": "MH",
    "languages": ["Marathi", "Hindi", "English"],
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-11T00:00:00.000Z",
    "updatedAt": "2026-04-11T00:00:00.000Z",
    "deletedAt": null,
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
    { "path": "name", "message": "Required", "code": "invalid_type" }
  ]
}
```

#### 400 BAD_REQUEST — referenced country is deleted

```json
{
  "success": false,
  "message": "Country 9999 is deleted or does not exist.",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: state.create", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND — country does not exist

```json
{ "success": false, "message": "Country 9999 not found", "code": "NOT_FOUND" }
```

#### 409 DUPLICATE_ENTRY

Unique constraint on `(country_id, name)` and `(country_id, iso3)`.

```json
{
  "success": false,
  "message": "State \"Maharashtra\" already exists under this country.",
  "code": "DUPLICATE_ENTRY"
}
```

---

## 1.4 `PATCH /api/v1/states/:id`

Partial update. Every field is optional, but body must contain **at least one** known key.

Patchable fields: `name`, `iso3`, `languages`, `isActive`. Note: `countryId` is **not** patchable — create a new state and soft-delete the old if you need to move it to a different country.

**Postman request**

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/states/:id` |
| Permission | `state.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric state id. |

**Request body** (`application/json`) — some sample variants:

*Add languages*

```json
{ "languages": ["Marathi", "Hindi", "English", "Urdu"] }
```

*Change name and activate*

```json
{ "name": "Maharashtra (Updated)", "isActive": true }
```

### Responses

#### 200 OK

Same row shape as `1.2 GET /:id`, wrapped in success envelope:

```json
{ "success": true, "message": "State updated", "data": { "id": 27, "...": "..." } }
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

#### 401 UNAUTHORIZED / 403 FORBIDDEN — shape as 1.3.

#### 404 NOT_FOUND

```json
{ "success": false, "message": "State 9999 not found", "code": "NOT_FOUND" }
```

#### 409 DUPLICATE_ENTRY

```json
{ "success": false, "message": "State \"Maharashtra\" already exists under this country.", "code": "DUPLICATE_ENTRY" }
```

---

## 1.5 `DELETE /api/v1/states/:id`

Soft delete — sets `is_deleted = TRUE`, `is_active = FALSE`, `deleted_at = NOW()`. Permission: `state.delete`.

**Postman request**

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/states/:id` |
| Permission | `state.delete` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric state id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "State deleted",
  "data": { "id": 27, "deleted": true }
}
```

#### 400 BAD_REQUEST — already deleted

```json
{
  "success": false,
  "message": "State with ID 27 does not exist or is already deleted.",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied: state.delete", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "State 9999 not found", "code": "NOT_FOUND" }
```

---

## 1.6 `POST /api/v1/states/:id/restore`

Reverse a soft delete. Permission: `state.restore`. Restore sets `is_deleted = FALSE` and `is_active = TRUE` in one shot and returns the full refreshed row.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/states/:id/restore` |
| Permission | `state.restore` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric state id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "State restored",
  "data": {
    "id": 27,
    "countryId": 1,
    "name": "Maharashtra",
    "iso3": "MH",
    "languages": ["Marathi", "Hindi", "English"],
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-11T00:00:00.000Z",
    "updatedAt": "2026-04-11T00:00:00.000Z",
    "deletedAt": null,
    "country": { "id": 1, "name": "India", "iso2": "IN", "...": "..." }
  }
}
```

#### 400 BAD_REQUEST — not deleted

```json
{
  "success": false,
  "message": "State with ID 27 is not deleted or does not exist.",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — parent country dead

```json
{
  "success": false,
  "message": "Cannot restore state: parent country is inactive or deleted.",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED / 403 FORBIDDEN — shape as 1.3.

#### 404 NOT_FOUND

```json
{ "success": false, "message": "State 9999 not found", "code": "NOT_FOUND" }
```

---

## Common errors across all state routes

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | zod rejected query, params, or body. |
| 400 | `BAD_REQUEST` | Business-rule violation (parent country dead on restore, country deleted on create, etc). |
| 401 | `UNAUTHORIZED` | Missing or expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No state with that id, or referenced country not found. |
| 409 | `DUPLICATE_ENTRY` | `(countryId, name)` or `(countryId, iso3)` clashes with another non-deleted state. |
| 429 | `RATE_LIMIT_EXCEEDED` | Global rate-limit tripped (default `100 / 15m`). |
| 500 | `INTERNAL_ERROR` | Unhandled exception; production response omits the stack. |
