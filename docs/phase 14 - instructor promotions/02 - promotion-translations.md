# Phase 14 — Promotion Translations

Promotion translations provide multilingual support for instructor promotions. Each translation belongs to a promotion and a language, containing the translated promotion name and description.

Permission codes: `instructor_promotion_translation.read`, `instructor_promotion_translation.create`, `instructor_promotion_translation.update`, `instructor_promotion_translation.delete`, `instructor_promotion_translation.restore`.

- **Super-admin**: all 5 permissions.
- **Admin**: all except `instructor_promotion_translation.delete`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`**.

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§2.1](#21-get-apiv1instructor-promotionsidtranslations) | `GET` | `/api/v1/instructor-promotions/:id/translations` | `instructor_promotion_translation.read` | List translations of a promotion. |
| [§2.2](#22-get-apiv1instructor-promotionsidtranslationstid) | `GET` | `/api/v1/instructor-promotions/:id/translations/:tid` | `instructor_promotion_translation.read` | Get one translation by ID. |
| [§2.3](#23-post-apiv1instructor-promotionsidtranslations) | `POST` | `/api/v1/instructor-promotions/:id/translations` | `instructor_promotion_translation.create` | Create a translation. |
| [§2.4](#24-patch-apiv1instructor-promotionsidtranslationstid) | `PATCH` | `/api/v1/instructor-promotions/:id/translations/:tid` | `instructor_promotion_translation.update` | Update a translation. |
| [§2.5](#25-delete-apiv1instructor-promotionsidtranslationstid) | `DELETE` | `/api/v1/instructor-promotions/:id/translations/:tid` | `instructor_promotion_translation.delete` | Soft-delete a translation. |
| [§2.6](#26-post-apiv1instructor-promotionsidtranslationstidrestore) | `POST` | `/api/v1/instructor-promotions/:id/translations/:tid/restore` | `instructor_promotion_translation.restore` | Restore a soft-deleted translation. |

---

## 2.1 `GET /api/v1/instructor-promotions/:id/translations`

List all translations for a specific instructor promotion.

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `sortColumn` | enum | `created_at` | `id`, `promotion_name`, `created_at`, `updated_at`. |
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
      "promotionId": 1,
      "languageId": 1,
      "promotionName": "Summer Sale 2026",
      "description": "Get 30% off all courses this summer. Limited time offer!",
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-12T17:00:00.000Z",
      "updatedAt": "2026-04-12T17:00:00.000Z",
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

#### 404 Not Found

```json
{ "success": false, "message": "Instructor promotion 999 not found" }
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
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/instructor-promotions/1/translations?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/instructor-promotions/1/translations?pageIndex=2&pageSize=20` |
| 3 | Custom page size (5) | `{{baseUrl}}/api/v1/instructor-promotions/1/translations?pageIndex=1&pageSize=5` |
| 4 | Custom page size (50) | `{{baseUrl}}/api/v1/instructor-promotions/1/translations?pageIndex=1&pageSize=50` |
| 5 | Sort by id ASC | `{{baseUrl}}/api/v1/instructor-promotions/1/translations?sortColumn=id&sortDirection=ASC` |
| 6 | Sort by id DESC | `{{baseUrl}}/api/v1/instructor-promotions/1/translations?sortColumn=id&sortDirection=DESC` |
| 7 | Sort by promotion_name ASC | `{{baseUrl}}/api/v1/instructor-promotions/1/translations?sortColumn=promotion_name&sortDirection=ASC` |
| 8 | Sort by promotion_name DESC | `{{baseUrl}}/api/v1/instructor-promotions/1/translations?sortColumn=promotion_name&sortDirection=DESC` |
| 9 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/instructor-promotions/1/translations?sortColumn=created_at&sortDirection=DESC` |
| 10 | Sort by created_at ASC (oldest) | `{{baseUrl}}/api/v1/instructor-promotions/1/translations?sortColumn=created_at&sortDirection=ASC` |
| 11 | Sort by updated_at DESC | `{{baseUrl}}/api/v1/instructor-promotions/1/translations?sortColumn=updated_at&sortDirection=DESC` |
| 12 | Sort by updated_at ASC | `{{baseUrl}}/api/v1/instructor-promotions/1/translations?sortColumn=updated_at&sortDirection=ASC` |
| 13 | Combo — sort + paginate (page 1, size 10) | `{{baseUrl}}/api/v1/instructor-promotions/1/translations?pageIndex=1&pageSize=10&sortColumn=promotion_name&sortDirection=ASC` |
| 14 | Combo — custom size + newer first | `{{baseUrl}}/api/v1/instructor-promotions/1/translations?pageIndex=1&pageSize=15&sortColumn=created_at&sortDirection=DESC` |
| 15 | Promotion 2 translations | `{{baseUrl}}/api/v1/instructor-promotions/2/translations` |

