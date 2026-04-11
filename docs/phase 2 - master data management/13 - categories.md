# Phase 2 — Categories

Top-level **content categories** that group sub-categories, courses, and downstream learning assets. Categories carry a stable machine `code`, a `slug`, optional `iconUrl` + `imageUrl`, an `is_new`/`new_until` highlight flag, and a full per-language translation table covering name, description, and a rich SEO block (meta tags, Open Graph, Twitter Card, JSON-LD, canonical URL, robots directive).

Categories support **combined insert** — you can ship the parent row and its first translation together in a single `POST`, which the UDF commits atomically and returns both ids on. Further translations are added via the translation sub-resource.

All routes require auth. Permission codes: `category.read`, `category.create`, `category.update`, `category.delete`, `category.restore`. The icon, image, and translation sub-resource routes are gated by `category.update`.

← [12 social-medias](12%20-%20social-medias.md) · [06 walkthrough](06%20-%20walkthrough%20and%20index.md) · **Next →** [14 sub-categories](14%20-%20sub-categories.md)

---

## 13.1 `GET /api/v1/categories`

List categories. Backed by `udf_get_categories`.

**Query params**

| Param | Type | Notes |
|---|---|---|
| `pageIndex`, `pageSize` | int | Standard pagination. |
| `searchTerm` | string | `ILIKE` across `code` and `slug`. |
| `isActive`, `isDeleted`, `isNew` | bool | |
| `sortColumn` | enum | `id`, `code`, `slug`, `display_order`, `is_active`, `is_deleted`, `created_at`, `updated_at`. Default `display_order`. |
| `sortDirection` | enum | `ASC` / `DESC`. Default `ASC`. |

**Sample row**

```json
{
  "id": 7,
  "code": "PROG",
  "slug": "programming",
  "displayOrder": 10,
  "iconUrl": "https://cdn.growupmore.com/categories/icons/7.webp",
  "imageUrl": "https://cdn.growupmore.com/categories/images/7.webp",
  "isNew": false,
  "newUntil": null,
  "isActive": true,
  "isDeleted": false,
  "createdAt": "2026-01-10T00:00:00.000Z",
  "updatedAt": "2026-01-10T00:00:00.000Z",
  "deletedAt": null
}
```

### Defaults

```
pageIndex=1  pageSize=20  sortColumn=display_order  sortDirection=ASC
```

---

## 13.2 `GET /api/v1/categories/:id`

Read a single category by id. **404** if unknown.

```bash
curl "http://localhost:3000/api/v1/categories/7" -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 13.3 `POST /api/v1/categories`

Create a category. Permission: `category.create`. You may include an optional `translation` block in the same request — `udf_categories_insert` writes the parent row and the first translation atomically and returns both ids.

```bash
curl -X POST "http://localhost:3000/api/v1/categories" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "PROG",
    "slug": "programming",
    "displayOrder": 10,
    "isNew": true,
    "newUntil": "2026-12-31",
    "isActive": true,
    "translation": {
      "languageId": 1,
      "name": "Programming",
      "description": "Software engineering, algorithms, and development practices.",
      "metaTitle": "Programming courses",
      "metaDescription": "Learn to build software: JavaScript, Python, systems, and more.",
      "metaKeywords": "programming, coding, software",
      "canonicalUrl": "https://growupmore.com/programming",
      "ogTitle": "Programming at Grow Up More",
      "ogDescription": "Hands-on programming tracks from beginner to advanced.",
      "ogType": "website",
      "twitterCard": "summary_large_image",
      "robotsDirective": "index,follow"
    }
  }'
```

`code` is required (≤ 100 chars, CITEXT-unique). `slug` is optional (auto-derived from code if omitted). Inside the `translation` block only `languageId` and `name` are required; everything else is optional. **`iconUrl` and `imageUrl` are deliberately not accepted here** — a freshly-created row has both `null`, and they can only be set via [§13.7](#137-post-apiv1categoriesidicon) / [§13.9](#139-post-apiv1categoriesidimage).

**Response 201** — the new category row. The companion translation id is recorded inside the service but the response returns the canonical category DTO; fetch it via the translation sub-resource if you need the translation shape.

**Possible errors**

- **400 VALIDATION_ERROR** — missing `code`, translation missing `languageId`/`name`, string over cap, etc.
- **403** — caller lacks `category.create`.
- **409** — duplicate `code` or `slug` (CITEXT, case-insensitive).

---

## 13.4 `PATCH /api/v1/categories/:id`

Partial update of the parent row. Any subset of `code`, `slug`, `displayOrder`, `isNew`, `newUntil`, `isActive`. **400** on empty body. Translations are edited via [§13.14](#1314-patch-apiv1categoriesidtranslationstid), not here. `iconUrl` / `imageUrl` are excluded here too.

```bash
curl -X PATCH "http://localhost:3000/api/v1/categories/7" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "displayOrder": 5, "isNew": false }'
```

---

## 13.5 `DELETE /api/v1/categories/:id`

Soft delete. Permission: `category.delete`. Translations are **not** cascaded — they remain in place and surface again when the parent is restored.

```bash
curl -X DELETE "http://localhost:3000/api/v1/categories/7" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 13.6 `POST /api/v1/categories/:id/restore`

Reverse a soft delete. Permission: `category.restore`. **400 BAD_REQUEST** if the row isn't deleted.

