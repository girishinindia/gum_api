# Phase 2 — Social Medias

Reference catalogue of **social / professional platforms** users can attach to their profile — Twitter, LinkedIn, GitHub, YouTube, WhatsApp, a personal website, etc. Each row carries a machine `code`, a `platformType` bucket, and an optional `baseUrl` and `placeholder` used by the profile editor UI. The optional `iconUrl` is set exclusively via a dedicated multipart upload endpoint.

All routes require auth. Permission codes: `social_media.read`, `social_media.create`, `social_media.update`, `social_media.delete`, `social_media.restore`. The icon upload/delete routes are gated by `social_media.update`.

← [11 learning-goals](11%20-%20learning-goals.md) · [06 walkthrough](06%20-%20walkthrough%20and%20index.md) · **Next →** [13 categories](13%20-%20categories.md)

---

## 12.1 `GET /api/v1/social-medias`

List platforms. Backed by `udf_get_social_medias`.

**Query params**

| Param | Type | Notes |
|---|---|---|
| `pageIndex`, `pageSize` | int | Standard pagination. |
| `searchTerm` | string | `ILIKE` across `name`, `code`, `base_url`. |
| `isActive`, `isDeleted` | bool | |
| `platformType` | enum | One of `social`, `professional`, `code`, `video`, `blog`, `portfolio`, `messaging`, `website`, `other`. |
| `sortColumn` | enum | `id`, `name`, `code`, `platform_type`, `display_order`, `is_active`, `is_deleted`, `created_at`, `updated_at`. Default `id`. |
| `sortDirection` | enum | `ASC` / `DESC`. |

**Sample row**

```json
{
  "id": 3,
  "name": "LinkedIn",
  "code": "linkedin",
  "baseUrl": "https://www.linkedin.com/in/",
  "placeholder": "your-handle",
  "platformType": "professional",
  "displayOrder": 10,
  "iconUrl": "https://cdn.growupmore.com/social-medias/icons/3.webp",
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

**1. All professional platforms**

```bash
curl "http://localhost:3000/api/v1/social-medias?platformType=professional&pageSize=50" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**2. Search by name or code**

```bash
curl "http://localhost:3000/api/v1/social-medias?searchTerm=github" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**3. Ordered by display position**

```bash
curl "http://localhost:3000/api/v1/social-medias?sortColumn=display_order&pageSize=50" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 12.2 `GET /api/v1/social-medias/:id`

Read a single platform by id. **404** if unknown.

```bash
curl "http://localhost:3000/api/v1/social-medias/3" -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 12.3 `POST /api/v1/social-medias`

Create a platform. Permission: `social_media.create`.

```bash
curl -X POST "http://localhost:3000/api/v1/social-medias" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GitHub",
    "code": "github",
    "baseUrl": "https://github.com/",
    "placeholder": "username",
    "platformType": "code",
    "displayOrder": 20,
    "isActive": true
  }'
```

`name` (≤ 100) and `code` (≤ 50) are required; both are CITEXT so uniqueness is case-insensitive. `platformType` defaults to `social`. **`iconUrl` is deliberately not accepted here** — use [§12.7](#127-post-apiv1social-mediasidicon) after the row exists.

**Possible errors**

- **400 VALIDATION_ERROR** — missing `name` or `code`, or `platformType` not in the enum.
- **403** — caller lacks `social_media.create`.
- **409** — a platform with the same `name` or `code` already exists.

---

## 12.4 `PATCH /api/v1/social-medias/:id`

Partial update. Any subset of `name`, `code`, `baseUrl`, `placeholder`, `platformType`, `displayOrder`, `isActive`. **400** on empty body. `iconUrl` is excluded — use [§12.7](#127-post-apiv1social-mediasidicon) / [§12.8](#128-delete-apiv1social-mediasidicon).

```bash
curl -X PATCH "http://localhost:3000/api/v1/social-medias/3" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "baseUrl": "https://linkedin.com/in/" }'
```

---

## 12.5 `DELETE /api/v1/social-medias/:id`

Soft delete. Permission: `social_media.delete`.

```bash
curl -X DELETE "http://localhost:3000/api/v1/social-medias/3" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 12.6 `POST /api/v1/social-medias/:id/restore`

Reverse a soft delete. Permission: `social_media.restore`. **400 BAD_REQUEST** if the row isn't deleted.

```bash
curl -X POST "http://localhost:3000/api/v1/social-medias/3/restore" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 12.7 `POST /api/v1/social-medias/:id/icon`

Upload (or replace) the platform icon. Permission: `social_media.update`. Body is `multipart/form-data` with a single `file` field.

```bash
curl -X POST "http://localhost:3000/api/v1/social-medias/3/icon" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@./linkedin.png"
```

### Contract

| Step | Enforcement |
|---|---|
| Accepted MIME types | `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml` |
| Raw upload cap | **100 KB** (multer) |
| Output format | **Always WebP** |
| Resize | Fits inside a **256 × 256** box |
| Final byte cap | **≤ 100 KB** (sharp quality loop 80 → 40 step 10) |
| Storage key | `social-medias/icons/<id>.webp` — deterministic, CDN URLs stay stable |
| On replace | Previous Bunny object deleted **before** new PUT. Delete failures logged at WARN, do not block the new upload. |

**Response 200** — the refreshed platform row with `iconUrl` pointing at the freshly-written CDN URL.

### Errors

| HTTP | code | Cause |
|---|---|---|
| **400** | `BAD_REQUEST` | Raw upload > 100 KB, MIME not in allowlist, bytes can't be decoded, or re-encoded WebP still exceeds 100 KB at quality 40. |
| **404** | `NOT_FOUND` | No platform with that id. |
| **400** | `BAD_REQUEST` | The platform exists but is soft-deleted. |

---

## 12.8 `DELETE /api/v1/social-medias/:id/icon`

Clear the icon. Permission: `social_media.update`.

```bash
curl -X DELETE "http://localhost:3000/api/v1/social-medias/3/icon" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Server best-effort deletes the current Bunny object, then sets `icon_url = NULL`.

**Response 200** — the refreshed platform row with `iconUrl: null`.

---

**Common errors across all social-media routes**

| HTTP | code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing / expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No platform with that id. |
| 409 | `DUPLICATE_ENTRY` | A platform with the same `name` or `code` already exists. |
