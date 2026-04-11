# Phase 2 — Sub-Categories

Second level of the content taxonomy — each sub-category has a mandatory FK to `categories.id`, a machine `code` that is unique **per category** (not globally), a slug, optional `iconUrl` + `imageUrl`, and a full per-language translation table mirroring the one on categories (name, description, SEO block: meta tags, Open Graph, Twitter Card, JSON-LD, canonical URL, robots directive).

Like categories, sub-categories support a **combined insert** — parent row and first translation in a single atomic `POST`. `categoryId` **can be changed** via `PATCH` — the row gets re-parented and the uniqueness constraint on `(category_id, slug)` is re-checked against the new parent.

All routes require auth. Permission codes: `sub_category.read`, `sub_category.create`, `sub_category.update`, `sub_category.delete`, `sub_category.restore`. The icon, image, and translation sub-resource routes are gated by `sub_category.update`.

← [13 categories](13%20-%20categories.md) · [06 walkthrough](06%20-%20walkthrough%20and%20index.md)

---

## 14.1 `GET /api/v1/sub-categories`

List sub-categories. Backed by `udf_get_sub_categories`.

**Query params**

| Param | Type | Notes |
|---|---|---|
| `pageIndex`, `pageSize` | int | Standard pagination. |
| `searchTerm` | string | `ILIKE` across `code` and `slug`. |
| `categoryId` | int | Restrict to a single parent category (coerced from the query string — `?categoryId=7` works). |
| `isActive`, `isDeleted`, `isNew` | bool | |
| `sortColumn` | enum | `id`, `code`, `slug`, `display_order`, `is_active`, `is_deleted`, `created_at`, `updated_at`. Default `display_order`. |
| `sortDirection` | enum | `ASC` / `DESC`. Default `ASC`. |

**Sample row**

```json
{
  "id": 21,
  "categoryId": 7,
  "code": "PY",
  "slug": "python",
  "displayOrder": 10,
  "iconUrl": "https://cdn.growupmore.com/sub-categories/icons/21.webp",
  "imageUrl": "https://cdn.growupmore.com/sub-categories/images/21.webp",
  "isNew": true,
  "newUntil": "2026-12-31",
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

### Sample queries

**1. Every sub-category under the Programming category**

```bash
curl "http://localhost:3000/api/v1/sub-categories?categoryId=7&pageSize=50" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**2. Search**

```bash
curl "http://localhost:3000/api/v1/sub-categories?searchTerm=python" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 14.2 `GET /api/v1/sub-categories/:id`

Read a single sub-category by id. **404** if unknown.

```bash
curl "http://localhost:3000/api/v1/sub-categories/21" -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 14.3 `POST /api/v1/sub-categories`

Create a sub-category. Permission: `sub_category.create`. Like categories, you may include an optional `translation` block — `udf_sub_categories_insert` commits parent + first translation atomically.

```bash
curl -X POST "http://localhost:3000/api/v1/sub-categories" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryId": 7,
    "code": "PY",
    "slug": "python",
    "displayOrder": 10,
    "isNew": true,
    "newUntil": "2026-12-31",
    "isActive": true,
    "translation": {
      "languageId": 1,
      "name": "Python",
      "description": "General-purpose programming language popular for data, scripting, and backend.",
      "metaTitle": "Python courses",
      "metaDescription": "Learn Python from beginner basics through production-grade systems.",
      "ogType": "website",
      "twitterCard": "summary_large_image",
      "robotsDirective": "index,follow"
    }
  }'
```

`categoryId` and `code` are required. `code` must be unique per-parent (`uq_sub_categories_category_code`). `slug` is optional (auto-derived) but similarly scoped by parent (`uq_sub_categories_category_slug`). Translation block rules are identical to categories — `languageId` + `name` are required, everything else optional.

