# Phase 16 — Coupon Webinars

Coupon webinars link coupons to specific webinars. Each mapping defines which webinar is included in a coupon's applicability scope, with display ordering.

Permission codes: `coupon_webinar.read`, `coupon_webinar.create`, `coupon_webinar.update`, `coupon_webinar.delete`, `coupon_webinar.restore`.

- **Super-admin**: all 5 permissions.
- **Admin**: all except `coupon_webinar.delete`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`**.

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§6.1](#61-get-apiv1couponsidwebinars) | `GET` | `/api/v1/coupons/:id/webinars` | `coupon_webinar.read` | List webinar mappings for a coupon. |
| [§6.2](#62-get-apiv1couponsidwebinarswebinarmapid) | `GET` | `/api/v1/coupons/:id/webinars/:mapId` | `coupon_webinar.read` | Get one webinar mapping by ID. |
| [§6.3](#63-post-apiv1couponsidwebinars) | `POST` | `/api/v1/coupons/:id/webinars` | `coupon_webinar.create` | Create a webinar mapping. |
| [§6.4](#64-patch-apiv1couponsidwebinarswebinarmapid) | `PATCH` | `/api/v1/coupons/:id/webinars/:mapId` | `coupon_webinar.update` | Update a webinar mapping. |
| [§6.5](#65-delete-apiv1couponsidwebinarswebinarmapid) | `DELETE` | `/api/v1/coupons/:id/webinars/:mapId` | `coupon_webinar.delete` | Soft-delete a webinar mapping. |
| [§6.6](#66-post-apiv1couponsidwebinarswebinarmapidrrestore) | `POST` | `/api/v1/coupons/:id/webinars/:mapId/restore` | `coupon_webinar.restore` | Restore a soft-deleted webinar mapping. |

---

## 6.1 `GET /api/v1/coupons/:id/webinars`

List all webinar mappings for a specific coupon.

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `webinarId` | int | — | Filter by webinar. |
| `isActive` | bool | — | Filter by active/inactive mappings. |
| `searchTerm` | string | — | Search coupon code/slug or webinar code/slug. |
| `sortColumn` | enum | `display_order` | `id`, `coupon_id`, `webinar_id`, `display_order`, `created_at`, `updated_at`. |
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
      "webinarId": 2,
      "displayOrder": 1,
      "couponCode": "WEBINAR20",
      "couponSlug": "webinar-discount-20",
      "couponDiscountType": "percentage",
      "couponDiscountValue": 20.00,
      "webinarCode": "WEBINAR-MAY",
      "webinarSlug": "may-live-session",
      "webinarPrice": 999.00,
      "webinarScheduledAt": "2026-05-20T14:00:00.000Z",
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
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/coupons/1/webinars?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/coupons/1/webinars?pageIndex=2&pageSize=20` |
| 3 | Custom page size (10) | `{{baseUrl}}/api/v1/coupons/1/webinars?pageIndex=1&pageSize=10` |
| 4 | Custom page size (50) | `{{baseUrl}}/api/v1/coupons/1/webinars?pageIndex=1&pageSize=50` |
| 5 | Filter by webinarId=2 | `{{baseUrl}}/api/v1/coupons/1/webinars?webinarId=2` |
| 6 | Filter by webinarId=8 | `{{baseUrl}}/api/v1/coupons/1/webinars?webinarId=8` |
| 7 | Filter by isActive=true | `{{baseUrl}}/api/v1/coupons/1/webinars?isActive=true` |
| 8 | Filter by isActive=false | `{{baseUrl}}/api/v1/coupons/1/webinars?isActive=false` |
| 9 | Search "WEBINAR" | `{{baseUrl}}/api/v1/coupons/1/webinars?searchTerm=WEBINAR` |
| 10 | Sort by id ASC | `{{baseUrl}}/api/v1/coupons/1/webinars?sortColumn=id&sortDirection=ASC` |
| 11 | Sort by id DESC | `{{baseUrl}}/api/v1/coupons/1/webinars?sortColumn=id&sortDirection=DESC` |
| 12 | Sort by display_order ASC | `{{baseUrl}}/api/v1/coupons/1/webinars?sortColumn=display_order&sortDirection=ASC` |
| 13 | Sort by display_order DESC | `{{baseUrl}}/api/v1/coupons/1/webinars?sortColumn=display_order&sortDirection=DESC` |
| 14 | Sort by webinar_id ASC | `{{baseUrl}}/api/v1/coupons/1/webinars?sortColumn=webinar_id&sortDirection=ASC` |
| 15 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/coupons/1/webinars?sortColumn=created_at&sortDirection=DESC` |
| 16 | Sort by created_at ASC (oldest) | `{{baseUrl}}/api/v1/coupons/1/webinars?sortColumn=created_at&sortDirection=ASC` |
| 17 | Sort by updated_at DESC | `{{baseUrl}}/api/v1/coupons/1/webinars?sortColumn=updated_at&sortDirection=DESC` |
| 18 | Combo — active webinars only | `{{baseUrl}}/api/v1/coupons/1/webinars?isActive=true` |
| 19 | Combo — filter webinar + active | `{{baseUrl}}/api/v1/coupons/1/webinars?webinarId=2&isActive=true` |
| 20 | Combo — custom size + sort + filter | `{{baseUrl}}/api/v1/coupons/1/webinars?pageIndex=1&pageSize=10&isActive=true&sortColumn=display_order&sortDirection=ASC` |

---

## 6.2 `GET /api/v1/coupons/:id/webinars/:mapId`

Get a single webinar mapping by ID.

### Responses

#### 200 OK

Same shape as a single object in §6.1 `data[]`.

#### 404 Not Found

```json
{ "success": false, "message": "Coupon webinar mapping 999 not found" }
```

---

## 6.3 `POST /api/v1/coupons/:id/webinars`

Create a webinar mapping for a coupon.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `webinarId` | int | **yes** | Must reference existing, non-deleted webinar. |
| `displayOrder` | int | no | 0-32767. Default: 0. Controls sort order in UI. |
| `isActive` | bool | no | Default: `true`. |

**Note**: `couponId` comes from the URL path parameter, NOT from the request body.

**Example request**

```json
{
  "webinarId": 2,
  "displayOrder": 1,
  "isActive": true
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Coupon webinar mapping created",
  "data": { "id": 1, "couponId": 1, "webinarId": 2, "..." : "..." }
}
```

#### 400 Validation Error

```json
{ "success": false, "message": "webinar_id 999 does not exist or is deleted." }
```

```json
{ "success": false, "message": "This webinar is already mapped to this coupon." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Coupon 999 not found" }
```

---

## 6.4 `PATCH /api/v1/coupons/:id/webinars/:mapId`

Update a webinar mapping. `coupon_id` and `webinar_id` are **immutable** after creation.

**Request body** — at least one field required.

| Field | Type | Notes |
|---|---|---|
| `displayOrder` | int | 0-32767. |
| `isActive` | bool | |

### Responses

#### 200 OK

Returns the updated webinar mapping (same shape as §6.2).

#### 404 Not Found

```json
{ "success": false, "message": "Coupon webinar mapping 999 not found" }
```

---

## 6.5 `DELETE /api/v1/coupons/:id/webinars/:mapId`

Soft-delete a webinar mapping.

### Responses

#### 200 OK

```json
{ "success": true, "message": "Coupon webinar mapping deleted", "data": { "id": 1, "deleted": true } }
```

#### 400 Bad Request

```json
{ "success": false, "message": "webinar_mapping_id 1 is already deleted." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Coupon webinar mapping 999 not found" }
```

---

## 6.6 `POST /api/v1/coupons/:id/webinars/:mapId/restore`

Restore a soft-deleted webinar mapping. Validates parent coupon and webinar are not deleted.

### Responses

#### 200 OK

Returns the restored webinar mapping (same shape as §6.2).

#### 400 Bad Request

```json
{ "success": false, "message": "Cannot restore mapping: parent coupon is deleted." }
```

```json
{ "success": false, "message": "Cannot restore mapping: webinar is deleted." }
```

```json
{ "success": false, "message": "webinar_mapping_id 1 is not deleted." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Coupon webinar mapping 999 not found" }
```

---

## Common error responses (all endpoints)

| Status | When |
|---|---|
| `400` | Validation failure, constraint violation, or UDF error. |
| `401` | Missing or invalid JWT token. |
| `403` | User lacks the required permission. |
| `404` | Resource not found (GET /:id, PATCH /:id). |
| `409` | Duplicate entry (e.g., webinar already mapped to coupon). |
| `500` | Internal server error. |
