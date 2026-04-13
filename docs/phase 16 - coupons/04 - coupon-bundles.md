# Phase 16 — Coupon Bundles

Coupon bundles link coupons to specific bundles. Each mapping defines which bundle is included in a coupon's applicability scope, with display ordering.

Permission codes: `coupon_bundle.read`, `coupon_bundle.create`, `coupon_bundle.update`, `coupon_bundle.delete`, `coupon_bundle.restore`.

- **Super-admin**: all 5 permissions.
- **Admin**: all except `coupon_bundle.delete`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`**.

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§4.1](#41-get-apiv1couponsidbundles) | `GET` | `/api/v1/coupons/:id/bundles` | `coupon_bundle.read` | List bundle mappings for a coupon. |
| [§4.2](#42-get-apiv1couponsidbundlesbundlemapid) | `GET` | `/api/v1/coupons/:id/bundles/:mapId` | `coupon_bundle.read` | Get one bundle mapping by ID. |
| [§4.3](#43-post-apiv1couponsidbundles) | `POST` | `/api/v1/coupons/:id/bundles` | `coupon_bundle.create` | Create a bundle mapping. |
| [§4.4](#44-patch-apiv1couponsidbundlesbundlemapid) | `PATCH` | `/api/v1/coupons/:id/bundles/:mapId` | `coupon_bundle.update` | Update a bundle mapping. |
| [§4.5](#45-delete-apiv1couponsidbundlesbundlemapid) | `DELETE` | `/api/v1/coupons/:id/bundles/:mapId` | `coupon_bundle.delete` | Soft-delete a bundle mapping. |
| [§4.6](#46-post-apiv1couponsidbundlesbundlemapidrrestore) | `POST` | `/api/v1/coupons/:id/bundles/:mapId/restore` | `coupon_bundle.restore` | Restore a soft-deleted bundle mapping. |

---

## 4.1 `GET /api/v1/coupons/:id/bundles`

List all bundle mappings for a specific coupon.

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `bundleId` | int | — | Filter by bundle. |
| `isActive` | bool | — | Filter by active/inactive mappings. |
| `searchTerm` | string | — | Search coupon code/slug or bundle code/slug. |
| `sortColumn` | enum | `display_order` | `id`, `coupon_id`, `bundle_id`, `display_order`, `created_at`, `updated_at`. |
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
      "bundleId": 5,
      "displayOrder": 1,
      "couponCode": "BUNDLE25",
      "couponSlug": "bundle-discount-25",
      "couponDiscountType": "percentage",
      "couponDiscountValue": 25.00,
      "bundleCode": "BUNDLE-FULL",
      "bundleSlug": "full-courses-bundle",
      "bundlePrice": 49999.00,
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
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/coupons/1/bundles?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/coupons/1/bundles?pageIndex=2&pageSize=20` |
| 3 | Custom page size (10) | `{{baseUrl}}/api/v1/coupons/1/bundles?pageIndex=1&pageSize=10` |
| 4 | Custom page size (50) | `{{baseUrl}}/api/v1/coupons/1/bundles?pageIndex=1&pageSize=50` |
| 5 | Filter by bundleId=5 | `{{baseUrl}}/api/v1/coupons/1/bundles?bundleId=5` |
| 6 | Filter by bundleId=10 | `{{baseUrl}}/api/v1/coupons/1/bundles?bundleId=10` |
| 7 | Filter by isActive=true | `{{baseUrl}}/api/v1/coupons/1/bundles?isActive=true` |
| 8 | Filter by isActive=false | `{{baseUrl}}/api/v1/coupons/1/bundles?isActive=false` |
| 9 | Search "BUNDLE" | `{{baseUrl}}/api/v1/coupons/1/bundles?searchTerm=BUNDLE` |
| 10 | Sort by id ASC | `{{baseUrl}}/api/v1/coupons/1/bundles?sortColumn=id&sortDirection=ASC` |
| 11 | Sort by id DESC | `{{baseUrl}}/api/v1/coupons/1/bundles?sortColumn=id&sortDirection=DESC` |
| 12 | Sort by display_order ASC | `{{baseUrl}}/api/v1/coupons/1/bundles?sortColumn=display_order&sortDirection=ASC` |
| 13 | Sort by display_order DESC | `{{baseUrl}}/api/v1/coupons/1/bundles?sortColumn=display_order&sortDirection=DESC` |
| 14 | Sort by bundle_id ASC | `{{baseUrl}}/api/v1/coupons/1/bundles?sortColumn=bundle_id&sortDirection=ASC` |
| 15 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/coupons/1/bundles?sortColumn=created_at&sortDirection=DESC` |
| 16 | Sort by created_at ASC (oldest) | `{{baseUrl}}/api/v1/coupons/1/bundles?sortColumn=created_at&sortDirection=ASC` |
| 17 | Sort by updated_at DESC | `{{baseUrl}}/api/v1/coupons/1/bundles?sortColumn=updated_at&sortDirection=DESC` |
| 18 | Combo — active bundles only | `{{baseUrl}}/api/v1/coupons/1/bundles?isActive=true` |
| 19 | Combo — filter bundle + active | `{{baseUrl}}/api/v1/coupons/1/bundles?bundleId=5&isActive=true` |
| 20 | Combo — custom size + sort + filter | `{{baseUrl}}/api/v1/coupons/1/bundles?pageIndex=1&pageSize=10&isActive=true&sortColumn=display_order&sortDirection=ASC` |

---

## 4.2 `GET /api/v1/coupons/:id/bundles/:mapId`

Get a single bundle mapping by ID.

### Responses

#### 200 OK

Same shape as a single object in §4.1 `data[]`.

#### 404 Not Found

```json
{ "success": false, "message": "Coupon bundle mapping 999 not found" }
```

---

## 4.3 `POST /api/v1/coupons/:id/bundles`

Create a bundle mapping for a coupon.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `bundleId` | int | **yes** | Must reference existing, non-deleted bundle. |
| `displayOrder` | int | no | 0-32767. Default: 0. Controls sort order in UI. |
| `isActive` | bool | no | Default: `true`. |

**Note**: `couponId` comes from the URL path parameter, NOT from the request body.

**Example request**

```json
{
  "bundleId": 5,
  "displayOrder": 1,
  "isActive": true
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Coupon bundle mapping created",
  "data": { "id": 1, "couponId": 1, "bundleId": 5, "..." : "..." }
}
```

#### 400 Validation Error

```json
{ "success": false, "message": "bundle_id 999 does not exist or is deleted." }
```

```json
{ "success": false, "message": "This bundle is already mapped to this coupon." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Coupon 999 not found" }
```

---

## 4.4 `PATCH /api/v1/coupons/:id/bundles/:mapId`

Update a bundle mapping. `coupon_id` and `bundle_id` are **immutable** after creation.

**Request body** — at least one field required.

| Field | Type | Notes |
|---|---|---|
| `displayOrder` | int | 0-32767. |
| `isActive` | bool | |

### Responses

#### 200 OK

Returns the updated bundle mapping (same shape as §4.2).

#### 404 Not Found

```json
{ "success": false, "message": "Coupon bundle mapping 999 not found" }
```

---

## 4.5 `DELETE /api/v1/coupons/:id/bundles/:mapId`

Soft-delete a bundle mapping.

### Responses

#### 200 OK

```json
{ "success": true, "message": "Coupon bundle mapping deleted", "data": { "id": 1, "deleted": true } }
```

#### 400 Bad Request

```json
{ "success": false, "message": "bundle_mapping_id 1 is already deleted." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Coupon bundle mapping 999 not found" }
```

---

## 4.6 `POST /api/v1/coupons/:id/bundles/:mapId/restore`

Restore a soft-deleted bundle mapping. Validates parent coupon and bundle are not deleted.

### Responses

#### 200 OK

Returns the restored bundle mapping (same shape as §4.2).

#### 400 Bad Request

```json
{ "success": false, "message": "Cannot restore mapping: parent coupon is deleted." }
```

```json
{ "success": false, "message": "Cannot restore mapping: bundle is deleted." }
```

```json
{ "success": false, "message": "bundle_mapping_id 1 is not deleted." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Coupon bundle mapping 999 not found" }
```

---

## Common error responses (all endpoints)

| Status | When |
|---|---|
| `400` | Validation failure, constraint violation, or UDF error. |
| `401` | Missing or invalid JWT token. |
| `403` | User lacks the required permission. |
| `404` | Resource not found (GET /:id, PATCH /:id). |
| `409` | Duplicate entry (e.g., bundle already mapped to coupon). |
| `500` | Internal server error. |