---

## 2.2 `GET /api/v1/instructor-promotions/:id/translations/:tid`

Get a single translation by translation ID.

### Responses

#### 200 OK

Same shape as a single object in §2.1 `data[]`.

#### 404 Not Found

```json
{ "success": false, "message": "Promotion translation 999 not found" }
```

---

## 2.3 `POST /api/v1/instructor-promotions/:id/translations`

Create a translation for an instructor promotion. One translation per language per promotion.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `languageId` | int | **yes** | Must reference active, non-deleted language. |
| `promotionName` | string | **yes** | 1-500 chars. |
| `description` | string | no | Up to 10,000 chars. |
| `isActive` | bool | no | Default: `true`. |

**Example request**

```json
{
  "languageId": 1,
  "promotionName": "Summer Sale 2026",
  "description": "Get 30% off all courses this summer. Limited time offer!",
  "isActive": true
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Promotion translation created",
  "data": { "id": 1, "..." : "..." }
}
```

#### 400 Bad Request

```json
{ "success": false, "message": "promotion_id 999 does not exist, is inactive, or is deleted." }
```

```json
{ "success": false, "message": "A translation for this promotion and language already exists." }
```

```json
{ "success": false, "message": "language_id 999 does not exist or is deleted." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Instructor promotion 999 not found" }
```

---

## 2.4 `PATCH /api/v1/instructor-promotions/:id/translations/:tid`

Update a translation. `promotion_id` and `language_id` are immutable. Text fields support clearing by sending empty string `""` (sets to NULL). `promotionName` is non-clearable — pass `null` to keep current.

**Request body** — at least one field required.

| Field | Type | Notes |
|---|---|---|
| `promotionName` | string | 1-500 chars. Non-clearable. |
| `description` | string | Up to 10,000 chars. Pass `""` to clear. |
| `isActive` | bool | |

### Responses

#### 200 OK

Returns the updated translation (same shape as §2.2).

#### 400 Bad Request

```json
{ "success": false, "message": "promotionName cannot be empty string. Use NULL to keep current value." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Promotion translation 999 not found" }
```

---

## 2.5 `DELETE /api/v1/instructor-promotions/:id/translations/:tid`

Soft-delete a single translation.

### Responses

#### 200 OK

```json
{ "success": true, "message": "Promotion translation deleted", "data": { "id": 1, "deleted": true } }
```

#### 400 Bad Request

```json
{ "success": false, "message": "translation_id 1 is already deleted." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Promotion translation 999 not found" }
```

---

## 2.6 `POST /api/v1/instructor-promotions/:id/translations/:tid/restore`

Restore a soft-deleted translation. Validates parent promotion is not deleted.

### Responses

#### 200 OK

Returns the restored translation (same shape as §2.2).

#### 400 Bad Request

```json
{ "success": false, "message": "Cannot restore translation: parent promotion is deleted." }
```

```json
{ "success": false, "message": "translation_id 1 is not deleted." }
```

#### 404 Not Found

```json
{ "success": false, "message": "Promotion translation 999 not found" }
```

---

## Common error responses (all endpoints)

| Status | When |
|---|---|
| `400` | Validation failure, constraint violation, or UDF error. |
| `401` | Missing or invalid JWT token. |
| `403` | User lacks the required permission. |
| `404` | Resource not found (GET /:id, PATCH /:id). |
| `409` | Duplicate entry (e.g., same promotion+language translation). |
| `500` | Internal server error. |
