# Phase 16 — Coupon Courses

Coupon-course mappings create junction relationships between coupons and courses, enabling specific applicability of coupons to individual courses. Each mapping includes a display order for sorting and supports soft-delete with admin restore.

Permission codes: `coupon_course.read`, `coupon_course.create`, `coupon_course.update`, `coupon_course.delete`, `coupon_course.restore`.

- **Super-admin**: all 5 permissions.
- **Admin**: all except `coupon_course.delete`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`**.

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§3.1](#31-get-apiv1couponsidcourses) | `GET` | `/api/v1/coupons/:id/courses` | `coupon_course.read` | List coupon-course mappings. |
| [§3.2](#32-get-apiv1couponsidcoursesmapid) | `GET` | `/api/v1/coupons/:id/courses/:mapId` | `coupon_course.read` | Get one mapping by ID. |
| [§3.3](#33-post-apiv1couponsidcourses) | `POST` | `/api/v1/coupons/:id/courses` | `coupon_course.create` | Create a coupon-course mapping. |
| [§3.4](#34-patch-apiv1couponsidcoursesmapid) | `PATCH` | `/api/v1/coupons/:id/courses/:mapId` | `coupon_course.update` | Update a mapping. |
| [§3.5](#35-delete-apiv1couponsidcoursesmapid) | `DELETE` | `/api/v1/coupons/:id/courses/:mapId` | `coupon_course.delete` | Soft-delete a mapping. |
| [§3.6](#36-post-apiv1couponsidcoursesmapidrestore) | `POST` | `/api/v1/coupons/:id/courses/:mapId/restore` | `coupon_course.restore` | Restore a soft-deleted mapping. |

---

## 3.1 `GET /api/v1/coupons/:id/courses`

List all coupon-course mappings.

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `courseId` | int | — | Filter by course ID. |
| `isActive` | bool | — | Filter by active status. |
| `searchTerm` | string | — | Searches coupon code/slug, course code/slug (ILIKE). |
| `sortColumn` | enum | `display_order` | `id`, `coupon_id`, `course_id`, `display_order`, `created_at`, `updated_at`. |
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
      "courseId": 5,
      "couponCode": "SUMMER2024",
      "couponSlug": "summer2024",
      "couponDiscountType": "percentage",
      "couponDiscountValue": 20.00,
      "courseCode": "WEB101",
      "courseSlug": "web-design-101",
      "coursePrice": 4999.00,
      "displayOrder": 0,
      "isActive": true,
      "createdAt": "2026-04-12T10:30:00.000Z"
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
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/coupons/1/courses?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/coupons/1/courses?pageIndex=2&pageSize=20` |
| 3 | Custom page size (10) | `{{baseUrl}}/api/v1/coupons/1/courses?pageIndex=1&pageSize=10` |
| 4 | Filter by courseId=5 | `{{baseUrl}}/api/v1/coupons/1/courses?courseId=5` |
| 5 | Filter by isActive=true | `{{baseUrl}}/api/v1/coupons/1/courses?isActive=true` |
| 6 | Filter by isActive=false | `{{baseUrl}}/api/v1/coupons/1/courses?isActive=false` |
| 7 | Search — "WEB101" | `{{baseUrl}}/api/v1/coupons/1/courses?searchTerm=WEB101` |
| 8 | Search — "web" | `{{baseUrl}}/api/v1/coupons/1/courses?searchTerm=web` |
| 9 | Sort by display_order ASC (default) | `{{baseUrl}}/api/v1/coupons/1/courses?sortColumn=display_order&sortDirection=ASC` |
| 10 | Sort by display_order DESC | `{{baseUrl}}/api/v1/coupons/1/courses?sortColumn=display_order&sortDirection=DESC` |
| 11 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/coupons/1/courses?sortColumn=created_at&sortDirection=DESC` |
| 12 | Combo — active courses sorted by order | `{{baseUrl}}/api/v1/coupons/1/courses?isActive=true&sortColumn=display_order&sortDirection=ASC` |
| 13 | Combo — search + filter + paginate | `{{baseUrl}}/api/v1/coupons/1/courses?pageIndex=1&pageSize=10&courseId=5&searchTerm=web` |

---

## 3.2 `GET /api/v1/coupons/:id/courses/:mapId`

Get a single coupon-course mapping by ID.

### Responses

#### 200 OK

Same shape as a single object in §3.1 `data[]`.

#### 404 Not Found

```json
{ "success": false, "message": "Mapping 999 not found" }
```

```json
{ "success": false, "message": "Coupon 999 not found" }
```

---

## 3.3 `POST /api/v1/coupons/:id/courses`

Create a new coupon-course mapping.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `courseId` | int | **yes** | Must reference an existing, non-deleted course. |
| `displayOrder` | int | no | Default: 0. Sort order for display. 0-32767. |
| `isActive` | bool | no | Default: `true`. |

**Example request**

```json
{
  "courseId": 5,
  "displayOrder": 0,
  "isActive": true
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Coupon-course mapping created",
  "data": { "id": 1, "couponId": 1, "courseId": 5, "couponCode": "SUMMER2024", "..." : "..." }
}
```

#### 400 Validation Error

```json
{ "success": false, "message": "courseId is required." }
```

```json
{ "success": false, "message": "courseId 999 does not exist or is deleted." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Coupon 999 not found" }
```

#### 409 Conflict

```json
{ "success": false, "message": "Mapping for coupon 1 and course 5 already exists." }
```

#### 422 Unprocessable Entity

```json
{ "success": false, "message": "displayOrder must be between 0 and 32767." }
```

---

## 3.4 `PATCH /api/v1/coupons/:id/courses/:mapId`

Update a coupon-course mapping. At least one field required.

**Request body**

| Field | Type | Notes |
|---|---|---|
| `displayOrder` | int | 0-32767. |
| `isActive` | bool | |

**Example request**

```json
{
  "displayOrder": 1,
  "isActive": true
}
```

### Responses

#### 200 OK

Returns the updated mapping (same shape as §3.2).

```json
{
  "success": true,
  "message": "Coupon-course mapping updated",
  "data": { "id": 1, "couponId": 1, "courseId": 5, "displayOrder": 1, "..." : "..." }
}
```

#### 400 Bad Request

```json
{ "success": false, "message": "At least one field is required for update." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Mapping 999 not found" }
```

```json
{ "success": false, "message": "Coupon 999 not found" }
```

#### 422 Unprocessable Entity

```json
{ "success": false, "message": "displayOrder must be between 0 and 32767." }
```

---

## 3.5 `DELETE /api/v1/coupons/:id/courses/:mapId`

Soft-delete a coupon-course mapping.

### Responses

#### 200 OK

```json
{ "success": true, "message": "Coupon-course mapping deleted", "data": { "id": 1, "deleted": true } }
```

#### 400 Bad Request

```json
{ "success": false, "message": "Mapping 1 is already deleted." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Mapping 999 not found" }
```

```json
{ "success": false, "message": "Coupon 999 not found" }
```

---

## 3.6 `POST /api/v1/coupons/:id/courses/:mapId/restore`

Restore a soft-deleted coupon-course mapping. Validates parent coupon and course are not deleted.

### Responses

#### 200 OK

Returns the restored mapping (same shape as §3.2).

```json
{
  "success": true,
  "message": "Coupon-course mapping restored",
  "data": { "id": 1, "couponId": 1, "courseId": 5, "..." : "..." }
}
```

#### 400 Bad Request

```json
{ "success": false, "message": "Cannot restore mapping: parent coupon is deleted." }
```

```json
{ "success": false, "message": "Cannot restore mapping: parent course is deleted." }
```

```json
{ "success": false, "message": "Mapping 1 is not deleted." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Mapping 999 not found" }
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
| `409` | Duplicate entry (e.g., same coupon-course pair). |
| `422` | Unprocessable entity (validation constraint). |
| `500` | Internal server error. |
