# Phase 2 — Education Levels

Hierarchical levels of education with optional display ordering.

All routes require auth. Permission codes: `education_level.read`, `education_level.create`, `education_level.update`, `education_level.delete`, `education_level.restore`.

All examples below use the Postman environment variables **`{{baseUrl}}`** (e.g. `http://localhost:3000`) and **`{{accessToken}}`** (a Super Admin JWT minted via `POST {{baseUrl}}/api/v1/auth/login`). Set these once on your Postman environment — see [§7 in 00 - overview](00%20-%20overview.md#7-postman-environment).

← [languages](04%20-%20languages.md) · **Next →** [walkthrough and index](06%20-%20walkthrough%20and%20index.md)

---

## Endpoint summary

Quick reference of every endpoint documented on this page. Section numbers link down to the detailed request/response contracts below.

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§5.1](#51) | `GET` | `{{baseUrl}}/api/v1/education-levels` | education_level.read | List education levels with filters and sort. |
| [§5.2](#52) | `GET` | `{{baseUrl}}/api/v1/education-levels/:id` | education_level.read | Get a single education level by id. |
| [§5.3](#53) | `POST` | `{{baseUrl}}/api/v1/education-levels` | education_level.create | Create a new education level. |
| [§5.4](#54) | `PATCH` | `{{baseUrl}}/api/v1/education-levels/:id` | education_level.update | Partial update. |
| [§5.5](#55) | `DELETE` | `{{baseUrl}}/api/v1/education-levels/:id` | education_level.delete | Soft-delete. |
| [§5.6](#56) | `POST` | `{{baseUrl}}/api/v1/education-levels/:id/restore` | education_level.restore | Undo a soft-delete. |

---

## 5.1 `GET /api/v1/education-levels`

List education levels.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/education-levels` |
| Permission | `education_level.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | Page number (1-based). |
| `pageSize` | int | `20` | Max `100`. |
| `searchTerm` | string | — | `ILIKE` across primary text columns. |
| `isActive` | bool | — | Filter by active status. |
| `isDeleted` | bool | — | Filter by soft-delete status. |
| `sortColumn` | enum | `id` | Whitelisted: `id`, `name`, `is_active`, `is_deleted`, `created_at`, `updated_at`. |
| `sortDirection` | enum | `ASC` | `ASC` / `DESC`. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 1,
      "name": "Example",
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-11T00:00:00.000Z",
      "updatedAt": "2026-04-11T00:00:00.000Z",
      "deletedAt": null
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "totalCount": 1,
    "totalPages": 1
  }
}
```

#### 400 VALIDATION_ERROR

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [{"code": "invalid_enum_value", "path": ["sortColumn"], "message": "Invalid enum value"}]
}
```

#### 401 UNAUTHORIZED

```json
{
  "success": false,
  "message": "Missing or invalid access token",
  "code": "UNAUTHORIZED"
}
```

#### 403 FORBIDDEN

```json
{
  "success": false,
  "message": "Permission denied: education_level.read",
  "code": "FORBIDDEN"
}
```


### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/...` — method, headers and auth stay the same as the base request above.

| Example name | Query string |
|---|---|
| Page 1 (defaults) | `?pageIndex=1&pageSize=20` |
| Page 2, default size | `?pageIndex=2&pageSize=20` |
| Page 1, small page (5 rows) | `?pageIndex=1&pageSize=5` |
| Page 1, large page (100 rows) | `?pageIndex=1&pageSize=100` |
| Page 3, large page | `?pageIndex=3&pageSize=100` |
| Out-of-range page (returns empty `data`) | `?pageIndex=9999&pageSize=20` |
| Search name — `bachelor` | `?searchTerm=bachelor` |
| Search + pagination | `?pageIndex=1&pageSize=50&searchTerm=bachelor` |
| Active only | `?isActive=true` |
| Inactive only | `?isActive=false` |
| Deleted only | `?isDeleted=true` |
| Non-deleted only | `?isDeleted=false` |
| Sort by `id` ASC | `?sortColumn=id&sortDirection=ASC` |
| Sort by `name` ASC | `?sortColumn=name&sortDirection=ASC` |
| Sort by `is_active` DESC | `?sortColumn=is_active&sortDirection=DESC` |
| Sort by `is_deleted` DESC | `?sortColumn=is_deleted&sortDirection=DESC` |
| Sort by `created_at` DESC | `?sortColumn=created_at&sortDirection=DESC` |
| Sort by `updated_at` DESC | `?sortColumn=updated_at&sortDirection=DESC` |
| Combo — active, sorted by name, page 1 | `?pageIndex=1&pageSize=50&isActive=true&sortColumn=name&sortDirection=ASC` |

---

## 5.2 `GET /api/v1/education-levels/:id`

Read a single education level by id.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/education-levels/:id` |
| Permission | `education_level.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric education level id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 1,
    "name": "Example",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-11T00:00:00.000Z",
    "updatedAt": "2026-04-11T00:00:00.000Z",
    "deletedAt": null
  }
}
```

#### 400 VALIDATION_ERROR

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [{"path": "id", "message": "Expected number, received nan", "code": "invalid_type"}]
}
```

#### 401 UNAUTHORIZED

Same as 5.1.

#### 403 FORBIDDEN

```json
{"success": false, "message": "Permission denied: education_level.read", "code": "FORBIDDEN"}
```

#### 404 NOT_FOUND

```json
{"success": false, "message": "Education Level 9999 not found", "code": "NOT_FOUND"}
```

---

## 5.3 `POST /api/v1/education-levels`

Create a education level. Permission: `education_level.create`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/education-levels` |
| Permission | `education_level.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** (`application/json`)

```json
{
  "name": "Example",
  "isActive": true
}
```

**Required fields**: `name`.

**Optional fields**: `isActive` (defaults to **`false`** — see [§6 in 00 - overview](00%20-%20overview.md#6-active-flag-defaults)).

### Responses

#### 201 CREATED

```json
{
  "success": true,
  "message": "Education Level created",
  "data": {
    "id": 1,
    "name": "Example",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-11T00:00:00.000Z",
    "updatedAt": "2026-04-11T00:00:00.000Z",
    "deletedAt": null
  }
}
```

#### 400 VALIDATION_ERROR

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [{"path": "name", "message": "Required", "code": "invalid_type"}]
}
```

#### 401 UNAUTHORIZED

```json
{"success": false, "message": "Missing or invalid access token", "code": "UNAUTHORIZED"}
```

#### 403 FORBIDDEN

```json
{"success": false, "message": "Permission denied: education_level.create", "code": "FORBIDDEN"}
```

#### 409 DUPLICATE_ENTRY

```json
{
  "success": false,
  "message": "Education Level with that name already exists",
  "code": "DUPLICATE_ENTRY"
}
```

---

## 5.4 `PATCH /api/v1/education-levels/:id`

Partial update.

**Postman request**

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/education-levels/:id` |
| Permission | `education_level.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric education level id. |

**Request body** (`application/json`)

```json
{
  "name": "Updated Name",
  "isActive": true
}
```

### Responses

#### 200 OK

Same row shape as 5.2, wrapped in success envelope.

#### 400 VALIDATION_ERROR — empty body

```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [{"path": "", "message": "Provide at least one field to update", "code": "custom"}]
}
```

#### 401 UNAUTHORIZED / 403 FORBIDDEN

Same as 5.3.

#### 404 NOT_FOUND

```json
{"success": false, "message": "Education Level 9999 not found", "code": "NOT_FOUND"}
```

#### 409 DUPLICATE_ENTRY

```json
{"success": false, "message": "Education Level with that name already exists", "code": "DUPLICATE_ENTRY"}
```

---

## 5.5 `DELETE /api/v1/education-levels/:id`

Soft delete. Permission: `education_level.delete`.

**Postman request**

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/education-levels/:id` |
| Permission | `education_level.delete` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric education level id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Education Level deleted",
  "data": {"id": 1, "deleted": true}
}
```

#### 400 BAD_REQUEST — already deleted

```json
{
  "success": false,
  "message": "Education Level with ID 1 does not exist or is already deleted.",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED / 403 FORBIDDEN

Same as 5.3.

#### 404 NOT_FOUND

```json
{"success": false, "message": "Education Level 9999 not found", "code": "NOT_FOUND"}
```

---

## 5.6 `POST /api/v1/education-levels/:id/restore`

Reverse a soft delete. Permission: `education_level.restore`.

**Postman request**

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/education-levels/:id/restore` |
| Permission | `education_level.restore` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Path params**

| Name | Type | Notes |
|---|---|---|
| `id` | int | Numeric education level id. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Education Level restored",
  "data": {
    "id": 1,
    "name": "Example",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-11T00:00:00.000Z",
    "updatedAt": "2026-04-11T00:00:00.000Z",
    "deletedAt": null
  }
}
```

#### 400 BAD_REQUEST — not deleted

```json
{
  "success": false,
  "message": "Education Level with ID 1 is not deleted or does not exist.",
  "code": "BAD_REQUEST"
}
```

#### 401 UNAUTHORIZED / 403 FORBIDDEN

Same as 5.3.

#### 404 NOT_FOUND

```json
{"success": false, "message": "Education Level 9999 not found", "code": "NOT_FOUND"}
```

---

## Common errors across all education levels routes

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | zod rejected query, params, or body. |
| 400 | `BAD_REQUEST` | Business-rule violation (e.g., already-deleted row on restore). |
| 401 | `UNAUTHORIZED` | Missing or expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No education level with that id. |
| 409 | `DUPLICATE_ENTRY` | Name or code clashes with another non-deleted education level. |
| 429 | `RATE_LIMIT_EXCEEDED` | Global rate-limit tripped (default `100 / 15m`). |
| 500 | `INTERNAL_ERROR` | Unhandled exception; production response omits the stack. |
