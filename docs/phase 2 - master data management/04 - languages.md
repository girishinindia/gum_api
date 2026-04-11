# Phase 2 — Languages

Canonical list of languages — one row per language, optionally with its native name, ISO 639 code, and writing script. Used by the countries/states/cities `languages` JSONB arrays for lookup and by anything in the product that needs a language picker.

All routes require auth. Permission codes: `language.read`, `language.create`, `language.update`, `language.delete`, `language.restore`.

← [03 skills](03%20-%20skills.md) · **Next →** [05 education-levels](05%20-%20education-levels.md)

---

## 4.1 `GET /api/v1/languages`

List languages. Backed by `udf_get_languages`.

**Query params**

| Param | Type | Notes |
|---|---|---|
| `pageIndex`, `pageSize` | int | Standard pagination. |
| `searchTerm` | string | `ILIKE` against `language_name`, `language_native_name`, and `language_iso_code`. |
| `isActive`, `isDeleted` | bool | |
| `isoCode` | 2–8 char | ISO 639-1 two-letter code, optionally with a BCP-47 region suffix (`en`, `en-us`, `zh-hant`). **Normalised to lowercase** server-side. |
| `script` | string | Writing system, e.g. `Latin`, `Devanagari`, `Cyrillic`. |
| `sortColumn` | enum | `id`, `name`, `iso_code`, `script`, `is_active`, `is_deleted`, `created_at`, `updated_at`. Default `id`. |
| `sortDirection` | enum | `ASC` / `DESC`. |

**Sample row**

```json
{
  "id": 3,
  "name": "Hindi",
  "nativeName": "हिन्दी",
  "isoCode": "hi",
  "script": "Devanagari",
  "isActive": true,
  "isDeleted": false,
  "createdAt": "2026-01-12T00:00:00.000Z",
  "updatedAt": "2026-01-12T00:00:00.000Z",
  "deletedAt": null
}
```

### Defaults

```
pageIndex=1  pageSize=20  sortColumn=id  sortDirection=ASC
```

### Sample queries

**1. Look up a language by ISO code**

```bash
curl "http://localhost:3000/api/v1/languages?isoCode=hi" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Case-insensitive — `isoCode=HI` and `isoCode=Hi` return the same row because the schema `.transform`s the input to lowercase before calling the UDF.

**2. All languages written in Devanagari**

```bash
curl "http://localhost:3000/api/v1/languages?script=Devanagari" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**3. Search across name / native name / ISO code**

```bash
curl "http://localhost:3000/api/v1/languages?searchTerm=hin" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**4. Alphabetical list of active languages**

```bash
curl "http://localhost:3000/api/v1/languages?isActive=true&sortColumn=name&sortDirection=ASC&pageSize=100" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**5. Archived (soft-deleted) languages**

```bash
curl "http://localhost:3000/api/v1/languages?isDeleted=true" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 4.2 `GET /api/v1/languages/:id`

Read a single language by id. **404** with `"Language 9999 not found"` if unknown.

```bash
curl "http://localhost:3000/api/v1/languages/3" -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 4.3 `POST /api/v1/languages`

Create a language. Permission: `language.create`.

```bash
curl -X POST "http://localhost:3000/api/v1/languages" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hindi",
    "nativeName": "हिन्दी",
    "isoCode": "hi",
    "script": "Devanagari",
    "isActive": true
  }'
```

`name` is required; the rest is optional. `isoCode` is normalised to lowercase. **Response 201** — the full new row.

**Possible errors**

- **400** — missing `name`, `isoCode` not alphabetic, `isoCode` shorter than 2 or longer than 8.
- **403** — caller lacks `language.create`.
- **409** — another language already uses that `isoCode`.

---

## 4.4 `PATCH /api/v1/languages/:id`

Partial update. Any subset of `name`, `nativeName`, `isoCode`, `script`, `isActive`. **400** on empty body.

```bash
curl -X PATCH "http://localhost:3000/api/v1/languages/3" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "script": "Devanagari" }'
```

---

## 4.5 `DELETE /api/v1/languages/:id`

Soft delete. Permission: `language.delete`.

```bash
curl -X DELETE "http://localhost:3000/api/v1/languages/3" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Response: `{ "success": true, "message": "Language deleted", "data": { "id": 3, "deleted": true } }`.

---

## 4.6 `POST /api/v1/languages/:id/restore`

Reverse a soft delete. Permission: `language.restore`. **400 BAD_REQUEST** if the row isn't deleted.

```bash
curl -X POST "http://localhost:3000/api/v1/languages/3/restore" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

**Common errors across all language routes**

| HTTP | code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing / expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No language with that id. |
| 409 | `DUPLICATE_ENTRY` | Another language already uses that `isoCode`. |
