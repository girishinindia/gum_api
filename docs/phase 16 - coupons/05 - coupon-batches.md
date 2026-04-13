# Phase 16 — Coupon Batches

Coupon batches link coupons to specific course batches. Each mapping defines which batch is included in a coupon's applicability scope, with display ordering.

Permission codes: `coupon_batch.read`, `coupon_batch.create`, `coupon_batch.update`, `coupon_batch.delete`, `coupon_batch.restore`.

- **Super-admin**: all 5 permissions.
- **Admin**: all except `coupon_batch.delete`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`**.

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§5.1](#51-get-apiv1couponsidnbatches) | `GET` | `/api/v1/coupons/:id/batches` | `coupon_batch.read` | List batch mappings for a coupon. |
| [§5.2](#52-get-apiv1couponsidbatchesbatchmapid) | `GET` | `/api/v1/coupons/:id/batches/:mapId` | `coupon_batch.read` | Get one batch mapping by ID. |
| [§5.3](#53-post-apiv1couponsidbatches) | `POST` | `/api/v1/coupons/:id/batches` | `coupon_batch.create` | Create a batch mapping. |
| [§5.4](#54-patch-apiv1couponsidbatchesbatchmapid) | `PATCH` | `/api/v1/coupons/:id/batches/:mapId` | `coupon_batch.update` | Update a batch mapping. |
| [§5.5](#55-delete-apiv1couponsidbatchesbatchmapid) | `DELETE` | `/api/v1/coupons/:id/batches/:mapId` | `coupon_batch.delete` | Soft-delete a batch mapping. |
| [§5.6](#56-post-apiv1couponsidbatchesbatchmapidrrestore) | `POST` | `/api/v1/coupons/:id/batches/:mapId/restore` | `coupon_batch.restore` | Restore a soft-deleted batch mapping. |

---

## 5.1 `GET /api/v1/coupons/:id/batches`

List all batch mappings for a specific coupon.

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `batchId` | int | — | Filter by batch. |
| `isActive` | bool | — | Filter by active/inactive mappings. |
| `searchTerm` | string | — | Search coupon code/slug or batch code/slug. |
| `sortColumn` | enum | `display_order` | `id`, `coupon_id`, `batch_id`, `display_order`, `created_at`, `updated_at`. |
| `sortDirection` | enum | `ASC` | `ASC` \| `DESC`. |

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
      "batchId": 3,
      "displayOrder": 1,
      "couponCode": "BATCH50",
      "couponSlug": "batch-discount-50",
      "couponDiscountType": "fixed",
      "couponDiscountValue": 500.00,
      "batchCode": "BATCH-APR-26",
      "batchSlug": "april-2026-batch",
      "batchStartsAt": "2026-04-15T09:00:00.000Z",
      "batchStatus": "active",
      "displayOrder": 1,
      "isActive": true,
      "createdAt": "2026-04-12T17:00:00.000Z",
      "updatedAt": "2026-04-12T17:00:00.000Z"
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

#### 404 Not Found

```json
{ "success": false, "message": "Coupon 999 not found" }
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
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/coupons/1/batches?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/coupons/1/batches?pageIndex=2&pageSize=20` |
| 3 | Custom page size (10) | `{{baseUrl}}/api/v1/coupons/1/batches?pageIndex=1&pageSize=10` |
| 4 | Custom page size (50) | `{{baseUrl}}/api/v1/coupons/1/batches?pageIndex=1&pageSize=50` |
| 5 | Filter by batchId=3 | `{{baseUrl}}/api/v1/coupons/1/batches?batchId=3` |
| 6 | Filter by batchId=7 | `{{baseUrl}}/api/v1/coupons/1/batches?batchId=7` |
| 7 | Filter by isActive=true | `{{baseUrl}}/api/v1/coupons/1/batches?isActive=true` |
| 8 | Filter by isActive=false | `{{baseUrl}}/api/v1/coupons/1/batches?isActive=false` |
| 9 | Search "BATCH" | `{{baseUrl}}/api/v1/coupons/1/batches?searchTerm=BATCH` |
| 10 | Sort by id ASC | `{{baseUrl}}/api/v1/coupons/1/batches?sortColumn=id&sortDirection=ASC` |
| 11 | Sort by id DESC | `{{baseUrl}}/api/v1/coupons/1/batches?sortColumn=id&sortDirection=DESC` |
| 12 | Sort by display_order ASC | `{{baseUrl}}/api/v1/coupons/1/batches?sortColumn=display_order&sortDirection=ASC` |
| 13 | Sort by display_order DESC | `{{baseUrl}}/api/v1/coupons/1/batches?sortColumn=display_order&sortDirection=DESC` |
| 14 | Sort by batch_id ASC | `{{baseUrl}}/api/v1/coupons/1/batches?sortColumn=batch_id&sortDirection=ASC` |
| 15 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/coupons/1/batches?sortColumn=created_at&sortDirection=DESC` |
| 16 | Sort by created_at ASC (oldest) | `{{baseUrl}}/api/v1/coupons/1/batches?sortColumn=created_at&sortDirection=ASC` |
| 17 | Sort by updated_at DESC | `{{baseUrl}}/api/v1/coupons/1/batches?sortColumn=updated_at&sortDirection=DESC` |
| 18 | Combo — active batches only | `{{baseUrl}}/api/v1/coupons/1/batches?isActive=true` |
| 19 | Combo — filter batch + active | `{{baseUrl}}/api/v1/coupons/1/batches?batchId=3&isActive=true` |
| 20 | Combo — custom size + sort + filter | `{{baseUrl}}/api/v1/coupons/1/batches?pageIndex=1&pageSize=10&isActive=true&sortColumn=display_order&sortDirection=ASC` |

