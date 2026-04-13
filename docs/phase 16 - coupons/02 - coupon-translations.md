# Phase 16 — Coupon Translations

Coupon translations provide multilingual support for coupon titles and descriptions. Each translation belongs to a coupon and references a language. Translations support soft-delete with cascading parent-delete and admin restore.

Permission codes: `coupon_translation.read`, `coupon_translation.create`, `coupon_translation.update`, `coupon_translation.delete`, `coupon_translation.restore`.

- **Super-admin**: all 5 permissions.
- **Admin**: all except `coupon_translation.delete`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`**.

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§2.1](#21-get-apiv1couponsidtranslations) | `GET` | `/api/v1/coupons/:id/translations` | `coupon_translation.read` | List translations for a coupon. |
| [§2.2](#22-get-apiv1couponsidtranslationstid) | `GET` | `/api/v1/coupons/:id/translations/:tid` | `coupon_translation.read` | Get one translation by ID. |
| [§2.3](#23-post-apiv1couponsidtranslations) | `POST` | `/api/v1/coupons/:id/translations` | `coupon_translation.create` | Create a translation for a coupon. |
| [§2.4](#24-patch-apiv1couponsidtranslationstid) | `PATCH` | `/api/v1/coupons/:id/translations/:tid` | `coupon_translation.update` | Update a translation. |
| [§2.5](#25-delete-apiv1couponsidtranslationstid) | `DELETE` | `/api/v1/coupons/:id/translations/:tid` | `coupon_translation.delete` | Soft-delete a translation. |
| [§2.6](#26-post-apiv1couponsidtranslationstidrestore) | `POST` | `/api/v1/coupons/:id/translations/:tid/restore` | `coupon_translation.restore` | Restore a soft-deleted translation. |

---

## 2.1 `GET /api/v1/coupons/:id/translations`

List all translations for a coupon.

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `sortColumn` | enum | `created_at` | `id`, `title`, `created_at`, `updated_at`. |
| `sortDirection` | enum | `DESC` | `ASC` \| `DESC`. |

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 1,
      "couponId": 1,
      "languageId": 1,
      "title": "Summer Discount 2024",
      "description": "Get 20% off all courses this summer",
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-12T10:30:00.000Z",
      "updatedAt": "2026-04-12T10:30:00.000Z",
      "deletedAt": null,
      "languageName": "English",
      "languageIsoCode": "en",
      "languageNativeName": "English"
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 1, "totalPages": 1 }
}
```

#### 200 OK — empty result

```json
{
  "success": true,
  "message": "OK",
  "data": [],
  "meta": { "page": 1, "limit": 20, "totalCount": 0, "totalPages": 0 }
}
```

#### 401 Unauthorized

```json
{ "success": false, "message": "Authentication required" }
```

#### 403 Forbidden

```json
{ "success": false, "message": "Insufficient permissions" }
```

#### 404 Not Found

```json
{ "success": false, "message": "Coupon 999 not found" }
```

### Saved examples to add in Postman

| # | Description | URL |
|---|---|---|
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/coupons/1/translations?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/coupons/1/translations?pageIndex=2&pageSize=20` |
| 3 | Custom page size (10) | `{{baseUrl}}/api/v1/coupons/1/translations?pageIndex=1&pageSize=10` |
| 4 | Sort by title ASC | `{{baseUrl}}/api/v1/coupons/1/translations?sortColumn=title&sortDirection=ASC` |
| 5 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/coupons/1/translations?sortColumn=created_at&sortDirection=DESC` |
| 6 | Sort by updated_at DESC | `{{baseUrl}}/api/v1/coupons/1/translations?sortColumn=updated_at&sortDirection=DESC` |

---

## 2.2 `GET /api/v1/coupons/:id/translations/:tid`

Get a single translation by ID.

### Responses

#### 200 OK

Same shape as a single object in §2.1 `data[]`.

#### 404 Not Found

```json
{ "success": false, "message": "Translation 999 not found" }
```

