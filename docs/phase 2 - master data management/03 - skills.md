# Phase 2 — Skills

Flat taxonomy of skills that users, roles, courses, and jobs can reference. Each skill has a **category** from a fixed enum enforced both by the DB `CHECK` constraint and by the Zod schema — the two lists are kept in sync by hand.

All routes require auth. Permission codes: `skill.read`, `skill.create`, `skill.update`, `skill.delete`, `skill.restore`.

← [02 cities](02%20-%20cities.md) · **Next →** [04 languages](04%20-%20languages.md)

---

## 3.1 `GET /api/v1/skills`

List skills. Backed by `udf_get_skills`.

**Query params**

| Param | Type | Notes |
|---|---|---|
| `pageIndex`, `pageSize` | int | Standard pagination. |
| `searchTerm` | string | `ILIKE` against `skill_name` and `skill_description`. |
| `isActive`, `isDeleted` | bool | |
| `category` | enum | One of `technical`, `soft_skill`, `tool`, `framework`, `language`, `domain`, `certification`, `other`. |
| `sortColumn` | enum | `id`, `name`, `category`, `is_active`, `is_deleted`, `created_at`, `updated_at`. Default `id`. |
| `sortDirection` | enum | `ASC` / `DESC`. |

**Sample row**

```json
{
  "id": 14,
  "name": "TypeScript",
  "category": "language",
  "description": "Typed superset of JavaScript that compiles to plain JS.",
  "iconUrl": null,
  "isActive": true,
  "isDeleted": false,
  "createdAt": "2026-01-10T00:00:00.000Z",
  "updatedAt": "2026-01-10T00:00:00.000Z",
  "deletedAt": null
}
```

### Defaults

```
pageIndex=1  pageSize=20  sortColumn=id  sortDirection=ASC
```

### Sample queries

**1. All technical skills**

```bash
curl "http://localhost:3000/api/v1/skills?category=technical&pageSize=50" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**2. All soft skills, sorted by name**

```bash
curl "http://localhost:3000/api/v1/skills?category=soft_skill&sortColumn=name&sortDirection=ASC" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**3. Search across name and description**

```bash
curl "http://localhost:3000/api/v1/skills?searchTerm=type" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**4. Only active skills**

```bash
curl "http://localhost:3000/api/v1/skills?isActive=true" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**5. Archived (soft-deleted) skills**

```bash
curl "http://localhost:3000/api/v1/skills?isDeleted=true" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 3.2 `GET /api/v1/skills/:id`

Read a single skill by id. **404** with `"Skill 9999 not found"` if unknown.

```bash
curl "http://localhost:3000/api/v1/skills/14" -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 3.3 `POST /api/v1/skills`

Create a skill. Permission: `skill.create`.

```bash
curl -X POST "http://localhost:3000/api/v1/skills" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "TypeScript",
    "category": "language",
    "description": "Typed superset of JavaScript that compiles to plain JS.",
    "isActive": true
  }'
```

`name` is required; `category` defaults to `other` if omitted. **Response 201** — the full new row.

**Possible errors**

- **400** — missing `name`, `category` not in the enum (`"Invalid enum value"`).
- **403** — caller lacks `skill.create`.
- **409** — a skill with the same `name` already exists.

---

## 3.4 `PATCH /api/v1/skills/:id`

Partial update. Any subset of `name`, `category`, `description`, `iconUrl`, `isActive`. **400** on empty body.

```bash
curl -X PATCH "http://localhost:3000/api/v1/skills/14" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "description": "Microsoft'\''s typed flavour of JavaScript." }'
```

---

## 3.5 `DELETE /api/v1/skills/:id`

Soft delete. Permission: `skill.delete`.

```bash
curl -X DELETE "http://localhost:3000/api/v1/skills/14" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Response: `{ "success": true, "message": "Skill deleted", "data": { "id": 14, "deleted": true } }`.

---

## 3.6 `POST /api/v1/skills/:id/restore`

Reverse a soft delete. Permission: `skill.restore`. **400 BAD_REQUEST** if the row isn't deleted.

```bash
curl -X POST "http://localhost:3000/api/v1/skills/14/restore" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

**Common errors across all skill routes**

| HTTP | code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing / expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No skill with that id. |
| 409 | `DUPLICATE_ENTRY` | A skill with the same `name` already exists. |
