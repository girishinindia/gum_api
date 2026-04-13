# Phase 16 — Coupons

Coupons are discount codes that apply to courses, bundles, batches, webinars, or all products on the Grow Up More platform. Each coupon has a discount type (percentage or fixed_amount), value, usage limits, validity period, and multilingual translations. Coupons track usage counts and support soft-delete with admin restore.

Permission codes: `coupon.read`, `coupon.create`, `coupon.update`, `coupon.delete`, `coupon.restore`.

- **Super-admin**: all 5 permissions.
- **Admin**: all except `coupon.delete`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`**.

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1coupons) | `GET` | `/api/v1/coupons` | `coupon.read` | List coupons with pagination, search, filter, sort. |
| [§1.2](#12-get-apiv1couponsid) | `GET` | `/api/v1/coupons/:id` | `coupon.read` | Get one coupon by ID (includes deleted — phase-02 contract). |
| [§1.3](#13-post-apiv1coupons) | `POST` | `/api/v1/coupons` | `coupon.create` | Create a new coupon. |
| [§1.4](#14-patch-apiv1couponsid) | `PATCH` | `/api/v1/coupons/:id` | `coupon.update` | Update a coupon. |
| [§1.5](#15-delete-apiv1couponsid) | `DELETE` | `/api/v1/coupons/:id` | `coupon.delete` | Soft-delete (cascades to translations). |
| [§1.6](#16-post-apiv1couponsidrestore) | `POST` | `/api/v1/coupons/:id/restore` | `coupon.restore` | Restore a soft-deleted coupon (cascades). |

---

## Enums reference

**discountType**: `percentage`, `fixed_amount`

**applicableTo**: `all`, `course`, `bundle`, `batch`, `webinar`

---

## 1.1 `GET /api/v1/coupons`

List all coupons.

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `code` | string | — | Filter by coupon code (ILIKE). |
| `discountType` | enum | — | `percentage`, `fixed_amount`. |
| `applicableTo` | enum | — | `all`, `course`, `bundle`, `batch`, `webinar`. |
| `isActive` | bool | — | Filter by active status. |
| `searchTerm` | string | — | Searches code, slug, discount_type, applicable_to (ILIKE). |
| `sortColumn` | enum | `created_at` | See **Sort columns** below. |
| `sortDirection` | enum | `DESC` | `ASC` \| `DESC`. |

**Sort columns reference:**

`id`, `code`, `discount_value`, `used_count`, `created_at`, `updated_at`.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 1,
      "code": "SUMMER2024",
      "slug": "summer2024",
      "discountType": "percentage",
      "discountValue": 20.00,
      "minPurchaseAmount": null,
      "maxDiscountAmount": null,
      "applicableTo": "all",
      "usageLimit": 100,
      "usagePerUser": 2,
      "usedCount": 15,
      "validFrom": "2026-05-01T00:00:00.000Z",
      "validUntil": "2026-08-31T23:59:59.000Z",
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-12T10:30:00.000Z",
      "updatedAt": "2026-04-12T10:30:00.000Z",
      "deletedAt": null
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

### Saved examples to add in Postman

| # | Description | URL |
|---|---|---|
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/coupons?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/coupons?pageIndex=2&pageSize=20` |
| 3 | Custom page size (10) | `{{baseUrl}}/api/v1/coupons?pageIndex=1&pageSize=10` |
| 4 | Filter by code=SUMMER2024 | `{{baseUrl}}/api/v1/coupons?code=SUMMER2024` |
| 5 | Filter by discountType=percentage | `{{baseUrl}}/api/v1/coupons?discountType=percentage` |
| 6 | Filter by discountType=fixed_amount | `{{baseUrl}}/api/v1/coupons?discountType=fixed_amount` |
| 7 | Filter by applicableTo=all | `{{baseUrl}}/api/v1/coupons?applicableTo=all` |
| 8 | Filter by applicableTo=course | `{{baseUrl}}/api/v1/coupons?applicableTo=course` |
| 9 | Filter by applicableTo=bundle | `{{baseUrl}}/api/v1/coupons?applicableTo=bundle` |
| 10 | Filter by applicableTo=batch | `{{baseUrl}}/api/v1/coupons?applicableTo=batch` |
| 11 | Filter by applicableTo=webinar | `{{baseUrl}}/api/v1/coupons?applicableTo=webinar` |
| 12 | Filter by isActive=true | `{{baseUrl}}/api/v1/coupons?isActive=true` |
| 13 | Filter by isActive=false | `{{baseUrl}}/api/v1/coupons?isActive=false` |
| 14 | Search — "SUMMER2024" | `{{baseUrl}}/api/v1/coupons?searchTerm=SUMMER2024` |
| 15 | Search — "summer" | `{{baseUrl}}/api/v1/coupons?searchTerm=summer` |
| 16 | Sort by discount_value DESC (highest) | `{{baseUrl}}/api/v1/coupons?sortColumn=discount_value&sortDirection=DESC` |
| 17 | Sort by discount_value ASC (lowest) | `{{baseUrl}}/api/v1/coupons?sortColumn=discount_value&sortDirection=ASC` |
| 18 | Sort by used_count DESC (most used) | `{{baseUrl}}/api/v1/coupons?sortColumn=used_count&sortDirection=DESC` |
| 19 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/coupons?sortColumn=created_at&sortDirection=DESC` |
| 20 | Sort by updated_at DESC | `{{baseUrl}}/api/v1/coupons?sortColumn=updated_at&sortDirection=DESC` |
| 21 | Combo — active percentage coupons | `{{baseUrl}}/api/v1/coupons?isActive=true&discountType=percentage` |
| 22 | Combo — course coupons sorted by discount | `{{baseUrl}}/api/v1/coupons?applicableTo=course&sortColumn=discount_value&sortDirection=DESC` |
| 23 | Combo — search + filter + paginate | `{{baseUrl}}/api/v1/coupons?pageIndex=1&pageSize=10&discountType=percentage&searchTerm=summer` |
| 24 | Combo — fixed amount, sorted by usage | `{{baseUrl}}/api/v1/coupons?discountType=fixed_amount&sortColumn=used_count&sortDirection=DESC` |

---

## 1.2 `GET /api/v1/coupons/:id`

Get a single coupon by ID. **Phase-02 contract**: returns the record even if soft-deleted.

### Responses

#### 200 OK

Same shape as a single object in §1.1 `data[]`.

#### 404 Not Found

```json
{ "success": false, "message": "Coupon 999 not found" }
```

---

## 1.3 `POST /api/v1/coupons`

Create a new coupon.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | string | **yes** | 1-100 chars. Unique coupon code. |
| `discountType` | enum | **yes** | `percentage`, `fixed_amount`. |
| `discountValue` | number | **yes** | 0-99999999.99. Percentage (0-100) or fixed amount in currency units. |
| `minPurchaseAmount` | number | no | 0-99999999.99. Minimum purchase to apply coupon. |
| `maxDiscountAmount` | number | no | 0-99999999.99. Cap for percentage discounts. |
| `applicableTo` | enum | no | Default: `all`. Values: `all`, `course`, `bundle`, `batch`, `webinar`. |
| `usageLimit` | int | no | null = unlimited. 0-2147483647. |
| `usagePerUser` | int | no | Default: 1. 0-32767. |
| `validFrom` | datetime | no | ISO 8601 with timezone offset. |
| `validUntil` | datetime | no | ISO 8601 with timezone offset. |
| `isActive` | bool | no | Default: `true`. |

**Example request**

```json
{
  "code": "SUMMER2024",
  "discountType": "percentage",
  "discountValue": 20.00,
  "minPurchaseAmount": null,
  "maxDiscountAmount": null,
  "applicableTo": "all",
  "usageLimit": 100,
  "usagePerUser": 2,
  "validFrom": "2026-05-01T00:00:00+05:30",
  "validUntil": "2026-08-31T23:59:59+05:30",
  "isActive": true
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Coupon created",
  "data": { "id": 1, "code": "SUMMER2024", "slug": "summer2024", "..." : "..." }
}
```

#### 400 Validation Error

```json
{ "success": false, "message": "code is required." }
```

```json
{ "success": false, "message": "discountValue must be greater than 0." }
```

```json
{ "success": false, "message": "validFrom must be before validUntil." }
```

#### 409 Conflict

```json
{ "success": false, "message": "Coupon code 'SUMMER2024' already exists." }
```

#### 422 Unprocessable Entity

```json
{ "success": false, "message": "usagePerUser must be between 1 and 32767." }
```

---

## 1.4 `PATCH /api/v1/coupons/:id`

Update a coupon. `code`, `slug`, `discountType`, and `applicableTo` are **immutable** after creation.

**Request body** — at least one field required.

| Field | Type | Notes |
|---|---|---|
| `discountValue` | number | 0-99999999.99. |
| `minPurchaseAmount` | number | 0-99999999.99. |
| `maxDiscountAmount` | number | 0-99999999.99. |
| `usageLimit` | int | |
| `usagePerUser` | int | 1-32767. |
| `validFrom` | datetime | |
| `validUntil` | datetime | |
| `isActive` | bool | |

### Responses

#### 200 OK

Returns the updated coupon (same shape as §1.2).

```json
{
  "success": true,
  "message": "Coupon updated",
  "data": { "id": 1, "code": "SUMMER2024", "..." : "..." }
}
```

#### 400 Bad Request

```json
{ "success": false, "message": "validFrom must be before validUntil." }
```

```json
{ "success": false, "message": "Cannot update immutable field 'code'." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Coupon 999 not found or is deleted." }
```

---

## 1.5 `DELETE /api/v1/coupons/:id`

Soft-delete a coupon. **Cascades** to all coupon_translations.

### Responses

#### 200 OK

```json
{ "success": true, "message": "Coupon deleted", "data": { "id": 1, "deleted": true } }
```

#### 400 Bad Request

```json
{ "success": false, "message": "Coupon 1 is already deleted." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Coupon 999 not found." }
```

---

## 1.6 `POST /api/v1/coupons/:id/restore`

Restore a soft-deleted coupon. **Cascades** restore to all translations.

### Responses

#### 200 OK

Returns the restored coupon (same shape as §1.2).

```json
{
  "success": true,
  "message": "Coupon restored",
  "data": { "id": 1, "code": "SUMMER2024", "..." : "..." }
}
```

#### 400 Bad Request

```json
{ "success": false, "message": "Coupon 1 is not deleted." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Coupon 999 not found." }
```

---

## Common error responses (all endpoints)

| Status | When |
|---|---|
| `400` | Validation failure, constraint violation, or UDF error. |
| `401` | Missing or invalid JWT token. |
| `403` | User lacks the required permission. |
| `404` | Resource not found (GET /:id, PATCH /:id). |
| `409` | Duplicate entry (e.g., same coupon code). |
| `422` | Unprocessable entity (validation constraint). |
| `500` | Internal server error. |