```json
{ "success": false, "message": "Coupon 999 not found" }
```

---

## 2.3 `POST /api/v1/coupons/:id/translations`

Create a new translation for a coupon.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `languageId` | int | **yes** | Must reference an existing language. |
| `title` | string | **yes** | 1-500 chars. Translation title. |
| `description` | string | no | 0-2000 chars. Translation description. |
| `isActive` | bool | no | Default: `true`. |

**Example request**

```json
{
  "languageId": 1,
  "title": "Summer Discount 2024",
  "description": "Get 20% off all courses this summer",
  "isActive": true
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Coupon translation created",
  "data": { "id": 1, "couponId": 1, "languageId": 1, "title": "Summer Discount 2024", "..." : "..." }
}
```

#### 400 Validation Error

```json
{ "success": false, "message": "languageId is required." }
```

```json
{ "success": false, "message": "title is required." }
```

```json
{ "success": false, "message": "languageId 999 does not exist." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Coupon 999 not found" }
```

#### 409 Conflict

```json
{ "success": false, "message": "Translation for coupon 1 in language 1 already exists." }
```

#### 422 Unprocessable Entity

```json
{ "success": false, "message": "title must be between 1 and 500 characters." }
```

---

## 2.4 `PATCH /api/v1/coupons/:id/translations/:tid`

Update a translation. At least one field required.

**Request body**

| Field | Type | Notes |
|---|---|---|
| `title` | string | 1-500 chars. |
| `description` | string | 0-2000 chars. Empty string clears the field. |
| `isActive` | bool | |

**Example request**

```json
{
  "title": "Summer Sale 2024 - Updated",
  "description": "Get 20% off all courses this summer with code SUMMER2024"
}
```

### Responses

#### 200 OK

Returns the updated translation (same shape as §2.2).

```json
{
  "success": true,
  "message": "Coupon translation updated",
  "data": { "id": 1, "couponId": 1, "languageId": 1, "title": "Summer Sale 2024 - Updated", "..." : "..." }
}
```

#### 400 Bad Request

```json
{ "success": false, "message": "At least one field is required for update." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Translation 999 not found" }
```

```json
{ "success": false, "message": "Coupon 999 not found" }
```

#### 422 Unprocessable Entity

```json
{ "success": false, "message": "title must be between 1 and 500 characters." }
```

---

## 2.5 `DELETE /api/v1/coupons/:id/translations/:tid`

Soft-delete a translation.

### Responses

#### 200 OK

```json
{ "success": true, "message": "Coupon translation deleted", "data": { "id": 1, "deleted": true } }
```

#### 400 Bad Request

```json
{ "success": false, "message": "Translation 1 is already deleted." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Translation 999 not found" }
```

```json
{ "success": false, "message": "Coupon 999 not found" }
```

---

## 2.6 `POST /api/v1/coupons/:id/translations/:tid/restore`

Restore a soft-deleted translation. Validates parent coupon is not deleted.

### Responses

#### 200 OK

Returns the restored translation (same shape as §2.2).

```json
{
  "success": true,
  "message": "Coupon translation restored",
  "data": { "id": 1, "couponId": 1, "languageId": 1, "..." : "..." }
}
```

#### 400 Bad Request

```json
{ "success": false, "message": "Cannot restore translation: parent coupon is deleted." }
```

```json
{ "success": false, "message": "Translation 1 is not deleted." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Translation 999 not found" }
```

```json
{ "success": false, "message": "Coupon 999 not found" }
```

---

## Common error responses (all endpoints)

| Status | When |
|---|---|
| `400` | Validation failure, constraint violation, or UDF error. |
| `401` | Missing or invalid JWT token. |
| `403` | User lacks the required permission. |
| `404` | Resource not found (GET /:id, PATCH /:id). |
| `409` | Duplicate entry (e.g., same language in coupon). |
| `422` | Unprocessable entity (validation constraint). |
| `500` | Internal server error. |
