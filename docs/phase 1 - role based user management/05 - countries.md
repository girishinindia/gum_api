# Phase 1 — Countries

Reference data. All routes require auth. Permission codes: `country.read`, `country.create`, `country.update`, `country.delete`, `country.restore`.

All examples below use the Postman environment variables **`{{baseUrl}}`** (e.g. `http://localhost:3000`) and **`{{accessToken}}`** (a Super Admin JWT minted via `POST {{baseUrl}}/api/v1/auth/login`). Set these once on your Postman environment — see [§7 in 00 - overview](00%20-%20overview.md#7-postman-environment).

← [04 users](04%20-%20users.md) · **Next →** [06 roles](06%20-%20roles.md)

---

## Endpoint summary

Quick reference of every endpoint documented on this page. Section numbers link down to the detailed request/response contracts below.

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§5.1](#51) | `GET` | `{{baseUrl}}/api/v1/countries` | country.read | List / search / filter countries (pagination + sort). |
| [§5.2](#52) | `GET` | `{{baseUrl}}/api/v1/countries/:id` | country.read | Get a single country by id. |
| [§5.3](#53) | `POST` | `{{baseUrl}}/api/v1/countries` | country.create | Create a new country. |
| [§5.4](#54) | `PATCH` | `{{baseUrl}}/api/v1/countries/:id` | country.update | Partial update — accepts JSON or `multipart/form-data` with a `flag` file. |
| [§5.5](#55) | `DELETE` | `{{baseUrl}}/api/v1/countries/:id` | country.delete | Soft-delete a country. |
| [§5.6](#56) | `POST` | `{{baseUrl}}/api/v1/countries/:id/restore` | country.restore | Undo a soft-delete. |

---

## 5.1 `GET /api/v1/countries`

List countries.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/countries` |
| Permission | `country.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | Page number (1-based). |
| `pageSize` | int | `20` | Standard pagination, max 100. |
| `searchTerm` | string | — | Matches name, iso2, iso3. |
| `isActive` | bool | — | `true` / `false` / `1` / `0` / `yes` / `no`. |
| `isDeleted` | bool | — | Same. |
| `iso2` | 2-letter alpha | — | |
| `iso3` | 3-letter alpha | — | |
| `phoneCode` | `+?\d{1,7}` | — | E.g. `+91`. |
| `currency` | string | — | E.g. `INR`. |
| `nationality` | string | — | |
| `nationalLanguage` | string | — | |
| `language` | string | — | Match against the JSONB languages array. |
| `sortColumn` | enum | `id` | `id`, `name`, `iso2`, `iso3`, `phone_code`, `currency`, `nationality`, `national_language`, `is_active`, `is_deleted`, `created_at`, `updated_at`. |
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
      "flagImage": "https://flags.example/in.svg",
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 247, "totalPages": 13 }
}
```

#### 400 VALIDATION_ERROR

Invalid `pageSize` (max 100), bad `iso2` length, `isActive=maybe`, unknown `sortColumn`, etc.

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "pageSize", "message": "pageSize must be ≤ 100", "code": "too_big" }
  ]
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied", "code": "FORBIDDEN" }
```

### Defaults — what you get if you omit everything

`GET /api/v1/countries` with no query string is interpreted as:

```
pageIndex=1  pageSize=20  sortColumn=id  sortDirection=ASC
isActive=∅   isDeleted=∅   (no other filters)
```

It returns the unfiltered first 20 rows ordered by id ascending.

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
| Search name / ISO — `ind` | `?searchTerm=ind` |
| Search + pagination | `?pageIndex=2&pageSize=50&searchTerm=ind` |
| Active only | `?isActive=true` |
| Inactive only | `?isActive=false` |
| Soft-deleted only | `?isDeleted=true` |
| Non-deleted only | `?isDeleted=false` |
| Filter by ISO-2 | `?iso2=IN` |
| Filter by ISO-3 | `?iso3=IND` |
| Filter by phone code | `?phoneCode=%2B91` |
| Filter by currency | `?currency=INR` |
| Filter by nationality | `?nationality=Indian` |
| Filter by national language | `?nationalLanguage=Hindi` |
| Filter by spoken language (JSONB `languages`) | `?language=English` |
| Sort by `id` DESC | `?sortColumn=id&sortDirection=DESC` |
| Sort by `name` ASC | `?sortColumn=name&sortDirection=ASC` |
| Sort by `iso2` ASC | `?sortColumn=iso2&sortDirection=ASC` |
| Sort by `iso3` ASC | `?sortColumn=iso3&sortDirection=ASC` |
| Sort by `phone_code` ASC | `?sortColumn=phone_code&sortDirection=ASC` |
| Sort by `currency` ASC | `?sortColumn=currency&sortDirection=ASC` |
| Sort by `nationality` ASC | `?sortColumn=nationality&sortDirection=ASC` |
| Sort by `national_language` ASC | `?sortColumn=national_language&sortDirection=ASC` |
| Sort by `is_active` DESC | `?sortColumn=is_active&sortDirection=DESC` |
| Sort by `is_deleted` DESC | `?sortColumn=is_deleted&sortDirection=DESC` |
| Sort by `created_at` DESC | `?sortColumn=created_at&sortDirection=DESC` |
| Sort by `updated_at` DESC | `?sortColumn=updated_at&sortDirection=DESC` |
| Combo — active countries sorted by name, page 1 | `?pageIndex=1&pageSize=50&isActive=true&sortColumn=name&sortDirection=ASC` |
| Combo — search `nepal`, sort newest first | `?pageIndex=1&pageSize=20&searchTerm=nepal&sortColumn=created_at&sortDirection=DESC` |
| Combo — Hindi-speaking countries sorted by ISO-2 | `?pageIndex=1&pageSize=100&language=Hindi&sortColumn=iso2&sortDirection=ASC` |

---

## 5.2 `GET /api/v1/countries/:id`

Read a single country by id. Permission: `country.read`.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/countries/:id` |
| Permission | `country.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric country id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": {
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
    "flagImage": "https://cdn.growupmore.com/countries/flags/ind.webp",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-04-10T09:14:22.518Z",
    "deletedAt": null
  }
}
```

#### 400 VALIDATION_ERROR

Id not a positive integer.

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
{ "success": false, "message": "Missing access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Country 9999 not found", "code": "NOT_FOUND" }
```

---

## 5.3 `POST /api/v1/countries`

Create a country. Permission: `country.create`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/countries` |
| Permission | `country.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

```json
{
  "name": "Canada",
  "iso2": "CA",
  "iso3": "CAN",
  "phoneCode": "+1",
  "currency": "CAD",
  "currencyName": "Canadian Dollar",
  "currencySymbol": "$",
  "nationalLanguage": "English",
  "nationality": "Canadian",
  "languages": ["English", "French"],
  "tld": ".ca",
  "flagImage": "https://flags.example/ca.svg",
  "isActive": true
}
```

**Required fields**: `name`, `iso2`, `iso3`.

**Optional fields**: `phoneCode`, `currency`, `currencyName`, `currencySymbol`, `nationalLanguage`, `nationality`, `languages`, `tld`, `flagImage`, `isActive` (defaults to **`false`** at the API layer — see [§6 in 00 - overview](00%20-%20overview.md#6-active-flag-defaults)).

`iso2` is normalised to upper-case and `iso3` to upper-case at the DB layer.

### Responses

#### 201 CREATED

```json
{
  "success": true,
  "message": "Country created",
  "data": {
    "id": 248,
    "name": "Canada",
    "iso2": "CA",
    "iso3": "CAN",
    "phoneCode": "+1",
    "currency": "CAD",
    "currencyName": "Canadian Dollar",
    "currencySymbol": "$",
    "nationalLanguage": "English",
    "nationality": "Canadian",
    "languages": ["English", "French"],
    "tld": ".ca",
    "flagImage": "https://flags.example/ca.svg",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T11:22:33.124Z",
    "updatedAt": "2026-04-10T11:22:33.124Z",
    "deletedAt": null
  }
}
```

#### 400 VALIDATION_ERROR — required field missing

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "iso2", "message": "Required", "code": "invalid_type" }
  ]
}
```

#### 400 VALIDATION_ERROR — bad ISO length

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": "iso3", "message": "iso3 must be exactly 3 characters", "code": "too_small" }
  ]
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied", "code": "FORBIDDEN" }
```

#### 409 DUPLICATE_ENTRY

```json
{
  "success": false,
  "message": "Country with iso2=CA already exists",
  "code": "DUPLICATE_ENTRY"
}
```

---

## 5.4 `PATCH /api/v1/countries/:id`

Partial update — supply any subset of fields, but at least one. Permission: `country.update`. Accepts the same fields as the create body **except `flagImage`**, which is deliberately excluded from the PATCH schema.

This route accepts **two content types** and both hit the same handler:

* **`application/json`** — text-only patch. Body is a subset of the create fields (minus `flagImage`).
* **`multipart/form-data`** — text fields in the same multipart body, plus an optional flag file under the form-data field name **`flag`** (aliases: `flagImage`, `file`). When the flag part is present, the server runs the locked flag pipeline below before returning the refreshed row: decode via sharp, enforce exact 90 × 90 dimensions, re-encode to WebP (quality 90), delete any prior Bunny objects (ISO3 target key, legacy ISO2 key, and the path currently persisted on the row if it is somewhere else), then PUT the new WebP under the deterministic key **`countries/flags/<iso3>.webp`**. The CDN URL is therefore stable across updates for the same country.

> **Why flag lives under PATCH now.** In phase-02 Stage 4 the old dedicated `POST /:id/flag` route was folded into PATCH so callers can update text fields and the flag image in a single round-trip. The server-side pipeline is unchanged; only the wire contract moved. Sending `flagImage` as a raw URL in a PATCH body is still rejected by the validator as an unknown key — the flag image URL is only ever set by the flag pipeline.

**Postman request**

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/countries/:id` |
| Permission | `country.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` (for text-only) or `multipart/form-data` (for flag uploads) |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric country id. |

**Request body** — JSON or multipart:

*Text-only patch:*

```json
{
  "currencyName": "Canadian Dollar",
  "languages": ["English", "French", "Inuktitut"],
  "isActive": true
}
```

*Multipart — update phone code and upload flag:*

Form fields:
- `phoneCode`: `+91`
- `flag`: (binary file)

### Hard limits on the flag file

| Rule | Value | Enforced by |
|---|---|---|
| Max file size | **25 KB** | multer (before sharp runs) |
| MIME allowlist | `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml` | multer |
| Dimensions | **exactly 90 × 90 pixels** | sharp (after decode) |
| Output format | always **WebP** | sharp (re-encoded server-side) |

The country must exist and not be soft-deleted; restore it first if it is. There is no `flagAction=delete` — countries are required to have a flag image.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Country updated",
  "data": {
    "id": 248,
    "name": "Canada",
    "iso2": "CA",
    "iso3": "CAN",
    "phoneCode": "+1",
    "currency": "CAD",
    "currencyName": "Canadian Dollar",
    "currencySymbol": "$",
    "nationalLanguage": "English",
    "nationality": "Canadian",
    "languages": ["English", "French", "Inuktitut"],
    "tld": ".ca",
    "flagImage": "https://flags.example/ca.svg",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T11:22:33.124Z",
    "updatedAt": "2026-04-10T11:48:09.701Z",
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

#### 400 BAD_REQUEST — flag file over size cap

```json
{
  "success": false,
  "message": "Country flag must not exceed 25 KB",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — disallowed MIME type

```json
{
  "success": false,
  "message": "Country flag must be one of: image/png, image/jpeg, image/webp, image/svg+xml",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — bad pixel size

```json
{
  "success": false,
  "message": "Flag image must be exactly 90x90 pixels",
  "code": "BAD_REQUEST",
  "details": { "receivedWidth": 100, "receivedHeight": 100 }
}
```

#### 400 BAD_REQUEST — corrupt image

```json
{
  "success": false,
  "message": "Uploaded file is not a readable image",
  "code": "BAD_REQUEST"
}
```

#### 400 BAD_REQUEST — country is soft-deleted

```json
{
  "success": false,
  "message": "Country N is soft-deleted; restore it before uploading a flag",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Country 9999 not found", "code": "NOT_FOUND" }
```

#### 409 DUPLICATE_ENTRY

Another country already uses the new `iso2` / `iso3`.

```json
{ "success": false, "message": "Country with iso2=CA already exists", "code": "DUPLICATE_ENTRY" }
```

#### 502 BUNNY_UPLOAD_FAILED

Bunny Storage rejected the PUT (network or auth error against the CDN).

```json
{
  "success": false,
  "message": "Failed to upload flag image to CDN",
  "code": "BUNNY_UPLOAD_FAILED"
}
```

---

## 5.5 `DELETE /api/v1/countries/:id`

Soft delete. Sets `is_deleted = TRUE` on the row but keeps it in the table — call `POST /:id/restore` to bring it back. Permission: `country.delete`.

**Postman request**

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/countries/:id` |
| Permission | `country.delete` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric country id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Country deleted",
  "data": { "id": 248, "deleted": true }
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
    { "path": "id", "message": "Expected number", "code": "invalid_type" }
  ]
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Country 9999 not found", "code": "NOT_FOUND" }
```

---

## 5.6 `POST /api/v1/countries/:id/restore`

Reverse a soft delete — sets `is_deleted = FALSE`. Permission: `country.restore`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/countries/:id/restore` |
| Permission | `country.restore` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric country id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Country restored",
  "data": {
    "id": 248,
    "name": "Canada",
    "iso2": "CA",
    "iso3": "CAN",
    "phoneCode": "+1",
    "currency": "CAD",
    "currencyName": "Canadian Dollar",
    "currencySymbol": "$",
    "nationalLanguage": "English",
    "nationality": "Canadian",
    "languages": ["English", "French", "Inuktitut"],
    "tld": ".ca",
    "flagImage": "https://flags.example/ca.svg",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-10T11:22:33.124Z",
    "updatedAt": "2026-04-10T12:05:17.880Z",
    "deletedAt": null
  }
}
```

#### 400 BAD_REQUEST

Non-numeric id, or the row was never deleted (`is_deleted = FALSE`):

```json
{
  "success": false,
  "message": "Country 248 is not deleted",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED

```json
{ "success": false, "message": "Missing access token", "code": "UNAUTHORIZED" }
```

#### 403 FORBIDDEN

```json
{ "success": false, "message": "Permission denied", "code": "FORBIDDEN" }
```

#### 404 NOT_FOUND

```json
{ "success": false, "message": "Country 9999 not found", "code": "NOT_FOUND" }
```

---

## 5.7 Flag upload — unified into `PATCH /:id`

The dedicated `POST /api/v1/countries/:id/flag` endpoint was **removed in phase-02 Stage 4**. Flag uploads now travel through `PATCH /:id` (section 5.4) with a `multipart/form-data` body that carries the file under the form-data field **`flag`**.

**Sample — upload a new flag with no other field changes**

**Postman request**

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/countries/1` |
| Permission | `country.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `multipart/form-data` |

**Body** — form-data:
- Field name: `flag`
- File: `india-90x90.png`

**Sample — update the phone code and the flag in a single round-trip**

**Postman request**

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/countries/1` |
| Permission | `country.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `multipart/form-data` |

**Body** — form-data:
- Field name: `phoneCode`, Value: `+91`
- Field name: `flag`, File: `india-90x90.png`

---

## Common errors across all country routes

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | zod rejected query, params, or body (pageSize > 100, bad iso2 length, isActive=maybe, unknown sortColumn, empty body on patch, etc). |
| 400 | `BAD_REQUEST` | Flag file over size cap, disallowed MIME, bad pixel size, corrupt image, or country is soft-deleted. |
| 401 | `UNAUTHORIZED` | Missing or expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No country with that id. |
| 409 | `DUPLICATE_ENTRY` | Another country already uses that `iso2` / `iso3`. |
| 429 | `RATE_LIMIT_EXCEEDED` | Global rate-limit tripped (default `100 / 15m`). |
| 500 | `INTERNAL_ERROR` | Unhandled exception; production response omits the stack. |
| 502 | `BUNNY_UPLOAD_FAILED` | Bunny Storage rejected the flag PUT. |