---

## 5.2 `GET /api/v1/coupons/:id/batches/:mapId`

Get a single batch mapping by ID.

### Responses

#### 200 OK

Same shape as a single object in §5.1 `data[]`.

#### 404 Not Found

```json
{ "success": false, "message": "Coupon batch mapping 999 not found" }
```

---

## 5.3 `POST /api/v1/coupons/:id/batches`

Create a batch mapping for a coupon.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `batchId` | int | **yes** | Must reference existing, non-deleted batch. |
| `displayOrder` | int | no | 0-32767. Default: 0. Controls sort order in UI. |
| `isActive` | bool | no | Default: `true`. |

**Note**: `couponId` comes from the URL path parameter, NOT from the request body.

**Example request**

```json
{
  "batchId": 3,
  "displayOrder": 1,
  "isActive": true
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Coupon batch mapping created",
  "data": { "id": 1, "couponId": 1, "batchId": 3, "..." : "..." }
}
```

#### 400 Validation Error

```json
{ "success": false, "message": "batch_id 999 does not exist or is deleted." }
```

```json
{ "success": false, "message": "This batch is already mapped to this coupon." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Coupon 999 not found" }
```

---

## 5.4 `PATCH /api/v1/coupons/:id/batches/:mapId`

Update a batch mapping. `coupon_id` and `batch_id` are **immutable** after creation.

**Request body** — at least one field required.

| Field | Type | Notes |
|---|---|---|
| `displayOrder` | int | 0-32767. |
| `isActive` | bool | |

### Responses

#### 200 OK

Returns the updated batch mapping (same shape as §5.2).

#### 404 Not Found

```json
{ "success": false, "message": "Coupon batch mapping 999 not found" }
```

---

## 5.5 `DELETE /api/v1/coupons/:id/batches/:mapId`

Soft-delete a batch mapping.

### Responses

#### 200 OK

```json
{ "success": true, "message": "Coupon batch mapping deleted", "data": { "id": 1, "deleted": true } }
```

#### 400 Bad Request

```json
{ "success": false, "message": "batch_mapping_id 1 is already deleted." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Coupon batch mapping 999 not found" }
```

---

## 5.6 `POST /api/v1/coupons/:id/batches/:mapId/restore`

Restore a soft-deleted batch mapping. Validates parent coupon and batch are not deleted.

### Responses

#### 200 OK

Returns the restored batch mapping (same shape as §5.2).

#### 400 Bad Request

```json
{ "success": false, "message": "Cannot restore mapping: parent coupon is deleted." }
```

```json
{ "success": false, "message": "Cannot restore mapping: batch is deleted." }
```

```json
{ "success": false, "message": "batch_mapping_id 1 is not deleted." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Coupon batch mapping 999 not found" }
```

---

## Common error responses (all endpoints)

| Status | When |
|---|---|
| `400` | Validation failure, constraint violation, or UDF error. |
| `401` | Missing or invalid JWT token. |
| `403` | User lacks the required permission. |
| `404` | Resource not found (GET /:id, PATCH /:id). |
| `409` | Duplicate entry (e.g., batch already mapped to coupon). |
| `500` | Internal server error. |
