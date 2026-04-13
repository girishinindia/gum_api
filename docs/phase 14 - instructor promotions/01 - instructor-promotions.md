# Phase 14 — Instructor Promotions

Instructor promotions allow instructors to create discount promotions for their courses on the Grow Up More platform. Each promotion belongs to an instructor, has a promo code (auto-generated as slug), discount type (percentage or fixed_amount), applicable scope (all_my_courses, specific_courses, all_my_internships, specific_internships), validity period, usage limits, and approval workflow. Promotions support multilingual translations and course-level mapping as sub-resources. Supports soft-delete and admin restore.

Permission codes: `instructor_promotion.read`, `instructor_promotion.create`, `instructor_promotion.update`, `instructor_promotion.delete`, `instructor_promotion.restore`.

- **Super-admin**: all 5 permissions.
- **Admin**: all except `instructor_promotion.delete`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`**.

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1instructor-promotions) | `GET` | `/api/v1/instructor-promotions` | `instructor_promotion.read` | List instructor promotions with pagination, search, filter, sort. |
| [§1.2](#12-get-apiv1instructor-promotionsid) | `GET` | `/api/v1/instructor-promotions/:id` | `instructor_promotion.read` | Get one promotion by ID (includes deleted — phase-02 contract). |
| [§1.3](#13-post-apiv1instructor-promotions) | `POST` | `/api/v1/instructor-promotions` | `instructor_promotion.create` | Create a new instructor promotion. |
| [§1.4](#14-patch-apiv1instructor-promotionsid) | `PATCH` | `/api/v1/instructor-promotions/:id` | `instructor_promotion.update` | Update an instructor promotion. |
| [§1.5](#15-delete-apiv1instructor-promotionsid) | `DELETE` | `/api/v1/instructor-promotions/:id` | `instructor_promotion.delete` | Soft-delete (cascades to translations). |
| [§1.6](#16-post-apiv1instructor-promotionsidrestore) | `POST` | `/api/v1/instructor-promotions/:id/restore` | `instructor_promotion.restore` | Restore a soft-deleted promotion (cascades). |

---

## Enums reference

**discountType**: `percentage`, `fixed_amount`

**applicableTo**: `all_my_courses`, `specific_courses`, `all_my_internships`, `specific_internships`

**promotionStatus**: `draft`, `pending_approval`, `active`, `expired`, `cancelled`, `rejected`

---

## 1.1 `GET /api/v1/instructor-promotions`

List all instructor promotions.

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `instructorId` | int | — | Filter by instructor. |
| `promotionStatus` | enum | — | `draft`, `pending_approval`, `active`, `expired`, `cancelled`, `rejected`. |
| `discountType` | enum | — | `percentage`, `fixed_amount`. |
| `applicableTo` | enum | — | `all_my_courses`, `specific_courses`, `all_my_internships`, `specific_internships`. |
| `isDeleted` | bool | `false` | Include soft-deleted promotions. |
| `searchQuery` | string | — | Searches promo_code, slug (ILIKE). |
| `sortColumn` | enum | `created_at` | See **Sort columns** below. |
| `sortDirection` | enum | `DESC` | `ASC` \| `DESC`. |

**Sort columns reference:**

`id`, `instructor_id`, `promo_code`, `discount_value`, `discount_type`, `promotion_status`, `valid_from`, `valid_until`, `used_count`, `created_at`, `updated_at`.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 1,
      "instructorId": 54,
      "instructorFirstName": "Girish",
      "instructorLastName": "Admin",
      "instructorEmail": "girishinindia@gmail.com",
      "promoCode": "SUMMER25",
      "slug": "summer25",
      "discountType": "percentage",
      "discountValue": 30.00,
      "maxDiscountAmount": null,
      "minPurchaseAmount": null,
      "applicableTo": "all_my_courses",
      "validFrom": "2026-05-01T00:00:00.000Z",
      "validUntil": "2026-06-30T23:59:59.000Z",
      "usageLimit": null,
      "usagePerUser": null,
      "usedCount": 0,
      "promotionStatus": "draft",
      "requiresApproval": false,
      "approvedBy": null,
      "approvedAt": null,
      "rejectionReason": null,
      "createdBy": 54,
      "updatedBy": 54,
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-12T17:00:00.000Z",
      "updatedAt": "2026-04-12T17:00:00.000Z",
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
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/instructor-promotions?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/instructor-promotions?pageIndex=2&pageSize=20` |
| 3 | Custom page size (10) | `{{baseUrl}}/api/v1/instructor-promotions?pageIndex=1&pageSize=10` |
| 4 | Filter by instructorId=54 | `{{baseUrl}}/api/v1/instructor-promotions?instructorId=54` |
| 5 | Filter by promotionStatus=draft | `{{baseUrl}}/api/v1/instructor-promotions?promotionStatus=draft` |
| 6 | Filter by promotionStatus=pending_approval | `{{baseUrl}}/api/v1/instructor-promotions?promotionStatus=pending_approval` |
| 7 | Filter by promotionStatus=active | `{{baseUrl}}/api/v1/instructor-promotions?promotionStatus=active` |
| 8 | Filter by promotionStatus=expired | `{{baseUrl}}/api/v1/instructor-promotions?promotionStatus=expired` |
| 9 | Filter by promotionStatus=cancelled | `{{baseUrl}}/api/v1/instructor-promotions?promotionStatus=cancelled` |
| 10 | Filter by promotionStatus=rejected | `{{baseUrl}}/api/v1/instructor-promotions?promotionStatus=rejected` |
| 11 | Filter by discountType=percentage | `{{baseUrl}}/api/v1/instructor-promotions?discountType=percentage` |
| 12 | Filter by discountType=fixed_amount | `{{baseUrl}}/api/v1/instructor-promotions?discountType=fixed_amount` |
| 13 | Filter by applicableTo=all_my_courses | `{{baseUrl}}/api/v1/instructor-promotions?applicableTo=all_my_courses` |
| 14 | Filter by applicableTo=specific_courses | `{{baseUrl}}/api/v1/instructor-promotions?applicableTo=specific_courses` |
| 15 | Filter by applicableTo=all_my_internships | `{{baseUrl}}/api/v1/instructor-promotions?applicableTo=all_my_internships` |
| 16 | Filter by applicableTo=specific_internships | `{{baseUrl}}/api/v1/instructor-promotions?applicableTo=specific_internships` |
| 17 | Filter by isDeleted=true | `{{baseUrl}}/api/v1/instructor-promotions?isDeleted=true` |
| 18 | Search — "SUMMER25" | `{{baseUrl}}/api/v1/instructor-promotions?searchQuery=SUMMER25` |
| 19 | Search — "summer" | `{{baseUrl}}/api/v1/instructor-promotions?searchQuery=summer` |
| 20 | Sort by discount_value DESC (highest) | `{{baseUrl}}/api/v1/instructor-promotions?sortColumn=discount_value&sortDirection=DESC` |
| 21 | Sort by discount_value ASC (lowest) | `{{baseUrl}}/api/v1/instructor-promotions?sortColumn=discount_value&sortDirection=ASC` |
| 22 | Sort by valid_from ASC (earliest start) | `{{baseUrl}}/api/v1/instructor-promotions?sortColumn=valid_from&sortDirection=ASC` |
| 23 | Sort by valid_until DESC (latest expiry) | `{{baseUrl}}/api/v1/instructor-promotions?sortColumn=valid_until&sortDirection=DESC` |
| 24 | Sort by used_count DESC (most used) | `{{baseUrl}}/api/v1/instructor-promotions?sortColumn=used_count&sortDirection=DESC` |
| 25 | Sort by promotion_status ASC | `{{baseUrl}}/api/v1/instructor-promotions?sortColumn=promotion_status&sortDirection=ASC` |
| 26 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/instructor-promotions?sortColumn=created_at&sortDirection=DESC` |
| 27 | Sort by updated_at DESC | `{{baseUrl}}/api/v1/instructor-promotions?sortColumn=updated_at&sortDirection=DESC` |
| 28 | Combo — active percentage promotions | `{{baseUrl}}/api/v1/instructor-promotions?promotionStatus=active&discountType=percentage` |
| 29 | Combo — instructor 54 draft promotions | `{{baseUrl}}/api/v1/instructor-promotions?instructorId=54&promotionStatus=draft` |
| 30 | Combo — course promotions sorted by discount | `{{baseUrl}}/api/v1/instructor-promotions?applicableTo=specific_courses&sortColumn=discount_value&sortDirection=DESC` |
| 31 | Combo — search + filter + paginate | `{{baseUrl}}/api/v1/instructor-promotions?pageIndex=1&pageSize=10&instructorId=54&promotionStatus=active&searchQuery=summer` |
| 32 | Combo — fixed amount, sorted by usage | `{{baseUrl}}/api/v1/instructor-promotions?discountType=fixed_amount&sortColumn=used_count&sortDirection=DESC` |
| 33 | Combo — pending approval by date | `{{baseUrl}}/api/v1/instructor-promotions?promotionStatus=pending_approval&sortColumn=created_at&sortDirection=DESC` |
| 34 | Combo — internship promotions sorted | `{{baseUrl}}/api/v1/instructor-promotions?applicableTo=all_my_internships&sortColumn=valid_from&sortDirection=ASC` |
| 35 | Include deleted promotions | `{{baseUrl}}/api/v1/instructor-promotions?isDeleted=true` |

---

## 1.2 `GET /api/v1/instructor-promotions/:id`

Get a single instructor promotion by ID. **Phase-02 contract**: returns the record even if soft-deleted.

### Responses

#### 200 OK

Same shape as a single object in §1.1 `data[]`.

#### 404 Not Found

```json
{ "success": false, "message": "Instructor promotion 999 not found" }
```

---

## 1.3 `POST /api/v1/instructor-promotions`

Create a new instructor promotion.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `instructorId` | int | **yes** | Must reference existing, non-deleted instructor (user). |
| `promoCode` | string | no | 1-100 chars. Auto-generates slug. If not provided, auto-generates. |
| `discountType` | enum | **yes** | `percentage`, `fixed_amount`. |
| `discountValue` | number | **yes** | 0-99999999.99. Percentage (0-100) or fixed amount in currency units. |
| `maxDiscountAmount` | number | no | 0-99999999.99. Cap for percentage discounts. |
| `minPurchaseAmount` | number | no | 0-99999999.99. Minimum purchase to apply promo. |
| `applicableTo` | enum | no | Default: `all_my_courses`. Values: `all_my_courses`, `specific_courses`, `all_my_internships`, `specific_internships`. |
| `validFrom` | datetime | **yes** | ISO 8601 with timezone offset. |
| `validUntil` | datetime | **yes** | ISO 8601 with timezone offset. |
| `usageLimit` | int | no | null = unlimited. 0-2147483647. |
| `usagePerUser` | int | no | 0-32767. null = unlimited per user. |
| `promotionStatus` | enum | no | Default: `draft`. Values: `draft`, `pending_approval`, `active`, `expired`, `cancelled`, `rejected`. |
| `requiresApproval` | bool | no | Default: `false`. |
| `isActive` | bool | no | Default: `true`. |

**Example request**

```json
{
  "instructorId": 54,
  "promoCode": "SUMMER25",
  "discountType": "percentage",
  "discountValue": 30.00,
  "maxDiscountAmount": null,
  "minPurchaseAmount": null,
  "applicableTo": "all_my_courses",
  "validFrom": "2026-05-01T00:00:00+05:30",
  "validUntil": "2026-06-30T23:59:59+05:30",
  "usageLimit": null,
  "usagePerUser": 2,
  "promotionStatus": "draft",
  "requiresApproval": false,
  "isActive": true
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Instructor promotion created",
  "data": { "id": 1, "instructorId": 54, "promoCode": "SUMMER25", "..." : "..." }
}
```

#### 400 Validation Error

```json
{ "success": false, "message": "instructor_id 999 does not exist or is deleted." }
```

```json
{ "success": false, "message": "discountValue must be greater than 0." }
```

```json
{ "success": false, "message": "validFrom must be before validUntil." }
```

---

## 1.4 `PATCH /api/v1/instructor-promotions/:id`

Update an instructor promotion. `instructor_id` is **immutable** after creation.

**Request body** — at least one field required.

| Field | Type | Notes |
|---|---|---|
| `promoCode` | string | 1-100 chars. Pass `""` to clear. |
| `discountType` | enum | Immutable after creation. |
| `discountValue` | number | 0-99999999.99. |
| `maxDiscountAmount` | number | 0-99999999.99. |
| `minPurchaseAmount` | number | 0-99999999.99. |
| `applicableTo` | enum | |
| `validFrom` | datetime | |
| `validUntil` | datetime | |
| `usageLimit` | int | |
| `usagePerUser` | int | |
| `promotionStatus` | enum | |
| `requiresApproval` | bool | |
| `approvedBy` | int | Admin/super-admin only. User ID of approver. |
| `approvedAt` | datetime | Admin/super-admin only. Timestamp of approval. |
| `rejectionReason` | string | Admin/super-admin only. Max 1000 chars. |
| `isActive` | bool | |

### Responses

#### 200 OK

Returns the updated promotion (same shape as §1.2).

#### 400 Bad Request

```json
{ "success": false, "message": "validFrom must be before validUntil." }
```

#### 404 Not Found

```json
{ "success": false, "message": "promotion_id 999 does not exist or is deleted." }
```

---

## 1.5 `DELETE /api/v1/instructor-promotions/:id`

Soft-delete an instructor promotion. **Cascades** to all instructor_promotion_translations.

### Responses

#### 200 OK

```json
{ "success": true, "message": "Instructor promotion deleted", "data": { "id": 1, "deleted": true } }
```

#### 400 Bad Request

```json
{ "success": false, "message": "promotion_id 1 is already deleted." }
```

---

## 1.6 `POST /api/v1/instructor-promotions/:id/restore`

Restore a soft-deleted instructor promotion. **Cascades** restore to all translations. Validates parent instructor is not deleted.

### Responses

#### 200 OK

Returns the restored promotion (same shape as §1.2).

#### 400 Bad Request

```json
{ "success": false, "message": "Cannot restore promotion: parent instructor is deleted." }
```

```json
{ "success": false, "message": "promotion_id 1 is not deleted." }
```

---

## Common error responses (all endpoints)

| Status | When |
|---|---|
| `400` | Validation failure, constraint violation, or UDF error. |
| `401` | Missing or invalid JWT token. |
| `403` | User lacks the required permission. |
| `404` | Resource not found (GET /:id, PATCH /:id). |
| `409` | Duplicate entry (e.g., same promo code). |
| `500` | Internal server error. |
