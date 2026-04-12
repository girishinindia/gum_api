# Phase 9 — Bundles

A bundle is a curated package of courses or resources sold as a single unit. Bundles support two ownership models: **system-owned** (managed by administrators) and **instructor-owned** (created by individual instructors). Each bundle has a parent record in the bundles table and child translations in the bundle_translations table. Translations store localized titles, descriptions, SEO metadata, and promotional content. Bundles support soft-delete and admin restore, and include pricing, discount, validity, and feature flags. All routes require authentication.

Permission codes: `bundle.read`, `bundle.create`, `bundle.update`, `bundle.delete`, `bundle.restore`, `bundle_translation.read`, `bundle_translation.create`, `bundle_translation.update`, `bundle_translation.delete`.

- **Super-admin**: all 8 permissions.
- **Admin**: `read`, `create`, `update`, `restore` (no `delete`).
- **Instructor**: `read`, `create`, `update` on own bundles only; no delete/restore.
- **Student**: `read` only.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](../00%20-%20overview.md#8-postman-environment).

← [back to Phase 9](./00%20-%20overview.md) · [Previous](./07%20-%20course-module-topics.md) · [Next →](./09%20-%20lessons.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1bundles) | `GET` | `{{baseUrl}}/api/v1/bundles` | `bundle.read` | List all bundles with pagination, search, filter, and sort. |
| [§1.2](#12-get-apiv1bundlesid) | `GET` | `{{baseUrl}}/api/v1/bundles/:id` | `bundle.read` | Get one bundle by ID (skips is_deleted filter). |
| [§1.3](#13-post-apiv1bundles) | `POST` | `{{baseUrl}}/api/v1/bundles` | `bundle.create` | Create a new system or instructor bundle. |
| [§1.4](#14-patch-apiv1bundlesid) | `PATCH` | `{{baseUrl}}/api/v1/bundles/:id` | `bundle.update` | Update a bundle by ID. |
| [§1.5](#15-delete-apiv1bundlesid) | `DELETE` | `{{baseUrl}}/api/v1/bundles/:id` | `bundle.delete` | Soft-delete a bundle (cascade deletes all translations). |
| [§1.6](#16-post-apiv1bundlesidrestore) | `POST` | `{{baseUrl}}/api/v1/bundles/:id/restore` | `bundle.restore` | Restore a soft-deleted bundle (cascade restores all translations). |
| [§2.1](#21-post-apiv1bundlestranslations) | `POST` | `{{baseUrl}}/api/v1/bundles/translations` | `bundle_translation.create` | Create a new bundle translation. |
| [§2.2](#22-patch-apiv1bundlestranslationsid) | `PATCH` | `{{baseUrl}}/api/v1/bundles/translations/:id` | `bundle_translation.update` | Update a bundle translation by ID. |

---

## 1.1 `GET /api/v1/bundles`

List all bundles with support for pagination, search, filtering, and sorting. Results include denormalized bundle and translation metadata. Only bundles with at least one active translation appear in results.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/bundles` |
| Permission | `bundle.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number (for UI convenience). |
| `pageSize` | int | `20` | 1..500. |
| `languageId` | int | — | Filter by bundle_translations.languageId. Returns first matching translation per bundle. |
| `bundleOwner` | enum | — | Filter by bundle ownership: `system` or `instructor`. |
| `isFeatured` | bool | — | Filter by featured flag. |
| `isActive` | bool | — | Filter by active flag. |
| `searchTerm` | string | — | `ILIKE` across bundle code, slug, and (if languageId provided) translation title and description. |
| `sortTable` | enum | `bundle` | Sort on `bundle` table or `translation` table. Must set sortColumn accordingly. |
| `sortColumn` | enum | `id` | If sortTable=`bundle`: `id`, `code`, `slug`, `price`, `display_order`, `created_at`, `updated_at`. If sortTable=`translation`: `id`, `title`, `created_at`, `updated_at`. |
| `sortDirection` | enum | `ASC` | `ASC` \| `DESC`. |

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "bundleTransId": 1,
      "bundleId": 1,
      "bundleCode": "BUNDLE-TEST-01",
      "bundleSlug": "bundle-test-01",
      "bundleTransTitle": "Complete Python Bundle",
      "languageCode": "en",
      "bundleOwner": "system",
      "bundlePrice": 99.99,
      "bundleIsFeatured": true,
      "bundleIsActive": true,
      "instructorFullName": null
    },
    {
      "bundleTransId": 2,
      "bundleId": 2,
      "bundleCode": "INST-BUNDLE-01",
      "bundleSlug": "inst-bundle-01",
      "bundleTransTitle": "Web Development Masterclass",
      "languageCode": "en",
      "bundleOwner": "instructor",
      "bundlePrice": 149.99,
      "bundleIsFeatured": false,
      "bundleIsActive": true,
      "instructorFullName": "Jane Smith"
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 42, "totalPages": 3 }
}
```

#### 403 Forbidden — caller lacks `bundle.read`

```json
{
  "success": false,
  "message": "Missing required permission: bundle.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/bundles` — method, headers and auth stay the same as the base request above.

| # | Description | Method | URL |
|---|---|---|---|
| 1 | Page 1 (defaults) | `GET` | `{{baseUrl}}/api/v1/bundles?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `GET` | `{{baseUrl}}/api/v1/bundles?pageIndex=2&pageSize=20` |
| 3 | Page 3, default size | `GET` | `{{baseUrl}}/api/v1/bundles?pageIndex=3&pageSize=20` |
| 4 | Page 1, small page (5 rows) | `GET` | `{{baseUrl}}/api/v1/bundles?pageIndex=1&pageSize=5` |
| 5 | Page 1, large page (100 rows) | `GET` | `{{baseUrl}}/api/v1/bundles?pageIndex=1&pageSize=100` |
| 6 | Filter by languageId=1 (English) | `GET` | `{{baseUrl}}/api/v1/bundles?languageId=1` |
| 7 | Filter by system bundles | `GET` | `{{baseUrl}}/api/v1/bundles?bundleOwner=system` |
| 8 | Filter by instructor bundles | `GET` | `{{baseUrl}}/api/v1/bundles?bundleOwner=instructor` |
| 9 | Filter by featured=true | `GET` | `{{baseUrl}}/api/v1/bundles?isFeatured=true` |
| 10 | Filter by featured=false | `GET` | `{{baseUrl}}/api/v1/bundles?isFeatured=false` |
| 11 | Filter by active=true | `GET` | `{{baseUrl}}/api/v1/bundles?isActive=true` |
| 12 | Filter by active=false | `GET` | `{{baseUrl}}/api/v1/bundles?isActive=false` |
| 13 | Search — "BUNDLE-TEST-01" | `GET` | `{{baseUrl}}/api/v1/bundles?searchTerm=BUNDLE-TEST-01` |
| 14 | Search — "Python" | `GET` | `{{baseUrl}}/api/v1/bundles?searchTerm=Python` |
| 15 | Search + languageId + pagination | `GET` | `{{baseUrl}}/api/v1/bundles?pageIndex=1&pageSize=10&languageId=1&searchTerm=Complete` |
| 16 | Sort by bundle id ASC (default) | `GET` | `{{baseUrl}}/api/v1/bundles?sortTable=bundle&sortColumn=id&sortDirection=ASC` |
| 17 | Sort by bundle id DESC | `GET` | `{{baseUrl}}/api/v1/bundles?sortTable=bundle&sortColumn=id&sortDirection=DESC` |
| 18 | Sort by bundle code ASC | `GET` | `{{baseUrl}}/api/v1/bundles?sortTable=bundle&sortColumn=code&sortDirection=ASC` |
| 19 | Sort by bundle code DESC | `GET` | `{{baseUrl}}/api/v1/bundles?sortTable=bundle&sortColumn=code&sortDirection=DESC` |
| 20 | Sort by bundle price ASC (cheapest first) | `GET` | `{{baseUrl}}/api/v1/bundles?sortTable=bundle&sortColumn=price&sortDirection=ASC` |
| 21 | Sort by bundle price DESC (most expensive first) | `GET` | `{{baseUrl}}/api/v1/bundles?sortTable=bundle&sortColumn=price&sortDirection=DESC` |
| 22 | Sort by bundle displayOrder ASC | `GET` | `{{baseUrl}}/api/v1/bundles?sortTable=bundle&sortColumn=display_order&sortDirection=ASC` |
| 23 | Sort by bundle created_at DESC (newest first) | `GET` | `{{baseUrl}}/api/v1/bundles?sortTable=bundle&sortColumn=created_at&sortDirection=DESC` |
| 24 | Sort by bundle created_at ASC (oldest first) | `GET` | `{{baseUrl}}/api/v1/bundles?sortTable=bundle&sortColumn=created_at&sortDirection=ASC` |
| 25 | Sort by bundle updated_at DESC (recently updated) | `GET` | `{{baseUrl}}/api/v1/bundles?sortTable=bundle&sortColumn=updated_at&sortDirection=DESC` |
| 26 | Sort by translation title ASC | `GET` | `{{baseUrl}}/api/v1/bundles?sortTable=translation&sortColumn=title&sortDirection=ASC` |
| 27 | Sort by translation title DESC | `GET` | `{{baseUrl}}/api/v1/bundles?sortTable=translation&sortColumn=title&sortDirection=DESC` |
| 28 | Sort by translation created_at DESC | `GET` | `{{baseUrl}}/api/v1/bundles?sortTable=translation&sortColumn=created_at&sortDirection=DESC` |
| 29 | Combo — system bundles, featured, active | `GET` | `{{baseUrl}}/api/v1/bundles?bundleOwner=system&isFeatured=true&isActive=true` |
| 30 | Combo — instructor bundles, languageId=1 | `GET` | `{{baseUrl}}/api/v1/bundles?bundleOwner=instructor&languageId=1` |
| 31 | Combo — featured, active, sorted by price | `GET` | `{{baseUrl}}/api/v1/bundles?isFeatured=true&isActive=true&sortTable=bundle&sortColumn=price&sortDirection=ASC` |
| 32 | Combo — search, filter, sort, paginate | `GET` | `{{baseUrl}}/api/v1/bundles?pageIndex=1&pageSize=10&languageId=1&bundleOwner=system&searchTerm=Complete&sortTable=bundle&sortColumn=created_at&sortDirection=DESC` |

---

## 1.2 `GET /api/v1/bundles/:id`

Get one bundle by ID, including all bundle and translation metadata. Returns even soft-deleted records (does not skip is_deleted filter).

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/bundles/:id` |
| Permission | `bundle.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Query params**

| Name | Type | Notes |
|---|---|---|
| `languageId` | int | Optional. Filter translations to this language. Returns first matching translation. |

**Request body** — none.

### Responses

#### 200 OK — happy path (system bundle)

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 1,
    "code": "BUNDLE-TEST-01",
    "slug": "bundle-test-01",
    "bundleOwner": "system",
    "instructorId": null,
    "price": 99.99,
    "originalPrice": 149.99,
    "discountPercentage": 33,
    "validityDays": 365,
    "startsAt": "2026-04-12T00:00:00.000Z",
    "expiresAt": "2027-04-12T00:00:00.000Z",
    "isFeatured": true,
    "displayOrder": 1,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 54,
    "updatedBy": 54,
    "createdAt": "2026-04-12T10:56:38.031Z",
    "updatedAt": "2026-04-12T10:56:38.031Z",
    "translations": [
      {
        "id": 1,
        "bundleId": 1,
        "languageId": 1,
        "languageCode": "en",
        "title": "Complete Python Bundle",
        "description": "Master Python from basics to advanced concepts",
        "shortDescription": "Learn Python programming",
        "highlights": ["100+ hours of content", "Lifetime access", "Certificate included"],
        "thumbnailUrl": "https://cdn.example.com/thumb.webp",
        "bannerUrl": "https://cdn.example.com/banner.webp",
        "tags": ["python", "programming", "beginner-friendly"],
        "metaTitle": "Complete Python Bundle — Learn Python Online",
        "metaDescription": "Master Python programming with our comprehensive bundle",
        "metaKeywords": "python, programming, online course",
        "canonicalUrl": "https://example.com/bundles/python",
        "ogSiteName": "Learning Platform",
        "ogTitle": "Complete Python Bundle",
        "ogDescription": "Learn Python programming comprehensively",
        "ogType": "product",
        "ogImage": "https://cdn.example.com/og-image.webp",
        "ogUrl": "https://example.com/bundles/python",
        "twitterSite": "@learningplatform",
        "twitterTitle": "Python Bundle",
        "twitterDescription": "Master Python programming",
        "twitterImage": "https://cdn.example.com/twitter.webp",
        "twitterCard": "summary_large_image",
        "robotsDirective": "index, follow",
        "focusKeyword": "python programming course",
        "structuredData": "{\"@context\": \"https://schema.org\", \"@type\": \"Product\"}",
        "isActive": true,
        "createdAt": "2026-04-12T10:56:38.031Z",
        "updatedAt": "2026-04-12T10:56:38.031Z"
      }
    ]
  }
}
```

#### 200 OK — instructor bundle

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 2,
    "code": "INST-BUNDLE-01",
    "slug": "inst-bundle-01",
    "bundleOwner": "instructor",
    "instructorId": 54,
    "price": 149.99,
    "originalPrice": 199.99,
    "discountPercentage": 25,
    "validityDays": 180,
    "startsAt": "2026-04-12T00:00:00.000Z",
    "expiresAt": "2026-10-12T00:00:00.000Z",
    "isFeatured": false,
    "displayOrder": 2,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 54,
    "updatedBy": 54,
    "createdAt": "2026-04-11T14:30:00.000Z",
    "updatedAt": "2026-04-12T09:15:00.000Z",
    "translations": [
      {
        "id": 2,
        "bundleId": 2,
        "languageId": 1,
        "languageCode": "en",
        "title": "Web Development Masterclass",
        "description": "Complete web development course with modern frameworks",
        "shortDescription": "Learn full-stack web development",
        "highlights": ["HTML, CSS, JavaScript", "React & Node.js", "Projects included"],
        "thumbnailUrl": "https://cdn.example.com/web-thumb.webp",
        "bannerUrl": "https://cdn.example.com/web-banner.webp",
        "tags": ["web development", "react", "nodejs"],
        "metaTitle": "Web Development Masterclass",
        "metaDescription": "Master web development with modern frameworks",
        "metaKeywords": "web development, react, nodejs",
        "canonicalUrl": "https://example.com/bundles/web",
        "ogSiteName": "Learning Platform",
        "ogTitle": "Web Development Masterclass",
        "ogDescription": "Complete web development course",
        "ogType": "product",
        "ogImage": "https://cdn.example.com/web-og.webp",
        "ogUrl": "https://example.com/bundles/web",
        "twitterSite": "@learningplatform",
        "twitterTitle": "Web Dev Masterclass",
        "twitterDescription": "Learn full-stack web development",
        "twitterImage": "https://cdn.example.com/web-twitter.webp",
        "twitterCard": "summary_large_image",
        "robotsDirective": "index, follow",
        "focusKeyword": "web development course",
        "structuredData": "{\"@context\": \"https://schema.org\", \"@type\": \"Product\"}",
        "isActive": true,
        "createdAt": "2026-04-11T14:30:00.000Z",
        "updatedAt": "2026-04-12T09:15:00.000Z"
      }
    ]
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Bundle 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: bundle.read",
  "code": "FORBIDDEN"
}
```

---

## 1.3 `POST /api/v1/bundles`

Create a new bundle (system or instructor owned). Validates owner-FK constraint and checks for duplicate code/slug globally. The bundle is created in isActive=TRUE by default.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/bundles` |
| Permission | `bundle.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `bundleOwner` | enum | no | `system` or `instructor`. Defaults to `system`. |
| `instructorId` | int | conditional | Required if bundleOwner=`instructor`. Must be a valid user ID with instructor role. |
| `code` | string | no | Unique bundle code (e.g., "BUNDLE-001"). Maximum 100 characters. Must be unique. |
| `slug` | string | no | Unique URL-friendly slug (e.g., "python-bundle"). Maximum 255 characters. Must be unique. |
| `price` | decimal | no | Bundle selling price. Defaults to `0.00`. Precision 2, non-negative. |
| `originalPrice` | decimal | no | Original/list price before discount. Defaults to `null`. Precision 2, non-negative. |
| `discountPercentage` | int | no | Discount percentage (0-100). Defaults to `null`. |
| `validityDays` | int | no | How many days the bundle is valid for after purchase. Defaults to `null` (perpetual). |
| `startsAt` | ISO 8601 | no | When bundle sales start. Defaults to `null` (immediately). |
| `expiresAt` | ISO 8601 | no | When bundle sales expire. Defaults to `null` (never). |
| `isFeatured` | bool | no | Whether bundle is featured. Defaults to `false`. |
| `displayOrder` | int | no | Display order for UI sorting. Defaults to `0`. |
| `isActive` | bool | no | Whether bundle is active. Defaults to `true`. |

### Sample request — system bundle (full)

```json
{
  "bundleOwner": "system",
  "code": "BUNDLE-TEST-01",
  "slug": "bundle-test-01",
  "price": 99.99,
  "originalPrice": 149.99,
  "discountPercentage": 33,
  "validityDays": 365,
  "startsAt": "2026-04-12T00:00:00.000Z",
  "expiresAt": "2027-04-12T00:00:00.000Z",
  "isFeatured": true,
  "displayOrder": 1,
  "isActive": true
}
```

### Sample request — instructor bundle (full)

```json
{
  "bundleOwner": "instructor",
  "instructorId": 54,
  "code": "INST-BUNDLE-01",
  "slug": "inst-bundle-01",
  "price": 149.99,
  "originalPrice": 199.99,
  "discountPercentage": 25,
  "validityDays": 180,
  "startsAt": "2026-04-12T00:00:00.000Z",
  "expiresAt": "2026-10-12T00:00:00.000Z",
  "isFeatured": false,
  "displayOrder": 2,
  "isActive": true
}
```

### Sample request — minimal (system)

```json
{
  "code": "QUICK-BUNDLE",
  "slug": "quick-bundle",
  "price": 49.99
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "Bundle created",
  "data": {
    "id": 1,
    "code": "BUNDLE-TEST-01",
    "slug": "bundle-test-01",
    "bundleOwner": "system",
    "instructorId": null,
    "price": 99.99,
    "originalPrice": 149.99,
    "discountPercentage": 33,
    "validityDays": 365,
    "startsAt": "2026-04-12T00:00:00.000Z",
    "expiresAt": "2027-04-12T00:00:00.000Z",
    "isFeatured": true,
    "displayOrder": 1,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 54,
    "updatedBy": 54,
    "createdAt": "2026-04-12T10:56:38.031Z",
    "updatedAt": "2026-04-12T10:56:38.031Z",
    "translations": []
  }
}
```

#### 400 Bad Request — instructor bundle without instructorId

```json
{
  "success": false,
  "message": "instructorId is required when bundleOwner is 'instructor'",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — system bundle with instructorId

```json
{
  "success": false,
  "message": "instructorId must be null when bundleOwner is 'system'",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — duplicate code

```json
{
  "success": false,
  "message": "A bundle with code 'BUNDLE-TEST-01' already exists",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — duplicate slug

```json
{
  "success": false,
  "message": "A bundle with slug 'bundle-test-01' already exists",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — instructor not found

```json
{
  "success": false,
  "message": "Instructor user 999 does not exist",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: bundle.create",
  "code": "FORBIDDEN"
}
```

---

## 1.4 `PATCH /api/v1/bundles/:id`

Update a bundle. At least one field must be provided. Fields bundleOwner, instructorId, code, and slug are subject to their respective validations (ownership, unique constraints).

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/bundles/:id` |
| Permission | `bundle.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** (at least one field required)

| Field | Type | Notes |
|---|---|---|
| `bundleOwner` | enum | Update ownership: `system` or `instructor`. If changed to instructor, instructorId becomes required. |
| `instructorId` | int | Update instructor (if bundleOwner=instructor). |
| `code` | string | Update bundle code. Must remain unique. Maximum 100 characters. |
| `slug` | string | Update bundle slug. Must remain unique. Maximum 255 characters. |
| `price` | decimal | Update selling price. Non-negative, precision 2. |
| `originalPrice` | decimal | Update original price. Non-negative, precision 2. Pass `null` to clear. |
| `discountPercentage` | int | Update discount percentage (0-100). Pass `null` to clear. |
| `validityDays` | int | Update validity days. Pass `null` to set perpetual. |
| `startsAt` | ISO 8601 | Update sales start date. Pass `null` to clear (start immediately). |
| `expiresAt` | ISO 8601 | Update sales expiry date. Pass `null` to clear (never expires). |
| `isFeatured` | bool | Update featured flag. |
| `displayOrder` | int | Update display order. |
| `isActive` | bool | Update active flag. |

### Sample request — update price and featured

```json
{
  "price": 79.99,
  "isFeatured": true
}
```

### Sample request — update code

```json
{
  "code": "BUNDLE-UPDATED-01"
}
```

### Sample request — update owner to instructor

```json
{
  "bundleOwner": "instructor",
  "instructorId": 54
}
```

### Sample request — update multiple fields

```json
{
  "price": 89.99,
  "originalPrice": 129.99,
  "discountPercentage": 30,
  "displayOrder": 2,
  "isActive": false
}
```

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Bundle updated",
  "data": {
    "id": 1,
    "code": "BUNDLE-TEST-01",
    "slug": "bundle-test-01",
    "bundleOwner": "system",
    "instructorId": null,
    "price": 79.99,
    "originalPrice": 149.99,
    "discountPercentage": 33,
    "validityDays": 365,
    "startsAt": "2026-04-12T00:00:00.000Z",
    "expiresAt": "2027-04-12T00:00:00.000Z",
    "isFeatured": true,
    "displayOrder": 1,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 54,
    "updatedBy": 54,
    "createdAt": "2026-04-12T10:56:38.031Z",
    "updatedAt": "2026-04-12T11:00:00.000Z",
    "translations": []
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Bundle 999 not found",
  "code": "NOT_FOUND"
}
```

#### 400 Bad Request — empty update

```json
{
  "success": false,
  "message": "At least one field is required",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — duplicate code on update

```json
{
  "success": false,
  "message": "A bundle with code 'ALREADY-TAKEN' already exists",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — change to instructor owner without instructorId

```json
{
  "success": false,
  "message": "instructorId is required when bundleOwner is 'instructor'",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: bundle.update",
  "code": "FORBIDDEN"
}
```

---

## 1.5 `DELETE /api/v1/bundles/:id`

Soft-delete a bundle and cascade soft-delete all its translations. Sets isActive=FALSE. Only super-admin can soft-delete. The records are marked as deleted but retained in the database. Use POST /:id/restore to recover.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/bundles/:id` |
| Permission | `bundle.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 204 No Content — happy path

```
(empty body)
```

The delete response includes a header with translation count:

```
X-Deleted-Translations: 3
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Bundle 999 not found",
  "code": "NOT_FOUND"
}
```

#### 400 Bad Request — already deleted

```json
{
  "success": false,
  "message": "Bundle 1 is already deleted",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden — only super-admin

```json
{
  "success": false,
  "message": "Missing required permission: bundle.delete",
  "code": "FORBIDDEN"
}
```

---

## 1.6 `POST /api/v1/bundles/:id/restore`

Restore a soft-deleted bundle and cascade restore all its translations. Sets isActive=TRUE. Admin+ only. Validates that no duplicate active record exists for the same code/slug pair.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/bundles/:id/restore` |
| Permission | `bundle.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Bundle restored",
  "data": {
    "id": 1,
    "code": "BUNDLE-TEST-01",
    "slug": "bundle-test-01",
    "bundleOwner": "system",
    "instructorId": null,
    "price": 99.99,
    "originalPrice": 149.99,
    "discountPercentage": 33,
    "validityDays": 365,
    "startsAt": "2026-04-12T00:00:00.000Z",
    "expiresAt": "2027-04-12T00:00:00.000Z",
    "isFeatured": true,
    "displayOrder": 1,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 54,
    "updatedBy": 54,
    "createdAt": "2026-04-12T10:56:38.031Z",
    "updatedAt": "2026-04-12T10:45:00.000Z",
    "translations": []
  }
}
```

#### 404 Not Found — record not found

```json
{
  "success": false,
  "message": "Bundle 999 not found",
  "code": "NOT_FOUND"
}
```

#### 400 Bad Request — record not deleted

```json
{
  "success": false,
  "message": "Bundle 1 is not deleted; nothing to restore",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — duplicate code exists on restore

```json
{
  "success": false,
  "message": "Cannot restore: a bundle with code 'BUNDLE-TEST-01' already exists (active)",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — duplicate slug exists on restore

```json
{
  "success": false,
  "message": "Cannot restore: a bundle with slug 'bundle-test-01' already exists (active)",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: bundle.restore",
  "code": "FORBIDDEN"
}
```

---

## 2.1 `POST /api/v1/bundles/translations`

Create a new bundle translation. Adds localized content (title, description, SEO metadata, etc.) to a bundle. The bundle must exist and not be deleted. A translation for the same language cannot already exist for this bundle.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/bundles/translations` |
| Permission | `bundle_translation.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `bundleId` | int | yes | Foreign key to bundles table. Bundle must exist and not be deleted. |
| `languageId` | int | yes | Foreign key to languages table. Language must exist. |
| `title` | string | yes | Localized bundle title. Maximum 255 characters. |
| `description` | string | no | Localized full description. Maximum 5000 characters. Defaults to `null`. |
| `shortDescription` | string | no | Localized short description. Maximum 500 characters. Defaults to `null`. |
| `highlights` | string[] | no | Array of highlight strings (e.g., features). Maximum 10 items, each max 255 chars. Defaults to `[]`. |
| `thumbnailUrl` | string | no | Thumbnail image URL. Maximum 500 characters. Defaults to `null`. |
| `bannerUrl` | string | no | Banner image URL. Maximum 500 characters. Defaults to `null`. |
| `tags` | string[] | no | Array of tag strings. Maximum 20 items, each max 50 chars. Defaults to `[]`. |
| `metaTitle` | string | no | SEO meta title. Maximum 255 characters. Defaults to `null`. |
| `metaDescription` | string | no | SEO meta description. Maximum 160 characters. Defaults to `null`. |
| `metaKeywords` | string | no | SEO meta keywords. Maximum 255 characters. Defaults to `null`. |
| `canonicalUrl` | string | no | Canonical URL. Maximum 500 characters. Defaults to `null`. |
| `ogSiteName` | string | no | Open Graph site name. Maximum 255 characters. Defaults to `null`. |
| `ogTitle` | string | no | Open Graph title. Maximum 255 characters. Defaults to `null`. |
| `ogDescription` | string | no | Open Graph description. Maximum 255 characters. Defaults to `null`. |
| `ogType` | string | no | Open Graph type (e.g., "product"). Maximum 50 characters. Defaults to `null`. |
| `ogImage` | string | no | Open Graph image URL. Maximum 500 characters. Defaults to `null`. |
| `ogUrl` | string | no | Open Graph URL. Maximum 500 characters. Defaults to `null`. |
| `twitterSite` | string | no | Twitter site handle. Maximum 255 characters. Defaults to `null`. |
| `twitterTitle` | string | no | Twitter card title. Maximum 255 characters. Defaults to `null`. |
| `twitterDescription` | string | no | Twitter card description. Maximum 255 characters. Defaults to `null`. |
| `twitterImage` | string | no | Twitter card image URL. Maximum 500 characters. Defaults to `null`. |
| `twitterCard` | string | no | Twitter card type (e.g., "summary_large_image"). Maximum 50 characters. Defaults to `null`. |
| `robotsDirective` | string | no | Robots meta directive (e.g., "index, follow"). Maximum 100 characters. Defaults to `null`. |
| `focusKeyword` | string | no | Primary SEO focus keyword. Maximum 100 characters. Defaults to `null`. |
| `structuredData` | string | no | JSON-LD structured data. Maximum 5000 characters. Defaults to `null`. |
| `isActive` | bool | no | Whether translation is active. Defaults to `true`. |

### Sample request — full translation

```json
{
  "bundleId": 1,
  "languageId": 1,
  "title": "Complete Python Bundle",
  "description": "Master Python from basics to advanced concepts with our comprehensive course bundle",
  "shortDescription": "Learn Python programming",
  "highlights": ["100+ hours of content", "Lifetime access", "Certificate included"],
  "thumbnailUrl": "https://cdn.example.com/thumb.webp",
  "bannerUrl": "https://cdn.example.com/banner.webp",
  "tags": ["python", "programming", "beginner-friendly"],
  "metaTitle": "Complete Python Bundle — Learn Python Online",
  "metaDescription": "Master Python programming with our comprehensive bundle",
  "metaKeywords": "python, programming, online course",
  "canonicalUrl": "https://example.com/bundles/python",
  "ogSiteName": "Learning Platform",
  "ogTitle": "Complete Python Bundle",
  "ogDescription": "Learn Python programming comprehensively",
  "ogType": "product",
  "ogImage": "https://cdn.example.com/og-image.webp",
  "ogUrl": "https://example.com/bundles/python",
  "twitterSite": "@learningplatform",
  "twitterTitle": "Python Bundle",
  "twitterDescription": "Master Python programming",
  "twitterImage": "https://cdn.example.com/twitter.webp",
  "twitterCard": "summary_large_image",
  "robotsDirective": "index, follow",
  "focusKeyword": "python programming course",
  "structuredData": "{\"@context\": \"https://schema.org\", \"@type\": \"Product\"}",
  "isActive": true
}
```

### Sample request — minimal translation

```json
{
  "bundleId": 1,
  "languageId": 1,
  "title": "Python Bundle"
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "Bundle translation created",
  "data": {
    "id": 1,
    "bundleId": 1,
    "languageId": 1,
    "languageCode": "en",
    "title": "Complete Python Bundle",
    "description": "Master Python from basics to advanced concepts",
    "shortDescription": "Learn Python programming",
    "highlights": ["100+ hours of content", "Lifetime access", "Certificate included"],
    "thumbnailUrl": "https://cdn.example.com/thumb.webp",
    "bannerUrl": "https://cdn.example.com/banner.webp",
    "tags": ["python", "programming", "beginner-friendly"],
    "metaTitle": "Complete Python Bundle — Learn Python Online",
    "metaDescription": "Master Python programming with our comprehensive bundle",
    "metaKeywords": "python, programming, online course",
    "canonicalUrl": "https://example.com/bundles/python",
    "ogSiteName": "Learning Platform",
    "ogTitle": "Complete Python Bundle",
    "ogDescription": "Learn Python programming comprehensively",
    "ogType": "product",
    "ogImage": "https://cdn.example.com/og-image.webp",
    "ogUrl": "https://example.com/bundles/python",
    "twitterSite": "@learningplatform",
    "twitterTitle": "Python Bundle",
    "twitterDescription": "Master Python programming",
    "twitterImage": "https://cdn.example.com/twitter.webp",
    "twitterCard": "summary_large_image",
    "robotsDirective": "index, follow",
    "focusKeyword": "python programming course",
    "structuredData": "{\"@context\": \"https://schema.org\", \"@type\": \"Product\"}",
    "isActive": true,
    "createdAt": "2026-04-12T10:56:38.031Z",
    "updatedAt": "2026-04-12T10:56:38.031Z"
  }
}
```

#### 400 Bad Request — missing title

```json
{
  "success": false,
  "message": "title is required",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — duplicate translation (same bundle + language)

```json
{
  "success": false,
  "message": "A translation for bundle 1 in language 1 already exists",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — bundle does not exist

```json
{
  "success": false,
  "message": "Bundle 999 does not exist or is deleted",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — language does not exist

```json
{
  "success": false,
  "message": "Language 999 does not exist",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: bundle_translation.create",
  "code": "FORBIDDEN"
}
```

---

## 2.2 `PATCH /api/v1/bundles/translations/:id`

Update a bundle translation. At least one field must be provided. bundleId and languageId are immutable. Text fields (description, shortDescription, etc.) can be cleared by sending an empty string.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/bundles/translations/:id` |
| Permission | `bundle_translation.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** (at least one field required)

| Field | Type | Notes |
|---|---|---|
| `title` | string | Update title. Maximum 255 characters. |
| `description` | string | Update full description. Maximum 5000 characters. Pass empty string `""` to clear. |
| `shortDescription` | string | Update short description. Maximum 500 characters. Pass empty string `""` to clear. |
| `highlights` | string[] | Update highlights array. Pass empty array `[]` to clear. |
| `thumbnailUrl` | string | Update thumbnail URL. Maximum 500 characters. Pass empty string `""` to clear. |
| `bannerUrl` | string | Update banner URL. Maximum 500 characters. Pass empty string `""` to clear. |
| `tags` | string[] | Update tags array. Pass empty array `[]` to clear. |
| `metaTitle` | string | Update SEO meta title. Maximum 255 characters. Pass empty string `""` to clear. |
| `metaDescription` | string | Update SEO meta description. Maximum 160 characters. Pass empty string `""` to clear. |
| `metaKeywords` | string | Update SEO meta keywords. Maximum 255 characters. Pass empty string `""` to clear. |
| `canonicalUrl` | string | Update canonical URL. Maximum 500 characters. Pass empty string `""` to clear. |
| `ogSiteName` | string | Update OG site name. Maximum 255 characters. Pass empty string `""` to clear. |
| `ogTitle` | string | Update OG title. Maximum 255 characters. Pass empty string `""` to clear. |
| `ogDescription` | string | Update OG description. Maximum 255 characters. Pass empty string `""` to clear. |
| `ogType` | string | Update OG type. Maximum 50 characters. Pass empty string `""` to clear. |
| `ogImage` | string | Update OG image URL. Maximum 500 characters. Pass empty string `""` to clear. |
| `ogUrl` | string | Update OG URL. Maximum 500 characters. Pass empty string `""` to clear. |
| `twitterSite` | string | Update Twitter site handle. Maximum 255 characters. Pass empty string `""` to clear. |
| `twitterTitle` | string | Update Twitter title. Maximum 255 characters. Pass empty string `""` to clear. |
| `twitterDescription` | string | Update Twitter description. Maximum 255 characters. Pass empty string `""` to clear. |
| `twitterImage` | string | Update Twitter image URL. Maximum 500 characters. Pass empty string `""` to clear. |
| `twitterCard` | string | Update Twitter card type. Maximum 50 characters. Pass empty string `""` to clear. |
| `robotsDirective` | string | Update robots directive. Maximum 100 characters. Pass empty string `""` to clear. |
| `focusKeyword` | string | Update focus keyword. Maximum 100 characters. Pass empty string `""` to clear. |
| `structuredData` | string | Update structured data JSON. Maximum 5000 characters. Pass empty string `""` to clear. |
| `isActive` | bool | Update active flag. |

### Sample request — update title and description

```json
{
  "title": "Advanced Python Bundle",
  "description": "Master advanced Python concepts and patterns"
}
```

### Sample request — clear short description

```json
{
  "shortDescription": ""
}
```

### Sample request — update highlights

```json
{
  "highlights": ["150+ hours of content", "Lifetime access", "Expert instructors", "Monthly updates"]
}
```

### Sample request — update SEO metadata

```json
{
  "metaTitle": "Advanced Python Bundle — Professional Programming",
  "metaDescription": "Learn advanced Python with our professional bundle",
  "metaKeywords": "python, advanced, programming",
  "focusKeyword": "advanced python programming"
}
```

### Sample request — multiple fields

```json
{
  "title": "Complete Python Masterclass",
  "description": "Comprehensive Python course covering all levels",
  "thumbnailUrl": "https://cdn.example.com/new-thumb.webp",
  "isActive": true
}
```

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Bundle translation updated",
  "data": {
    "id": 1,
    "bundleId": 1,
    "languageId": 1,
    "languageCode": "en",
    "title": "Advanced Python Bundle",
    "description": "Master advanced Python concepts and patterns",
    "shortDescription": null,
    "highlights": ["150+ hours of content", "Lifetime access", "Expert instructors", "Monthly updates"],
    "thumbnailUrl": "https://cdn.example.com/new-thumb.webp",
    "bannerUrl": "https://cdn.example.com/banner.webp",
    "tags": ["python", "programming", "beginner-friendly"],
    "metaTitle": "Advanced Python Bundle — Professional Programming",
    "metaDescription": "Learn advanced Python with our professional bundle",
    "metaKeywords": "python, advanced, programming",
    "canonicalUrl": "https://example.com/bundles/python",
    "ogSiteName": "Learning Platform",
    "ogTitle": "Complete Python Bundle",
    "ogDescription": "Learn Python programming comprehensively",
    "ogType": "product",
    "ogImage": "https://cdn.example.com/og-image.webp",
    "ogUrl": "https://example.com/bundles/python",
    "twitterSite": "@learningplatform",
    "twitterTitle": "Python Bundle",
    "twitterDescription": "Master Python programming",
    "twitterImage": "https://cdn.example.com/twitter.webp",
    "twitterCard": "summary_large_image",
    "robotsDirective": "index, follow",
    "focusKeyword": "advanced python programming",
    "structuredData": "{\"@context\": \"https://schema.org\", \"@type\": \"Product\"}",
    "isActive": true,
    "createdAt": "2026-04-12T10:56:38.031Z",
    "updatedAt": "2026-04-12T11:10:00.000Z"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Bundle translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 400 Bad Request — empty update

```json
{
  "success": false,
  "message": "At least one field is required",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — attempt to update immutable field

```json
{
  "success": false,
  "message": "Fields bundleId and languageId are immutable",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: bundle_translation.update",
  "code": "FORBIDDEN"
}
```

---

## Postman saved examples summary

This endpoint family provides **32+ saved examples** covering:

- **Bundle list pagination**: default (pageIndex=1), various page sizes, out-of-range
- **Filtering by owner**: system bundles, instructor bundles
- **Filtering by language**: languageId=1 (English)
- **Filtering by status**: featured/non-featured, active/inactive combinations
- **Search**: bundle code, slug, translation title
- **Sorting on bundle table**: by id, code, slug, price, display_order, created_at, updated_at (both ASC and DESC)
- **Sorting on translation table**: by id, title, created_at, updated_at (both ASC and DESC)
- **Combined filters & sorts**: e.g., system + featured + active, instructor + languageId, search + pagination
- **GET by ID**: single bundle retrieval (system and instructor ownership modes)
- **GET by ID with languageId**: language-filtered retrieval
- **POST create**: system bundle minimal, system bundle full, instructor bundle full
- **PATCH update**: price + featured, code, owner change, multiple field updates
- **DELETE**: soft-delete request with cascade
- **POST restore**: restore after soft-delete with duplicate checking
- **POST translation create**: minimal translation, full translation with SEO
- **PATCH translation**: title + description, clear fields, highlight updates, SEO metadata
- **Error cases**: 400 (validation: missing instructorId, system with instructorId, duplicate code/slug, missing bundle/language, duplicate translation, immutable fields, empty updates), 403 (forbidden permissions), 404 (not found), 204 (delete success)

Use the **endpoint summary table** above and **saved examples** tables in each section to import these into your Postman collection.
