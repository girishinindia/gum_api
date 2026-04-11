# Phase 2 — Cities

Cities hang off states. Every city row returns with its **nested state** and **nested country**, so one `/cities` response is enough to render a full "City, State, Country" label without extra lookups.

All routes require auth. Permission codes: `city.read`, `city.create`, `city.update`, `city.delete`, `city.restore`.

← [01 states](01%20-%20states.md) · **Next →** [03 skills](03%20-%20skills.md)

---

## 2.1 `GET /api/v1/cities`

List cities. Backed by `udf_getcities`, which joins `cities` → `states` → `countries` and exposes filters at all three layers.

**Query params**

| Param | Type | Notes |
|---|---|---|
| `pageIndex`, `pageSize` | int | Standard pagination. |
| `searchTerm` | string | Matches city name, state name, and country name. |
| `isActive`, `isDeleted` | bool | Shortcut for **the city layer**. |
| `cityIsActive`, `cityIsDeleted` | bool | City layer, explicit. |
| `stateIsActive`, `stateIsDeleted` | bool | State layer. |
| `countryIsActive`, `countryIsDeleted` | bool | Country layer. |
| `countryId` | int | Filter by owning country id. |
| `countryIso3` | 3-letter | E.g. `IND`. |
| `stateId` | int | Filter by owning state id. |
| `cityPhoneCode` | string | E.g. `022` (local city code, not the country dialling prefix). |
| `cityTimezone` | string | E.g. `Asia/Kolkata`. |
| `countryLanguage`, `stateLanguage` | string | Match against the respective `languages` JSONB arrays. |
| `sortTable` | enum | `city` (default), `state`, or `country`. |
| `sortColumn` | enum | Whitelisted per `sortTable`. |
| `sortDirection` | enum | `ASC` / `DESC`. |

**Sample row**

```json
{
  "id": 101,
  "name": "Mumbai",
  "phoneCode": "022",
  "timezone": "Asia/Kolkata",
  "website": "https://www.mcgm.gov.in",
  "isActive": true,
  "isDeleted": false,
  "createdAt": "2026-01-05T00:00:00.000Z",
  "updatedAt": "2026-01-05T00:00:00.000Z",
  "deletedAt": null,
  "state": {
    "id": 27,
    "name": "Maharashtra",
    "iso3": "MH",
    "isActive": true,
    "isDeleted": false
  },
  "country": {
    "id": 1,
    "name": "India",
    "iso2": "IN",
    "iso3": "IND",
    "phoneCode": "+91",
    "isActive": true,
    "isDeleted": false
  }
}
```

### Defaults — what you get if you omit everything

```
pageIndex=1  pageSize=20  sortTable=city  sortColumn=id  sortDirection=ASC
```

Returns the first 20 cities across all countries ordered by city id ascending.

### Sample queries

**1. All cities of a specific state**

```bash
curl "http://localhost:3000/api/v1/cities?stateId=27&pageSize=50" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**2. All cities of a country (drill down from country → state → city in one query)**

```bash
curl "http://localhost:3000/api/v1/cities?countryIso3=IND" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**3. Active cities of active states of active countries**

```bash
curl "http://localhost:3000/api/v1/cities?cityIsActive=true&stateIsActive=true&countryIsActive=true" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**4. Free-text search across city / state / country names**

```bash
curl "http://localhost:3000/api/v1/cities?searchTerm=mumb" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**5. Filter by timezone**

```bash
curl "http://localhost:3000/api/v1/cities?cityTimezone=Asia%2FKolkata" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Note the URL-encoded `/`.

**6. Sort by country name, then state name, then city name**

Only one `sortColumn` at a time is supported server-side; sort by the coarser field and do the finer sort client-side. For the most common "by country" case:

```bash
curl "http://localhost:3000/api/v1/cities?sortTable=country&sortColumn=name&sortDirection=ASC" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**7. Show only soft-deleted cities**

```bash
curl "http://localhost:3000/api/v1/cities?isDeleted=true" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 2.2 `GET /api/v1/cities/:id`

Read a single city by id. Same row shape as 2.1. **404** with `"City 9999 not found"` if the id is unknown.

```bash
curl "http://localhost:3000/api/v1/cities/101" -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 2.3 `POST /api/v1/cities`

Create a city. Permission: `city.create`.

```bash
curl -X POST "http://localhost:3000/api/v1/cities" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stateId": 27,
    "name": "Mumbai",
    "phoneCode": "022",
    "timezone": "Asia/Kolkata",
    "website": "https://www.mcgm.gov.in",
    "isActive": true
  }'
```

`stateId` and `name` are required; the rest is optional. The server looks up the country through the chosen state — you do not pass `countryId`. **Response 201** echoes the full new row with both nested `state` and nested `country`.

**Possible errors**

- **400** — missing `stateId` / `name`, `website` not a valid URL, `timezone` not a known IANA zone.
- **400** — referenced state (or its country) is soft-deleted.
- **403** — caller lacks `city.create`.
- **404** — `stateId` points to a non-existent state.
- **409** — duplicate `(stateId, name)`.

---

## 2.4 `PATCH /api/v1/cities/:id`

Partial update. Supply any subset of `name`, `phoneCode`, `timezone`, `website`, `isActive`. `stateId` is **not** patchable — to move a city to a different state, create a new one and soft-delete the old.

```bash
curl -X PATCH "http://localhost:3000/api/v1/cities/101" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "website": "https://portal.mcgm.gov.in" }'
```

**Response 200** — the updated row. **400** on empty body. **404** on unknown id.

---

## 2.5 `DELETE /api/v1/cities/:id`

Soft delete. Permission: `city.delete`.

```bash
curl -X DELETE "http://localhost:3000/api/v1/cities/101" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Response: `{ "success": true, "message": "City deleted", "data": { "id": 101, "deleted": true } }`.

---

## 2.6 `POST /api/v1/cities/:id/restore`

Reverse a soft delete. Permission: `city.restore`. Returns the full restored row.

```bash
curl -X POST "http://localhost:3000/api/v1/cities/101/restore" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**400 BAD_REQUEST** if the row isn't deleted.

---

**Common errors across all city routes**

| HTTP | code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing / expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No city with that id. |
| 409 | `DUPLICATE_ENTRY` | Another city already uses `(stateId, name)`. |
