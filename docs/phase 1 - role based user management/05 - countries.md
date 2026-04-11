# Phase 1 — Countries

Reference data. All routes require auth. Permission codes: `country.read`, `country.create`, `country.update`, `country.delete`, `country.restore`.

← [04 users](04%20-%20users.md) · **Next →** [06 roles](06%20-%20roles.md)

---

## 5.1 `GET /api/v1/countries`

List countries.

**Query params**

| Param | Type | Notes |
|---|---|---|
| `pageIndex`, `pageSize` | int | Standard pagination. |
| `searchTerm` | string | Matches name, iso2, iso3. |
| `isActive`, `isDeleted` | bool | |
| `iso2` | 2-letter alpha | |
| `iso3` | 3-letter alpha | |
| `phoneCode` | `+?\d{1,7}` | E.g. `+91`. |
| `currency` | string | E.g. `INR`. |
| `nationality` | string | |
| `nationalLanguage` | string | |
| `language` | string | Match against the JSONB languages array. |
| `sortColumn` | enum | `id`, `name`, `iso2`, `iso3`, `phone_code`, `currency`, `nationality`, `national_language`, `is_active`, `is_deleted`, `created_at`, `updated_at`. Default `id`. |
| `sortDirection` | enum | `ASC` / `DESC`. |

**Response 200** — paginated envelope.

**Sample row**

```json
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
```

### Defaults — what you get if you omit everything

`GET /api/v1/countries` with no query string is interpreted as:

```
pageIndex=1  pageSize=20  sortColumn=id  sortDirection=ASC
isActive=∅   isDeleted=∅   (no other filters)
```

It returns the unfiltered first 20 rows ordered by id ascending.

### Sample queries & responses

All examples assume `http://localhost:3000` and an `Authorization: Bearer $ACCESS_TOKEN` header (omitted from each line for brevity — set `ACCESS_TOKEN` once before running them).

**1. Pagination — page 1, 5 rows per page**

```bash
curl "http://localhost:3000/api/v1/countries?pageIndex=1&pageSize=5" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "success": true,
  "message": "OK",
  "data": [
    { "id": 1, "name": "India", "iso2": "IN", "iso3": "IND", "...": "..." },
    { "id": 2, "name": "United States", "iso2": "US", "iso3": "USA", "...": "..." },
    { "id": 3, "name": "United Kingdom", "iso2": "GB", "iso3": "GBR", "...": "..." },
    { "id": 4, "name": "Canada", "iso2": "CA", "iso3": "CAN", "...": "..." },
    { "id": 5, "name": "Australia", "iso2": "AU", "iso3": "AUS", "...": "..." }
  ],
  "meta": { "page": 1, "limit": 5, "totalCount": 247, "totalPages": 50 }
}
```

**2. Pagination — page 2, 5 rows per page**

```bash
curl "http://localhost:3000/api/v1/countries?pageIndex=2&pageSize=5" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

The envelope is the same shape; `meta.page` becomes `2` and you get rows 6–10.

**3. Filter by `isActive`**

```bash
curl "http://localhost:3000/api/v1/countries?isActive=true" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Boolean params accept any of `true|false|1|0|yes|no` (case-insensitive).

**4. Show only soft-deleted rows**

```bash
curl "http://localhost:3000/api/v1/countries?isDeleted=true" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**5. Filter by ISO2 / ISO3**

```bash
curl "http://localhost:3000/api/v1/countries?iso2=IN" -H "Authorization: Bearer $ACCESS_TOKEN"
curl "http://localhost:3000/api/v1/countries?iso3=USA" -H "Authorization: Bearer $ACCESS_TOKEN"
```

`iso2` is normalised to upper-case server-side, so `iso2=in` works too.

**6. Filter by phone code**

```bash
curl "http://localhost:3000/api/v1/countries?phoneCode=%2B91" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`%2B` is the URL-encoded `+`. Pattern: `+?\d{1,7}`.

**7. Filter by currency / nationality / language**

```bash
curl "http://localhost:3000/api/v1/countries?currency=INR"           -H "Authorization: Bearer $ACCESS_TOKEN"
curl "http://localhost:3000/api/v1/countries?nationality=Indian"     -H "Authorization: Bearer $ACCESS_TOKEN"
curl "http://localhost:3000/api/v1/countries?nationalLanguage=Hindi" -H "Authorization: Bearer $ACCESS_TOKEN"
curl "http://localhost:3000/api/v1/countries?language=English"       -H "Authorization: Bearer $ACCESS_TOKEN"
```

`language` is matched against the `country_languages` JSONB array, so it returns every country whose `languages[]` contains the value.

**8. Free-text search**

```bash
curl "http://localhost:3000/api/v1/countries?searchTerm=ind" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`searchTerm` runs an `ILIKE` against `country_name`, `country_iso2`, and `country_iso3` inside `udf_get_countries`. Two-character ISO matches will hit too.

**9. Sorting — by name descending**

```bash
curl "http://localhost:3000/api/v1/countries?sortColumn=name&sortDirection=DESC" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

