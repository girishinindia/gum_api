# Phase 2 — Designations

Flat taxonomy of the **job titles / ranks** instructors and staff can hold — "Senior Lecturer", "Department Head", "Founder". Every designation carries a `level` (integer 0–10) plus a `levelBand` from a fixed enum, so the UI can group roles without parsing title strings.

All routes require auth. Permission codes: `designation.read`, `designation.create`, `designation.update`, `designation.delete`, `designation.restore`.

← [08 documents](08%20-%20documents.md) · **Next →** [10 specializations](10%20-%20specializations.md)

---

## 9.1 `GET /api/v1/designations`

List designations. Backed by `udf_get_designations`.

**Query params**

| Param | Type | Notes |
|---|---|---|
| `pageIndex`, `pageSize` | int | Standard pagination. |
| `searchTerm` | string | `ILIKE` across `name`, `code`, and `description`. |
| `isActive`, `isDeleted` | bool | |
| `levelBand` | enum | One of `intern`, `entry`, `mid`, `senior`, `lead`, `manager`, `director`, `executive`. |
| `sortColumn` | enum | `id`, `name`, `code`, `level`, `level_band`, `is_active`, `is_deleted`, `created_at`, `updated_at`. Default `level`. |
| `sortDirection` | enum | `ASC` / `DESC`. |

**Sample row**

```json
{
  "id": 7,
  "name": "Senior Lecturer",
  "code": "sr_lect",
  "level": 5,
  "levelBand": "senior",
  "description": "Experienced instructor; leads curriculum for a given track.",
  "isActive": true,
  "isDeleted": false,
  "createdAt": "2026-01-10T00:00:00.000Z",
  "updatedAt": "2026-01-10T00:00:00.000Z",
  "deletedAt": null
}
```

### Defaults

```
pageIndex=1  pageSize=20  sortColumn=level  sortDirection=ASC
```

### Sample queries

**1. The senior band, alphabetised**

```bash
curl "http://localhost:3000/api/v1/designations?levelBand=senior&sortColumn=name" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**2. Everything, sorted by rank**

```bash
curl "http://localhost:3000/api/v1/designations?sortColumn=level&sortDirection=ASC" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**3. Search by title or code**

```bash
curl "http://localhost:3000/api/v1/designations?searchTerm=lecturer" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 9.2 `GET /api/v1/designations/:id`

Read a single designation by id. **404** with `"Designation 9999 not found"` if unknown.

```bash
curl "http://localhost:3000/api/v1/designations/7" -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 9.3 `POST /api/v1/designations`

Create a designation. Permission: `designation.create`.

```bash
curl -X POST "http://localhost:3000/api/v1/designations" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Principal Engineer",
    "code": "prn_eng",
    "level": 7,
    "levelBand": "lead",
    "description": "Technical leader across multiple teams.",
    "isActive": true
  }'
```

`name` is required; `code` ≤ 32 chars, `level` defaults to `1`, `levelBand` defaults to `entry`. **Response 201** — the full new row.

**Possible errors**

- **400 VALIDATION_ERROR** — missing `name`, `levelBand` not in the enum, `level` out of `[0, 10]`, `code` too long.
- **403** — caller lacks `designation.create`.
- **409** — a designation with the same `name` **or** `code` already exists (CITEXT, case-insensitive).

---

## 9.4 `PATCH /api/v1/designations/:id`

Partial update. Any subset of `name`, `code`, `level`, `levelBand`, `description`, `isActive`. **400** on empty body.

```bash
curl -X PATCH "http://localhost:3000/api/v1/designations/7" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "level": 6, "levelBand": "senior" }'
```

---

## 9.5 `DELETE /api/v1/designations/:id`

Soft delete. Permission: `designation.delete`.

```bash
curl -X DELETE "http://localhost:3000/api/v1/designations/7" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 9.6 `POST /api/v1/designations/:id/restore`

Reverse a soft delete. Permission: `designation.restore`. **400 BAD_REQUEST** if the row isn't deleted.

```bash
curl -X POST "http://localhost:3000/api/v1/designations/7/restore" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

**Common errors across all designation routes**

| HTTP | code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing / expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No designation with that id. |
| 409 | `DUPLICATE_ENTRY` | A designation with the same `name` or `code` already exists. |
