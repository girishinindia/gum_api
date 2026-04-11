# Phase 2 — Learning Goals

Flat taxonomy of **student learning goals** — "Prepare for JEE", "Become a Full Stack Developer", "Learn a New Language". Each row is an ordered, flat entry (no joins) with an optional `iconUrl` that flows through a dedicated multipart upload endpoint — never through `POST`/`PATCH` on the main row.

All routes require auth. Permission codes: `learning_goal.read`, `learning_goal.create`, `learning_goal.update`, `learning_goal.delete`, `learning_goal.restore`. The icon upload/delete routes are gated by `learning_goal.update`.

← [10 specializations](10%20-%20specializations.md) · [06 walkthrough](06%20-%20walkthrough%20and%20index.md) · **Next →** [12 social-medias](12%20-%20social-medias.md)

---

## 11.1 `GET /api/v1/learning-goals`

List learning goals. Backed by `udf_get_learning_goals`.

**Query params**

| Param | Type | Notes |
|---|---|---|
| `pageIndex`, `pageSize` | int | Standard pagination. |
| `searchTerm` | string | `ILIKE` across `name` and `description`. |
| `isActive`, `isDeleted` | bool | |
| `sortColumn` | enum | `id`, `name`, `display_order`, `is_active`, `is_deleted`, `created_at`, `updated_at`. Default `id`. |
| `sortDirection` | enum | `ASC` / `DESC`. |

**Sample row**

```json
{
  "id": 5,
  "name": "Prepare for JEE",
  "description": "Joint Entrance Examination preparation for engineering aspirants.",
  "displayOrder": 10,
  "iconUrl": "https://cdn.growupmore.com/learning-goals/icons/5.webp",
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

**1. Ordered by display position**

```bash
curl "http://localhost:3000/api/v1/learning-goals?sortColumn=display_order&pageSize=50" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**2. Search**

```bash
curl "http://localhost:3000/api/v1/learning-goals?searchTerm=developer" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**3. Archived (soft-deleted)**

```bash
curl "http://localhost:3000/api/v1/learning-goals?isDeleted=true" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 11.2 `GET /api/v1/learning-goals/:id`

Read a single learning goal by id. **404** if unknown.

```bash
curl "http://localhost:3000/api/v1/learning-goals/5" -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 11.3 `POST /api/v1/learning-goals`

Create a learning goal. Permission: `learning_goal.create`.

```bash
curl -X POST "http://localhost:3000/api/v1/learning-goals" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Become a Full Stack Developer",
    "description": "End-to-end web development: frontend, backend, and infra.",
    "displayOrder": 20,
    "isActive": true
  }'
```

`name` is required (≤ 100 chars, CITEXT-unique). **`iconUrl` is deliberately not accepted here** — a freshly created row has `iconUrl: null` and can only be set via [§11.7](#117-post-apiv1learning-goalsidicon).

**Possible errors**

- **400 VALIDATION_ERROR** — missing `name`, or `name`/`description` over the length cap.
- **403** — caller lacks `learning_goal.create`.
- **409** — a learning goal with the same `name` already exists (CITEXT, case-insensitive).

---

## 11.4 `PATCH /api/v1/learning-goals/:id`

Partial update. Any subset of `name`, `description`, `displayOrder`, `isActive`. **400** on empty body. `iconUrl` is excluded here — use [§11.7](#117-post-apiv1learning-goalsidicon) / [§11.8](#118-delete-apiv1learning-goalsidicon).

```bash
curl -X PATCH "http://localhost:3000/api/v1/learning-goals/5" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "displayOrder": 5 }'
```

---

## 11.5 `DELETE /api/v1/learning-goals/:id`

Soft delete. Permission: `learning_goal.delete`.

```bash
curl -X DELETE "http://localhost:3000/api/v1/learning-goals/5" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 11.6 `POST /api/v1/learning-goals/:id/restore`

Reverse a soft delete. Permission: `learning_goal.restore`. **400 BAD_REQUEST** if the row isn't deleted.

```bash
curl -X POST "http://localhost:3000/api/v1/learning-goals/5/restore" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 11.7 `POST /api/v1/learning-goals/:id/icon`

Upload (or replace) the learning-goal icon. Permission: `learning_goal.update`. The body is `multipart/form-data` with a single `file` field.

```bash
curl -X POST "http://localhost:3000/api/v1/learning-goals/5/icon" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@./jee.png"
```

### Contract

| Step | Enforcement |
|---|---|
| Accepted MIME types | `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml` |
| Raw upload cap | **100 KB** (multer, hard reject before `sharp` runs) |
| Output format | **Always WebP**, regardless of input MIME |
| Resize | Fits inside a **256 × 256** box (no enlargement) |
| Final byte cap | **≤ 100 KB** — `sharp` runs a quality-reduction loop (80 → 40 step 10) until the WebP fits |
| Storage key | Deterministic: `learning-goals/icons/<id>.webp` — re-uploads clobber the same object so CDN URLs stay stable |
| On replace | The previous Bunny object is deleted **before** the new PUT, so there are no orphans. Delete failures are logged at WARN and do not block the new upload. |

**Response 200** — the refreshed learning-goal row with `iconUrl` pointing at the freshly-written CDN URL.

### Errors

| HTTP | code | Cause |
|---|---|---|
| **400** | `BAD_REQUEST` | Raw upload > 100 KB, MIME not in allowlist, bytes can't be decoded, or the re-encoded WebP still exceeds 100 KB at quality 40. |
| **404** | `NOT_FOUND` | No learning goal with that id. |
| **400** | `BAD_REQUEST` | The learning goal exists but is soft-deleted — restore it first. |

---

## 11.8 `DELETE /api/v1/learning-goals/:id/icon`

Clear the icon. Permission: `learning_goal.update`.

```bash
curl -X DELETE "http://localhost:3000/api/v1/learning-goals/5/icon" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

The server best-effort deletes the current Bunny object, then sets `icon_url = NULL`. Delete failures against Bunny are logged at WARN and do not block the column clear.

**Response 200** — the refreshed learning-goal row with `iconUrl: null`.

---

**Common errors across all learning-goal routes**

| HTTP | code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing / expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No learning goal with that id. |
| 409 | `DUPLICATE_ENTRY` | A learning goal with the same `name` already exists. |