**`iconUrl` and `imageUrl` are deliberately not accepted here** — use [§14.7](#147-post-apiv1sub-categoriesidicon) / [§14.9](#149-post-apiv1sub-categoriesidimage) after the row exists.

**Possible errors**

- **400 VALIDATION_ERROR** — missing `categoryId` or `code`, translation missing `languageId`/`name`, string over cap.
- **403** — caller lacks `sub_category.create`.
- **404** — the referenced `categoryId` does not exist (or is soft-deleted).
- **409** — duplicate `(category_id, code)` or `(category_id, slug)`.

---

## 14.4 `PATCH /api/v1/sub-categories/:id`

Partial update. Any subset of `categoryId`, `code`, `slug`, `displayOrder`, `isNew`, `newUntil`, `isActive`. **400** on empty body.

Passing a new `categoryId` **re-parents** the row; the unique constraint on `(category_id, code)` / `(category_id, slug)` is re-checked against the new parent, so a `409` can surface at update time even though the original row was fine. `iconUrl` / `imageUrl` are excluded here.

```bash
curl -X PATCH "http://localhost:3000/api/v1/sub-categories/21" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "categoryId": 9, "displayOrder": 5 }'
```

---

## 14.5 `DELETE /api/v1/sub-categories/:id`

Soft delete. Permission: `sub_category.delete`. Translations are not cascaded — they remain in place and come back when the parent is restored.

```bash
curl -X DELETE "http://localhost:3000/api/v1/sub-categories/21" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 14.6 `POST /api/v1/sub-categories/:id/restore`

Reverse a soft delete. Permission: `sub_category.restore`. **400 BAD_REQUEST** if the row isn't deleted.

```bash
curl -X POST "http://localhost:3000/api/v1/sub-categories/21/restore" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 14.7 `POST /api/v1/sub-categories/:id/icon`

Upload (or replace) the sub-category icon. Permission: `sub_category.update`. Body is `multipart/form-data` with a single `file` field.

```bash
curl -X POST "http://localhost:3000/api/v1/sub-categories/21/icon" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@./python.png"
```

### Icon contract

| Step | Enforcement |
|---|---|
| Accepted MIME types | `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml` |
| Raw upload cap | **100 KB** (multer) |
| Output format | **Always WebP** |
| Resize | Fits inside a **256 × 256** box |
| Final byte cap | **≤ 100 KB** (sharp quality loop 80 → 40 step 10) |
| Storage key | `sub-categories/icons/<id>.webp` — deterministic, CDN URLs stay stable |
| On replace | Previous Bunny object deleted **before** new PUT. Delete failures logged at WARN, do not block the new upload. |

**Response 200** — the refreshed sub-category row with `iconUrl` populated.

---

## 14.8 `DELETE /api/v1/sub-categories/:id/icon`

Clear the icon. Permission: `sub_category.update`.

```bash
curl -X DELETE "http://localhost:3000/api/v1/sub-categories/21/icon" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 14.9 `POST /api/v1/sub-categories/:id/image`

Upload (or replace) the larger hero image. Permission: `sub_category.update`. Separate column, separate storage key.

```bash
curl -X POST "http://localhost:3000/api/v1/sub-categories/21/image" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "file=@./python-hero.jpg"
```

### Image contract

| Step | Enforcement |
|---|---|
| Accepted MIME types | `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml` |
| Raw upload cap | **100 KB** (multer) |
| Output format | **Always WebP** |
| Resize | Fits inside a **1024 × 1024** box |
| Final byte cap | **≤ 100 KB** (sharp quality loop 80 → 40 step 10) |
| Storage key | `sub-categories/images/<id>.webp` — deterministic |
| On replace | Previous Bunny image object deleted **before** new PUT. Delete failures logged at WARN, do not block the new upload. The icon is untouched. |

**Response 200** — the refreshed sub-category row with `imageUrl` populated.

---

## 14.10 `DELETE /api/v1/sub-categories/:id/image`

Clear the image. Permission: `sub_category.update`.

```bash
curl -X DELETE "http://localhost:3000/api/v1/sub-categories/21/image" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 14.11 `GET /api/v1/sub-categories/:id/translations`

List all translation rows for a single sub-category. Permission: `sub_category.read`.

**Query params**

| Param | Type | Notes |
|---|---|---|
| `pageIndex`, `pageSize` | int | Standard pagination. |
| `searchTerm` | string | `ILIKE` across `name`, `description`, `meta_title`. |
| `isActive`, `isDeleted` | bool | |
| `languageId` | int | Filter to a single language (coerced from the query string). |
| `sortColumn` | enum | `id`, `name`, `language_id`, `sub_category_id`, `created_at`. Default `created_at`. |
| `sortDirection` | enum | `ASC` / `DESC`. Default `DESC`. |

```bash
curl "http://localhost:3000/api/v1/sub-categories/21/translations?languageId=1" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 14.12 `GET /api/v1/sub-categories/:id/translations/:tid`

Read a single translation row by id. **404** if unknown.

```bash
curl "http://localhost:3000/api/v1/sub-categories/21/translations/48" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 14.13 `POST /api/v1/sub-categories/:id/translations`

Add a new translation row. Permission: `sub_category.update`. **409** if a translation for the same `(sub_category_id, language_id)` already exists.

```bash
curl -X POST "http://localhost:3000/api/v1/sub-categories/21/translations" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "languageId": 2,
    "name": "Python",
    "description": "Lenguaje de programación de propósito general.",
    "metaTitle": "Cursos de Python"
  }'
```

---

## 14.14 `PATCH /api/v1/sub-categories/:id/translations/:tid`

Partial update of a translation row. Permission: `sub_category.update`. Same field set as [§13.14](13%20-%20categories.md#1314-patch-apiv1categoriesidtranslationstid). **400** on empty body.

```bash
curl -X PATCH "http://localhost:3000/api/v1/sub-categories/21/translations/48" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "metaDescription": "Updated SEO description." }'
```

---

## 14.15 `DELETE /api/v1/sub-categories/:id/translations/:tid`

Soft delete a translation row. Permission: `sub_category.update`. The parent sub-category stays active.

```bash
curl -X DELETE "http://localhost:3000/api/v1/sub-categories/21/translations/48" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 14.16 `POST /api/v1/sub-categories/:id/translations/:tid/restore`

Restore a soft-deleted translation row. Permission: `sub_category.update`.

```bash
curl -X POST "http://localhost:3000/api/v1/sub-categories/21/translations/48/restore" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

**Common errors across all sub-category routes**

| HTTP | code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing / expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No sub-category (or translation, or parent category) with that id. |
| 409 | `DUPLICATE_ENTRY` | Duplicate `(category_id, code)`, `(category_id, slug)`, or `(sub_category_id, language_id)`. |
