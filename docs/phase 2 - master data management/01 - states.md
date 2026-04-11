# Phase 2 — States

First-class administrative region below a country (`IN-MH`, `US-CA`, etc). Every state is **owned by exactly one country** and is returned together with the nested country payload.

All routes require auth. Permission codes: `state.read`, `state.create`, `state.update`, `state.delete`, `state.restore`.

← [00 overview](00%20-%20overview.md) · **Next →** [02 cities](02%20-%20cities.md)

---

## 1.1 `GET /api/v1/states`

List states. Backed by `udf_getstates`, which joins `states` → `countries` and exposes filters at both layers.

**Query params**

| Param | Type | Notes |
|---|---|---|
| `pageIndex`, `pageSize` | int | Standard pagination. |
| `searchTerm` | string | Matches state name, ISO3, and country name. |
| `isActive`, `isDeleted` | bool | Shortcut for **the state layer** — equivalent to `stateIsActive` / `stateIsDeleted`. |
| `stateIsActive`, `stateIsDeleted` | bool | Target the state layer explicitly. |
| `countryIsActive`, `countryIsDeleted` | bool | Target the joined country. Useful for "states of active countries only". |
| `countryId` | int | Filter by owning country id. |
| `countryIso3` | 3-letter | E.g. `IND`, normalised to upper-case server-side. |
| `countryLanguage`, `stateLanguage` | string | Match against the respective `languages` JSONB arrays. |
| `sortTable` | enum | `state` (default) or `country`. |
| `sortColumn` | enum | For `sortTable=state`: `id`, `name`, `iso3`, `is_active`, `is_deleted`. For `sortTable=country`: `id`, `name`, `iso2`, `iso3`. |
| `sortDirection` | enum | `ASC` / `DESC`. |

**Response 200** — paginated envelope. Each row:

```json
{
  "id": 27,
  "name": "Maharashtra",
  "iso3": "MH",
  "languages": ["Marathi", "Hindi", "English"],
  "isActive": true,
  "isDeleted": false,
  "createdAt": "2026-01-03T00:00:00.000Z",
  "updatedAt": "2026-01-03T00:00:00.000Z",
  "deletedAt": null,
  "country": {
    "id": 1,
    "name": "India",
    "iso2": "IN",
    "iso3": "IND",
    "phoneCode": "+91",
    "currency": "INR",
    "isActive": true,
    "isDeleted": false
  }
}
```

### Defaults — what you get if you omit everything

`GET /api/v1/states` with no query string:

```
pageIndex=1  pageSize=20  sortTable=state  sortColumn=id  sortDirection=ASC
isActive=∅   isDeleted=∅   (no other filters)
```

Returns the first 20 states across all countries ordered by state id ascending.

### Sample queries

All examples assume `http://localhost:3000` and an `Authorization: Bearer $ACCESS_TOKEN` header (set `ACCESS_TOKEN` once before running).

**1. States of a specific country**

```bash
curl "http://localhost:3000/api/v1/states?countryId=1&pageSize=50" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**2. Same thing by ISO3**

```bash
curl "http://localhost:3000/api/v1/states?countryIso3=IND&pageSize=50" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**3. Active states of active countries only**

```bash
curl "http://localhost:3000/api/v1/states?stateIsActive=true&countryIsActive=true" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**4. Free-text search (works across state name, iso3, country name)**

```bash
curl "http://localhost:3000/api/v1/states?searchTerm=mahar" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**5. Sort by country name, then take the first 20**

```bash
curl "http://localhost:3000/api/v1/states?sortTable=country&sortColumn=name&sortDirection=ASC" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**6. Show only soft-deleted states**

```bash
curl "http://localhost:3000/api/v1/states?isDeleted=true" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**7. Combined — active English-speaking states under active countries**

```bash
curl "http://localhost:3000/api/v1/states?stateIsActive=true&countryIsActive=true&stateLanguage=English&sortTable=state&sortColumn=name" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Possible error responses

Same envelope as phase 1. Common cases: `400 VALIDATION_ERROR` for `pageSize` over the cap / unknown `sortColumn` / bad `countryIso3`; `401 UNAUTHORIZED` for missing token; `403 FORBIDDEN` for missing `state.read`.

---

## 1.2 `GET /api/v1/states/:id`

Read a single state by id, country included.

```bash
curl "http://localhost:3000/api/v1/states/27" -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response 200** — same row shape as 1.1. **404** with `"State 9999 not found"` if the id is unknown.

---

## 1.3 `POST /api/v1/states`

Create a state. Permission: `state.create`.

```bash
curl -X POST "http://localhost:3000/api/v1/states" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "countryId": 1,
    "name": "Maharashtra",
    "iso3": "MH",
    "languages": ["Marathi", "Hindi", "English"],
    "isActive": true
  }'
```

`countryId` and `name` are required; the rest is optional. `iso3` is normalised to upper-case at the DB layer. **Response 201** echoes the full new row (including joined country).

**Possible errors**

- **400** — missing `countryId` / `name`, `languages` not an array.
- **400** — referenced country is soft-deleted.
- **403** — caller lacks `state.create`.
- **404** — `countryId` points to a non-existent country (`"Country N not found"`).
- **409** — duplicate `(countryId, name)` or `(countryId, iso3)`.

---

## 1.4 `PATCH /api/v1/states/:id`

Partial update. Supply any subset of `name`, `iso3`, `languages`, `isActive`. `countryId` is **not** patchable — move a state to a different country by creating a new one and soft-deleting the old.

```bash
curl -X PATCH "http://localhost:3000/api/v1/states/27" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "languages": ["Marathi", "Hindi", "English", "Urdu"] }'
```

**Response 200** — the updated row. **400** on empty body (`"Provide at least one field to update"`). **404** on unknown id.

---

## 1.5 `DELETE /api/v1/states/:id`

Soft delete — sets `is_deleted = TRUE`. Permission: `state.delete`.

```bash
curl -X DELETE "http://localhost:3000/api/v1/states/27" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Response: `{ "success": true, "message": "State deleted", "data": { "id": 27, "deleted": true } }`. **404** if the id is unknown.

---

## 1.6 `POST /api/v1/states/:id/restore`

Reverse a soft delete. Permission: `state.restore`. Returns the full restored row.

```bash
curl -X POST "http://localhost:3000/api/v1/states/27/restore" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**400 BAD_REQUEST** if the row isn't deleted (`"State 27 is not deleted"`).

---

**Common errors across all state routes**

| HTTP | code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing / expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No state with that id. |
| 409 | `DUPLICATE_ENTRY` | Another state already uses that `(countryId, name|iso3)` pair. |
