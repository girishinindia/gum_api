# Phase 2 — Cities

Subdivision of a state. Every city is **owned by exactly one state**, which is owned by exactly one country. Returned with nested state and country payloads. Supports phone code, timezone, and website URL.

All routes require auth. Permission codes: `city.read`, `city.create`, `city.update`, `city.delete`, `city.restore`.

All examples below use the Postman environment variables **`{{baseUrl}}`** (e.g. `http://localhost:3000`) and **`{{accessToken}}`**. Set these once on your Postman environment — see [§7 in 00 - overview](00%20-%20overview.md#7-postman-environment).

← [01 states](01%20-%20states.md) · **Next →** [03 skills](03%20-%20skills.md)

---

## Endpoint summary

Quick reference of every endpoint documented on this page. Section numbers link down to the detailed request/response contracts below.

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§2.1](#21) | `GET` | `{{baseUrl}}/api/v1/cities` | city.read | List cities with state/country filters and multi-layer sort. |
| [§2.2](#22) | `GET` | `{{baseUrl}}/api/v1/cities/:id` | city.read | Get a single city by id. |
| [§2.3](#23) | `POST` | `{{baseUrl}}/api/v1/cities` | city.create | Create a new city. |
| [§2.4](#24) | `PATCH` | `{{baseUrl}}/api/v1/cities/:id` | city.update | Partial update of a city. |
| [§2.5](#25) | `DELETE` | `{{baseUrl}}/api/v1/cities/:id` | city.delete | Soft-delete a city. |
| [§2.6](#26) | `POST` | `{{baseUrl}}/api/v1/cities/:id/restore` | city.restore | Undo a soft-delete. |

---

## 2.1 `GET /api/v1/cities`

List cities. Backed by `udf_get_cities`, which joins cities → states → countries.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/cities` |
| Permission | `city.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | Page number (1-based). |
| `pageSize` | int | `20` | Max `100`. |
| `searchTerm` | string | — | `ILIKE` across city name, state name, country name. |
| `isActive` | bool | — | Shortcut for city layer. |
| `isDeleted` | bool | — | Shortcut for city layer. |
| `cityIsActive` | bool | — | Target city layer explicitly. |
| `cityIsDeleted` | bool | — | Target city layer explicitly. |
| `stateIsActive` | bool | — | Target state layer. |
| `countryIsActive` | bool | — | Target country layer. |
| `stateId` | int | — | Only cities under this state. |
| `countryId` | int | — | Only cities under this country. |
| `sortTable` | enum | `city` | `city`, `state`, or `country` — determines sort layer. |
| `sortColumn` | enum | `id` | Whitelisted: `id`, `name`, `phone_code`, `timezone`, `is_active`, `is_deleted`. |
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
      "id": 1421,
      "stateId": 27,
      "name": "Mumbai",
      "phoneCode": "022",
      "timezone": "Asia/Kolkata",
      "website": null,
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-11T00:00:00.000Z",
      "updatedAt": "2026-04-11T00:00:00.000Z",
      "deletedAt": null,
      "state": {
        "id": 27,
        "countryId": 1,
        "name": "Maharashtra",
        "languages": ["Marathi", "Hindi", "English"],
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

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "sortTable", "message": "Invalid enum value", "code": "invalid_enum_value" }
  ]
}
```

#### 401 UNAUTHORIZED / 403 FORBIDDEN

Standard shapes.


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
| Search city/state/country — `mumbai` | `?searchTerm=mumbai` |
| Search + pagination | `?pageIndex=2&pageSize=50&searchTerm=mumbai` |
| Active (city layer) only | `?isActive=true` |
| Inactive (city layer) only | `?isActive=false` |
| Deleted (city layer) only | `?isDeleted=true` |
| Non-deleted (city layer) only | `?isDeleted=false` |
| City layer explicit — active | `?cityIsActive=true` |
| City layer explicit — not deleted | `?cityIsDeleted=false` |
| State layer — active only | `?stateIsActive=true` |
| Country layer — active only | `?countryIsActive=true` |
| Cities in state id 27 | `?stateId=27` |
| Cities in country id 1 | `?countryId=1` |
| Cities in country 1 + state 27 + active | `?countryId=1&stateId=27&isActive=true` |
| Sort by city `id` DESC | `?sortTable=city&sortColumn=id&sortDirection=DESC` |
| Sort by city `name` ASC | `?sortTable=city&sortColumn=name&sortDirection=ASC` |
| Sort by city `phone_code` ASC | `?sortTable=city&sortColumn=phone_code&sortDirection=ASC` |
| Sort by city `timezone` ASC | `?sortTable=city&sortColumn=timezone&sortDirection=ASC` |
| Sort by city `is_active` DESC | `?sortTable=city&sortColumn=is_active&sortDirection=DESC` |
| Sort by city `is_deleted` DESC | `?sortTable=city&sortColumn=is_deleted&sortDirection=DESC` |
| Sort by state `name` ASC | `?sortTable=state&sortColumn=name&sortDirection=ASC` |
| Sort by country `name` ASC | `?sortTable=country&sortColumn=name&sortDirection=ASC` |
| Combo — active cities in state 27 sorted by name | `?pageIndex=1&pageSize=50&stateId=27&isActive=true&sortTable=city&sortColumn=name&sortDirection=ASC` |
| Combo — big page of cities in India, sort by state | `?pageIndex=1&pageSize=100&countryId=1&sortTable=state&sortColumn=name&sortDirection=ASC` |

---

## 2.2 `GET /api/v1/cities/:id`

Read a single city by id with nested state and country payloads.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/cities/:id` |
| Permission | `city.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric city id. |

**Request body** — none.

### Responses

#### 200 OK

Same row shape as 2.1 data array element.

#### 400 VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND

Standard shapes.

---

## 2.3 `POST /api/v1/cities`

Create a city. Permission: `city.create`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/cities` |
| Permission | `city.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** (`application/json`)

```json
{
  "stateId": 27,
  "name": "Mumbai",
  "phoneCode": "022",
  "timezone": "Asia/Kolkata",
  "website": null,
  "isActive": true
}
```

**Required fields**: `stateId`, `name`.

**Optional fields**: `phoneCode`, `timezone`, `website` (URL), `isActive` (defaults to `false`).

### Responses

#### 201 CREATED

Full city row with nested state and country.

#### 400 VALIDATION_ERROR / 400 BAD_REQUEST / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 409 DUPLICATE_ENTRY

Standard shapes. Duplicates on `(state_id, name)`.

---

## 2.4 `PATCH /api/v1/cities/:id`

Partial update. Patchable: `name`, `phoneCode`, `timezone`, `website`, `isActive`. Note: `stateId` is **not** patchable.

**Postman request**

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/cities/:id` |
| Permission | `city.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric city id. |

**Request body** (`application/json`)

```json
{ "timezone": "Asia/Kolkata", "phoneCode": "022" }
```

### Responses

#### 200 OK / 400 VALIDATION_ERROR / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND / 409 DUPLICATE_ENTRY

Standard shapes.

---

## 2.5 `DELETE /api/v1/cities/:id`

Soft delete. Permission: `city.delete`.

**Postman request**

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/cities/:id` |
| Permission | `city.delete` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric city id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{ "success": true, "message": "City deleted", "data": { "id": 1421, "deleted": true } }
```

#### 400 BAD_REQUEST / 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND

Standard shapes.

---

## 2.6 `POST /api/v1/cities/:id/restore`

Reverse a soft delete. Permission: `city.restore`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/cities/:id/restore` |
| Permission | `city.restore` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric city id. |

**Request body** — none.

### Responses

#### 200 OK

Full restored city row with nested state and country.

#### 400 BAD_REQUEST

Errors: row not deleted, or parent state is inactive/deleted.

#### 401 UNAUTHORIZED / 403 FORBIDDEN / 404 NOT_FOUND

Standard shapes.

---

## Common errors across all city routes

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | zod rejected query, params, or body. |
| 400 | `BAD_REQUEST` | Business-rule violation (parent state deleted, etc). |
| 401 | `UNAUTHORIZED` | Missing or expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No city with that id, or referenced state/country not found. |
| 409 | `DUPLICATE_ENTRY` | `(state_id, name)` clashes with another non-deleted city. |
| 429 | `RATE_LIMIT_EXCEEDED` | Global rate-limit tripped (default `100 / 15m`). |
| 500 | `INTERNAL_ERROR` | Unhandled exception; production response omits the stack. |