`sortColumn` is whitelisted; anything not in the table above returns `400 VALIDATION_ERROR`. `sortDirection` accepts `ASC|DESC|asc|desc`.

**10. Combined filters — active English-speaking countries on `+1`, sorted by name**

```bash
curl "http://localhost:3000/api/v1/countries?isActive=true&phoneCode=%2B1&language=English&sortColumn=name&sortDirection=ASC&pageSize=10" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

All filters compose with `AND`.

**11. Empty result**

When the filter combination matches nothing, the envelope is still `success: true`:

```json
{
  "success": true,
  "message": "OK",
  "data": [],
  "meta": { "page": 1, "limit": 20, "totalCount": 0, "totalPages": 0 }
}
```

**12. Page out of range**

```bash
curl "http://localhost:3000/api/v1/countries?pageIndex=999&pageSize=20" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "success": true,
  "message": "OK",
  "data": [],
  "meta": { "page": 999, "limit": 20, "totalCount": 247, "totalPages": 13 }
}
```

`meta.page` echoes the page you asked for; `data` is empty because there are only `totalPages` real pages.

### Possible error responses

**400 — `pageSize` over the cap (max 100)**

```bash
curl "http://localhost:3000/api/v1/countries?pageSize=500" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

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

The same envelope shape (with a different `path` / `message`) is returned for any other bad input — `pageIndex=0`, `iso2=USA` (must be 2 letters), `isActive=maybe`, an unknown `sortColumn`, etc. The full set of rules lives in `listCountriesQuerySchema` (`api/src/modules/resources/countries.schemas.ts`).

**401 — missing or expired bearer token**

```json
{ "success": false, "message": "Missing access token", "code": "UNAUTHORIZED" }
```

**403 — caller is authenticated but lacks `country.read`**

```json
{ "success": false, "message": "Permission denied", "code": "FORBIDDEN" }
```

**500** — see the global catalog in [00 — overview](00%20-%20overview.md#3-error-catalog).

---

## 5.2 `GET /api/v1/countries/:id`

Read a single country by id. Permission: `country.read`.

**Sample request**

```bash
curl "http://localhost:3000/api/v1/countries/1" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response 200**

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

**Possible error responses**

**400 — id not a positive integer**

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

**401 — missing or expired bearer token**

```json
{ "success": false, "message": "Missing access token", "code": "UNAUTHORIZED" }
```

**403 — caller lacks `country.read`**

```json
{ "success": false, "message": "Permission denied", "code": "FORBIDDEN" }
```

**404 — no country with that id**

```json
{ "success": false, "message": "Country 9999 not found", "code": "NOT_FOUND" }
```

---

## 5.3 `POST /api/v1/countries`

Create a country. Permission: `country.create`.

**Sample request**

```bash
curl -X POST "http://localhost:3000/api/v1/countries" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
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
  }'
```

`name`, `iso2`, and `iso3` are required; everything else is optional. `iso2` is normalised to upper-case and `iso3` to upper-case at the DB layer.

**Response 201** — full new row, including the database-generated `id` and timestamps.

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

**Possible error responses**

**400 — required field missing**

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

**400 — bad ISO length**

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

**401** — missing or expired bearer token (envelope as in 5.2).

**403 — caller lacks `country.create`**

```json
{ "success": false, "message": "Permission denied", "code": "FORBIDDEN" }
```

**409 — duplicate ISO**

```json
{
  "success": false,
  "message": "Country with iso2=CA already exists",
  "code": "DUPLICATE_ENTRY"
}
```

The full set of body rules lives in `createCountryBodySchema` (`api/src/modules/resources/countries.schemas.ts`).

---

## 5.4 `PATCH /api/v1/countries/:id`

Partial update — supply any subset of fields, but at least one. Permission: `country.update`. Accepts the same fields as the create body **except `flagImage`**, which is deliberately excluded from the PATCH schema.

> **Flag changes go through `POST /:id/flag` only.** The upload endpoint is the single entry point because it enforces WebP conversion, deterministic ISO3 naming, and delete-then-upload semantics on Bunny Storage. Sending `flagImage` as a raw URL in a PATCH body will be rejected by the validator as an unknown key.

**Sample request**

```bash
curl -X PATCH "http://localhost:3000/api/v1/countries/248" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currencyName": "Canadian Dollar",
    "languages": ["English", "French", "Inuktitut"],
    "isActive": true
  }'
```

**Response 200** — full updated row (same shape as 5.2's `data` block).

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

**Possible error responses**

**400 — empty body**

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

**401** — missing or expired bearer token.
**403** — caller lacks `country.update`.

**404 — no country with that id**

```json
{ "success": false, "message": "Country 9999 not found", "code": "NOT_FOUND" }
```

**409** — another country already uses the new `iso2` / `iso3`.

---

## 5.5 `DELETE /api/v1/countries/:id`

Soft delete. Sets `is_deleted = TRUE` on the row but keeps it in the table — call `POST /:id/restore` to bring it back. Permission: `country.delete`.

**Sample request**

```bash
curl -X DELETE "http://localhost:3000/api/v1/countries/248" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response 200**

