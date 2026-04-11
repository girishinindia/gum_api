# Phase 2 — Education Levels

Ordered taxonomy of education stages — pre-school → school → diploma → undergrad → postgrad → doctoral → professional → informal → other. Used by user profiles, course catalogues, and job postings that need to reason about "what stage is this for?".

The DB stores a **`level_order`** integer that gives a total order across every category so consumers can sort comfortably without special-casing the category enum. The URL is kebab-case (`/education-levels`) but the permission code is **snake_case** (`education_level`) to match the DB table name.

All routes require auth. Permission codes: `education_level.read`, `education_level.create`, `education_level.update`, `education_level.delete`, `education_level.restore`.

← [04 languages](04%20-%20languages.md) · **Next →** [06 walkthrough and index](06%20-%20walkthrough%20and%20index.md)

---

## 5.1 `GET /api/v1/education-levels`

List education levels. Backed by `udf_get_education_levels`.

**Query params**

| Param | Type | Notes |
|---|---|---|
| `pageIndex`, `pageSize` | int | Standard pagination. |
| `searchTerm` | string | `ILIKE` against `name`, `abbreviation`, `description`. |
| `isActive`, `isDeleted` | bool | |
| `category` | enum | One of `pre_school`, `school`, `diploma`, `undergraduate`, `postgraduate`, `doctoral`, `professional`, `informal`, `other`. |
| `sortColumn` | enum | `id`, `name`, `level_order`, `level_category`, `is_active`, `is_deleted`, `created_at`, `updated_at`. **Default `level_order`** — because "natural order" is what UIs almost always want. |
| `sortDirection` | enum | `ASC` / `DESC`. |

**Sample row**

```json
{
  "id": 6,
  "name": "Bachelor's Degree",
  "levelOrder": 60,
  "levelCategory": "undergraduate",
  "abbreviation": "BA/BSc",
  "description": "Three- to four-year undergraduate programme.",
  "typicalDuration": "3–4 years",
  "typicalAgeRange": "18–22",
  "isActive": true,
  "isDeleted": false,
  "createdAt": "2026-01-14T00:00:00.000Z",
  "updatedAt": "2026-01-14T00:00:00.000Z",
  "deletedAt": null
}
```

### Defaults

```
pageIndex=1  pageSize=20  sortColumn=level_order  sortDirection=ASC
```

This returns the entire ladder from pre-school up to doctoral in the order a UI would render it.

### Sample queries

**1. The whole ladder, in order**

```bash
curl "http://localhost:3000/api/v1/education-levels?pageSize=100" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**2. Only undergraduate and postgraduate levels**

```bash
curl "http://localhost:3000/api/v1/education-levels?category=undergraduate" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

curl "http://localhost:3000/api/v1/education-levels?category=postgraduate" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

(There is no OR across categories in a single call — run one request per category and merge client-side.)

**3. Search by abbreviation**

```bash
curl "http://localhost:3000/api/v1/education-levels?searchTerm=bsc" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**4. Sort alphabetically by name**

```bash
curl "http://localhost:3000/api/v1/education-levels?sortColumn=name&sortDirection=ASC" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**5. Archived (soft-deleted) levels**

```bash
curl "http://localhost:3000/api/v1/education-levels?isDeleted=true" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 5.2 `GET /api/v1/education-levels/:id`

Read a single education level by id. **404** with `"Education level 9999 not found"` if unknown.

```bash
curl "http://localhost:3000/api/v1/education-levels/6" -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 5.3 `POST /api/v1/education-levels`

Create an education level. Permission: `education_level.create`.

```bash
curl -X POST "http://localhost:3000/api/v1/education-levels" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bachelor'\''s Degree",
    "levelOrder": 60,
    "levelCategory": "undergraduate",
    "abbreviation": "BA/BSc",
    "description": "Three- to four-year undergraduate programme.",
    "typicalDuration": "3–4 years",
    "typicalAgeRange": "18–22",
    "isActive": true
  }'
```

`name` and `levelOrder` are required (the DB column is `NOT NULL`). `levelCategory` defaults to `other` if omitted. **Response 201** — the full new row.

**Possible errors**

- **400** — missing `name`, missing `levelOrder`, `levelOrder` not an integer, `levelCategory` not in the enum.
- **403** — caller lacks `education_level.create`.
- **409** — a level with the same `name` or the same `levelOrder` already exists.

---

## 5.4 `PATCH /api/v1/education-levels/:id`

Partial update. Any subset of `name`, `levelOrder`, `levelCategory`, `abbreviation`, `description`, `typicalDuration`, `typicalAgeRange`, `isActive`. **400** on empty body.

```bash
curl -X PATCH "http://localhost:3000/api/v1/education-levels/6" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "typicalDuration": "3 years" }'
```

---

## 5.5 `DELETE /api/v1/education-levels/:id`

Soft delete. Permission: `education_level.delete`.

```bash
curl -X DELETE "http://localhost:3000/api/v1/education-levels/6" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Response: `{ "success": true, "message": "Education level deleted", "data": { "id": 6, "deleted": true } }`.

---

## 5.6 `POST /api/v1/education-levels/:id/restore`

Reverse a soft delete. Permission: `education_level.restore`. **400 BAD_REQUEST** if the row isn't deleted.

```bash
curl -X POST "http://localhost:3000/api/v1/education-levels/6/restore" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

**Common errors across all education-level routes**

| HTTP | code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing / expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No education level with that id. |
| 409 | `DUPLICATE_ENTRY` | Another level already uses that `name` or `levelOrder`. |