```bash
curl -X POST "http://localhost:3000/api/v1/categories/7/restore" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 13.7 `POST /api/v1/categories/:id/icon`

Upload (or replace) the category icon. Permission: `category.update`. Body is `multipart/form-data` with a single `file` field.

```bash
curl -X POST "http://localhost:3000/api/v1/categories/7/icon" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@./programming.png"
```

### Icon contract

| Step | Enforcement |
|---|---|
| Accepted MIME types | `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml` |
| Raw upload cap | **100 KB** (multer) |
| Output format | **Always WebP** |
| Resize | Fits inside a **256 × 256** box |
| Final byte cap | **≤ 100 KB** (sharp quality loop 80 → 40 step 10) |
| Storage key | `categories/icons/<id>.webp` — deterministic, CDN URLs stay stable |
| On replace | Previous Bunny object deleted **before** new PUT. Delete failures logged at WARN, do not block the new upload. |

**Response 200** — the refreshed category row with `iconUrl` pointing at the freshly-written CDN URL.

---

## 13.8 `DELETE /api/v1/categories/:id/icon`

Clear the icon. Permission: `category.update`. Best-effort deletes the Bunny object, then sets `icon_url = NULL`.

```bash
curl -X DELETE "http://localhost:3000/api/v1/categories/7/icon" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 13.9 `POST /api/v1/categories/:id/image`

Upload (or replace) the larger hero image. Permission: `category.update`. Separate column, separate storage key — the image does not share state with the icon.

```bash
curl -X POST "http://localhost:3000/api/v1/categories/7/image" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@./programming-hero.jpg"
```

### Image contract

| Step | Enforcement |
|---|---|
| Accepted MIME types | `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml` |
| Raw upload cap | **100 KB** (multer) |
| Output format | **Always WebP** |
| Resize | Fits inside a **1024 × 1024** box (no enlargement) |
| Final byte cap | **≤ 100 KB** (sharp quality loop 80 → 40 step 10) |
| Storage key | `categories/images/<id>.webp` — deterministic |
| On replace | Previous Bunny image object deleted **before** new PUT. Delete failures logged at WARN, do not block the new upload. The icon is untouched. |

**Response 200** — the refreshed category row with `imageUrl` populated.

---

## 13.10 `DELETE /api/v1/categories/:id/image`

Clear the image. Permission: `category.update`.

```bash
curl -X DELETE "http://localhost:3000/api/v1/categories/7/image" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 13.11 `GET /api/v1/categories/:id/translations`

List all translation rows for a single category. Permission: `category.read`.

**Query params**

| Param | Type | Notes |
|---|---|---|
| `pageIndex`, `pageSize` | int | Standard pagination. |
| `searchTerm` | string | `ILIKE` across `name`, `description`, `meta_title`. |
| `isActive`, `isDeleted` | bool | Applies to the translation row itself. |
| `languageId` | int | Filter to a single language (coerced from the query string). |
| `sortColumn` | enum | `id`, `name`, `language_id`, `category_id`, `created_at`. Default `created_at`. |
| `sortDirection` | enum | `ASC` / `DESC`. Default `DESC`. |

```bash
curl "http://localhost:3000/api/v1/categories/7/translations?languageId=1" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 13.12 `GET /api/v1/categories/:id/translations/:tid`

Read a single translation row by id. **404** if unknown. The URL `id` is informational — the lookup is keyed by `tid`.

```bash
curl "http://localhost:3000/api/v1/categories/7/translations/14" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 13.13 `POST /api/v1/categories/:id/translations`

Add a new translation row to an existing category. Permission: `category.update`. Useful for adding a second / third language after the parent was created with only an English translation (or none).

```bash
curl -X POST "http://localhost:3000/api/v1/categories/7/translations" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "languageId": 2,
    "name": "Programación",
    "description": "Ingeniería de software, algoritmos y prácticas de desarrollo.",
    "metaTitle": "Cursos de programación",
    "ogType": "website",
    "twitterCard": "summary_large_image"
  }'
```

`languageId` + `name` are required. **409** if a translation for the same `(category_id, language_id)` already exists (unique constraint).

---

## 13.14 `PATCH /api/v1/categories/:id/translations/:tid`

Partial update of a translation row. Permission: `category.update`. Any subset of the translation fields — `name`, `description`, `metaTitle`/`metaDescription`/`metaKeywords`, the OG block, the Twitter block, `canonicalUrl`, `robotsDirective`, `focusKeyword`, `structuredData`, `tags`, `isActive`. **400** on empty body.

```bash
curl -X PATCH "http://localhost:3000/api/v1/categories/7/translations/14" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "metaDescription": "Updated SEO description." }'
```

---

## 13.15 `DELETE /api/v1/categories/:id/translations/:tid`

Soft delete a translation row. Permission: `category.update`. The parent category stays active; only this translation is archived.

```bash
curl -X DELETE "http://localhost:3000/api/v1/categories/7/translations/14" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 13.16 `POST /api/v1/categories/:id/translations/:tid/restore`

Restore a soft-deleted translation row. Permission: `category.update`.

```bash
curl -X POST "http://localhost:3000/api/v1/categories/7/translations/14/restore" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

**Common errors across all category routes**

| HTTP | code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing / expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No category (or translation) with that id. |
| 409 | `DUPLICATE_ENTRY` | Duplicate `code`, `slug`, or `(category_id, language_id)` translation. |