```json
{
  "success": true,
  "message": "Country deleted",
  "data": { "id": 248, "deleted": true }
}
```

**Possible error responses**

**400** — non-numeric id (`VALIDATION_ERROR` envelope, `path: "id"`).
**401** — missing or expired bearer token.
**403** — caller lacks `country.delete`.

**404 — no country with that id**

```json
{ "success": false, "message": "Country 9999 not found", "code": "NOT_FOUND" }
```

---

## 5.6 `POST /api/v1/countries/:id/restore`

Reverse a soft delete — sets `is_deleted = FALSE`. Permission: `country.restore`.

**Sample request**

```bash
curl -X POST "http://localhost:3000/api/v1/countries/248/restore" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response 200** — full restored row.

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

**Possible error responses**

**400** — non-numeric id, or the row was never deleted (`is_deleted = FALSE`):

```json
{
  "success": false,
  "message": "Country 248 is not deleted",
  "code": "BAD_REQUEST"
}
```

**401** — missing or expired bearer token.
**403** — caller lacks `country.restore`.
**404** — no country with that id.

---

## 5.7 `POST /api/v1/countries/:id/flag`

Upload a country flag image. This is the **only** supported way to change a country's flag — PATCH `/:id` does not accept `flagImage` in its body.

Server-side pipeline:

1. Validate dimensions (**exactly 90 × 90 px**) and decode via `sharp`.
2. Re-encode to **WebP** (`quality: 90`).
3. **Delete prior flag object(s)** from Bunny Storage, best-effort: the new ISO3 key (belt-and-braces), the legacy ISO2 key from older uploads, and whatever path is currently persisted on the country row if it doesn't match either of those. Delete failures (including 404 for already-gone objects) are logged at WARN and do **not** block the new upload.
4. Upload the new WebP to Bunny Storage under the deterministic key **`countries/flags/<iso3>.webp`** — e.g. `countries/flags/ind.webp` for India, `countries/flags/usa.webp` for the United States. The CDN URL is therefore stable across updates for the same country.
5. Persist the new CDN URL on the country row via an internal-only flag-image setter (not reachable through PATCH).
6. Return the refreshed row.

> **Legacy rows.** Countries uploaded before this change have their flag at the old ISO2 key (e.g. `countries/flags/in.webp`). These are migrated organically — the next time someone re-uploads that country's flag, the pre-upload delete step above removes the legacy ISO2 object and the new object lands at the ISO3 key. No one-shot migration script is required; the CDN URL on the row updates in place.

Permission: `country.update`.

**Request — `multipart/form-data`**

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | binary | yes | The flag image. |

**Hard limits enforced by the server**

| Rule | Value | Enforced by |
|---|---|---|
| Max file size | **25 KB** | multer (before sharp runs) |
| MIME allowlist | `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml` | multer |
| Dimensions | **exactly 90 × 90 pixels** | sharp (after decode) |
| Output format | always **WebP** | sharp (re-encoded server-side) |

The country must exist and not be soft-deleted; restore it first if it is.

**Sample request**

```bash
curl -X POST https://api.growupmore.com/api/v1/countries/1/flag \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@india-90x90.png"
```

**Response 200** — full updated country row.

```json
{
  "success": true,
  "message": "Country flag uploaded",
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
    "updatedAt": "2026-04-10T09:14:22.518Z"
  }
}
```

**Errors specific to this route**

| HTTP | code | Cause |
|---|---|---|
| 400 | `BAD_REQUEST` | Missing `file` field — `"file field is required (multipart/form-data)"`. |
| 400 | `BAD_REQUEST` | File over the size cap — `"Flag image must not exceed 25 KB"`. |
| 400 | `BAD_REQUEST` | Disallowed MIME — `"Flag image must be one of: image/png, image/jpeg, image/webp, image/svg+xml"`. |
| 400 | `BAD_REQUEST` | Bad pixel size — `"Flag image must be exactly 90x90 pixels"` (response `details` includes `receivedWidth` and `receivedHeight`). |
| 400 | `BAD_REQUEST` | Corrupt image — `"Uploaded file is not a readable image"`. |
| 400 | `BAD_REQUEST` | Country is soft-deleted — `"Country N is soft-deleted; restore it before uploading a flag"`. |
| 404 | `NOT_FOUND` | No country with that id. |
| 502 | `BUNNY_UPLOAD_FAILED` | Bunny Storage rejected the PUT (network or auth error against the CDN). |

---

**Errors common to all country routes**

| HTTP | code | Cause |
|---|---|---|
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No country with that id. |
| 409 | `DUPLICATE_ENTRY` | Another country already uses that `iso2` / `iso3`. |
