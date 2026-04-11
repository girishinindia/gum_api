# Phase 2 — Specializations

Flat taxonomy of the **subjects an instructor can specialise in** — "Python", "Calculus", "Graphic Design". Each specialization lives in a fixed `category` enum and carries an optional `iconUrl`. The icon is never set via `POST`/`PATCH`: it flows through a dedicated multipart upload endpoint that converts every input to WebP, caps the output at 100 KB, and writes to Bunny CDN under a deterministic key.

All routes require auth. Permission codes: `specialization.read`, `specialization.create`, `specialization.update`, `specialization.delete`, `specialization.restore`. The icon upload/delete routes are gated by `specialization.update`.

← [09 designations](09%20-%20designations.md) · [06 walkthrough](06%20-%20walkthrough%20and%20index.md) · **Next →** [11 learning-goals](11%20-%20learning-goals.md)

---

## 10.1 `GET /api/v1/specializations`

List specializations. Backed by `udf_get_specializations`.

**Query params**

| Param | Type | Notes |
|---|---|---|
| `pageIndex`, `pageSize` | int | Standard pagination. |
| `searchTerm` | string | `ILIKE` across `name` and `description`. |
| `isActive`, `isDeleted` | bool | |
| `category` | enum | One of `technology`, `data`, `design`, `business`, `language`, `science`, `mathematics`, `arts`, `health`, `exam_prep`, `professional`, `other`. |
| `sortColumn` | enum | `id`, `name`, `category`, `is_active`, `is_deleted`, `created_at`, `updated_at`. Default `id`. |
| `sortDirection` | enum | `ASC` / `DESC`. |

**Sample row**

```json
{
  "id": 12,
  "name": "Python",
  "category": "technology",
  "description": "General-purpose language popular for scripting, data, and backend.",
  "iconUrl": "https://cdn.growupmore.com/specializations/icons/12.webp",
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

**1. All technology specializations**

```bash
curl "http://localhost:3000/api/v1/specializations?category=technology&pageSize=50" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**2. Search across name + description**

```bash
curl "http://localhost:3000/api/v1/specializations?searchTerm=machine" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**3. Archived (soft-deleted)**

```bash
curl "http://localhost:3000/api/v1/specializations?isDeleted=true" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 10.2 `GET /api/v1/specializations/:id`

Read a single specialization by id. **404** with `"Specialization 9999 not found"` if unknown.

```bash
curl "http://localhost:3000/api/v1/specializations/12" -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 10.3 `POST /api/v1/specializations`

Create a specialization. Permission: `specialization.create`.

```bash
curl -X POST "http://localhost:3000/api/v1/specializations" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Rust",
    "category": "technology",
    "description": "Memory-safe systems language.",
    "isActive": true
  }'
```

`name` is required; `category` defaults to `technology`. **`iconUrl` is deliberately not accepted here** — it is always `null` on a freshly-created row and can only be set via [§10.7](#107-post-apiv1specializationsidicon).

**Possible errors**

- **400 VALIDATION_ERROR** — missing `name`, `category` not in the enum.
- **403** — caller lacks `specialization.create`.
- **409** — a specialization with the same `name` already exists (CITEXT, case-insensitive).

---

## 10.4 `PATCH /api/v1/specializations/:id`

Partial update. Any subset of `name`, `category`, `description`, `isActive`. **400** on empty body. `iconUrl` is also excluded here — use [§10.7](#107-post-apiv1specializationsidicon) / [§10.8](#108-delete-apiv1specializationsidicon).

```bash
curl -X PATCH "http://localhost:3000/api/v1/specializations/12" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "description": "Updated description." }'
```

---

## 10.5 `DELETE /api/v1/specializations/:id`

Soft delete. Permission: `specialization.delete`.

```bash
curl -X DELETE "http://localhost:3000/api/v1/specializations/12" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 10.6 `POST /api/v1/specializations/:id/restore`

Reverse a soft delete. Permission: `specialization.restore`. **400 BAD_REQUEST** if the row isn't deleted.

```bash
curl -X POST "http://localhost:3000/api/v1/specializations/12/restore" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 10.7 `POST /api/v1/specializations/:id/icon`

Upload (or replace) the specialization icon. Permission: `specialization.update`. The body is `multipart/form-data` with a single `file` field.

```bash
curl -X POST "http://localhost:3000/api/v1/specializations/12/icon" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@./python.png"
```

### Contract

| Step | Enforcement |
|---|---|
| Accepted MIME types | `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml` |
| Raw upload cap | **100 KB** (multer, hard reject before `sharp` runs) |
| Output format | **Always WebP**, regardless of input MIME |
| Resize | Fits inside a **256 × 256** box (no enlargement) |
| Final byte cap | **≤ 100 KB** — `sharp` runs a quality-reduction loop (80 → 40 step 10) until the WebP fits |
| Storage key | Deterministic: `specializations/icons/<id>.webp` — re-uploads clobber the same object so CDN URLs stay stable |
| On replace | The previous Bunny object (both the deterministic key and anything currently stored in `iconUrl`) is deleted **before** the new PUT, so there are no orphans. Delete failures are logged at WARN and do not block the new upload. |

**Response 200** — the refreshed specialization row, with `iconUrl` pointing at the freshly-written CDN URL. The service writes `icon_url` via a dedicated internal setter (the `udf_specializations_update` signature does **not** carry `icon_url`, so there is a single code path that can mutate this column).

### Errors

| HTTP | code | Cause |
|---|---|---|
| **400** | `BAD_REQUEST` | Raw upload > 100 KB (multer reject), or MIME type not in the allowlist, or the bytes can't be decoded as an image, or the re-encoded WebP still exceeds 100 KB at quality 40. |
| **404** | `NOT_FOUND` | No specialization with that id. |
| **400** | `BAD_REQUEST` | The specialization exists but is soft-deleted — restore it first. |

---

## 10.8 `DELETE /api/v1/specializations/:id/icon`

Clear the icon. Permission: `specialization.update`.

```bash
curl -X DELETE "http://localhost:3000/api/v1/specializations/12/icon" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

The server best-effort deletes the current Bunny object, then sets `icon_url = NULL`. Delete failures against Bunny are logged at WARN and do not block the column clear.

**Response 200** — the refreshed specialization row with `iconUrl: null`.

---

**Common errors across all specialization routes**

| HTTP | code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing / expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No specialization with that id. |
| 409 | `DUPLICATE_ENTRY` | A specialization with the same `name` already exists. |
