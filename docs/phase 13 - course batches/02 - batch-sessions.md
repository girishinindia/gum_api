# Phase 13 — Batch Sessions

Batch sessions represent individual scheduled meetings within a course batch. Each session belongs to a batch, has a session number, date, scheduled time, duration, meeting details (URL, ID, recording), and status tracking. Sessions support multilingual translations (title + description). Sessions support soft-delete with cascade to translations and admin restore.

Permission codes: `batch_session.read`, `batch_session.create`, `batch_session.update`, `batch_session.delete`, `batch_session.restore`, `batch_session_translation.read`, `batch_session_translation.create`, `batch_session_translation.update`, `batch_session_translation.delete`, `batch_session_translation.restore`.

- **Super-admin**: all 10 permissions.
- **Admin**: all except `batch_session.delete` and `batch_session_translation.delete`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`**.

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§3.1](#31-get-apiv1course-batchesbatchidsessions) | `GET` | `/api/v1/course-batches/:batchId/sessions` | `batch_session.read` | List sessions for a batch with pagination, filter, sort. |
| [§3.2](#32-get-apiv1course-batchesbatchidsessionsid) | `GET` | `/api/v1/course-batches/:batchId/sessions/:id` | `batch_session.read` | Get one session by ID (includes deleted — phase-02 contract). |
| [§3.3](#33-post-apiv1course-batchesbatchidsessions) | `POST` | `/api/v1/course-batches/:batchId/sessions` | `batch_session.create` | Create a new session. |
| [§3.4](#34-patch-apiv1course-batchesbatchidsessionsid) | `PATCH` | `/api/v1/course-batches/:batchId/sessions/:id` | `batch_session.update` | Update a session. |
| [§3.5](#35-delete-apiv1course-batchesbatchidsessionsid) | `DELETE` | `/api/v1/course-batches/:batchId/sessions/:id` | `batch_session.delete` | Soft-delete (cascades to translations). |
| [§3.6](#36-post-apiv1course-batchesbatchidsessionsidrestore) | `POST` | `/api/v1/course-batches/:batchId/sessions/:id/restore` | `batch_session.restore` | Restore a soft-deleted session (cascades). |
| [§4.1](#41-get-apiv1course-batchesbatchidsessionssessionidtranslations) | `GET` | `/api/v1/course-batches/:batchId/sessions/:sessionId/translations` | `batch_session_translation.read` | List translations for a session. |
| [§4.2](#42-get-apiv1course-batchesbatchidsessionssessionidtranslationstid) | `GET` | `/api/v1/course-batches/:batchId/sessions/:sessionId/translations/:tid` | `batch_session_translation.read` | Get one session translation by ID. |
| [§4.3](#43-post-apiv1course-batchesbatchidsessionssessionidtranslations) | `POST` | `/api/v1/course-batches/:batchId/sessions/:sessionId/translations` | `batch_session_translation.create` | Create a session translation. |
| [§4.4](#44-patch-apiv1course-batchesbatchidsessionssessionidtranslationstid) | `PATCH` | `/api/v1/course-batches/:batchId/sessions/:sessionId/translations/:tid` | `batch_session_translation.update` | Update a session translation. |
| [§4.5](#45-delete-apiv1course-batchesbatchidsessionssessionidtranslationstid) | `DELETE` | `/api/v1/course-batches/:batchId/sessions/:sessionId/translations/:tid` | `batch_session_translation.delete` | Soft-delete a session translation. |
| [§4.6](#46-post-apiv1course-batchesbatchidsessionssessionidtranslationstidrestore) | `POST` | `/api/v1/course-batches/:batchId/sessions/:sessionId/translations/:tid/restore` | `batch_session_translation.restore` | Restore a soft-deleted session translation. |

---

## Enums reference

**session_status**: `scheduled`, `live`, `completed`, `cancelled`

---

## 3.1 `GET /api/v1/course-batches/:batchId/sessions`

List all sessions for a specific batch.

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `sessionStatus` | enum | — | `scheduled`, `live`, `completed`, `cancelled`. |
| `isDeleted` | bool | `false` | Include soft-deleted sessions. |
| `sortColumn` | enum | `created_at` | See **Sort columns** below. |
| `sortDirection` | enum | `DESC` | `ASC` \| `DESC`. |

**Sort columns reference:**

`id`, `batch_id`, `session_number`, `session_date`, `scheduled_at`, `session_status`, `display_order`, `created_at`, `updated_at`.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 1,
      "batchId": 1,
      "sessionNumber": 1,
      "sessionDate": "2026-05-01T00:00:00.000Z",
      "scheduledAt": "2026-05-01T09:00:00.000Z",
      "durationMinutes": 120,
      "meetingUrl": "https://zoom.us/j/9876543210",
      "meetingId": "9876543210",
      "recordingUrl": null,
      "sessionStatus": "scheduled",
      "displayOrder": 1,
      "createdBy": 54,
      "updatedBy": 54,
      "isDeleted": false,
      "createdAt": "2026-04-12T10:05:00.000Z",
      "updatedAt": "2026-04-12T10:05:00.000Z"
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
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/course-batches/1/sessions?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/course-batches/1/sessions?pageIndex=2&pageSize=20` |
| 3 | Custom page size (5) | `{{baseUrl}}/api/v1/course-batches/1/sessions?pageIndex=1&pageSize=5` |
| 4 | Filter by sessionStatus=scheduled | `{{baseUrl}}/api/v1/course-batches/1/sessions?sessionStatus=scheduled` |
| 5 | Filter by sessionStatus=live | `{{baseUrl}}/api/v1/course-batches/1/sessions?sessionStatus=live` |
| 6 | Filter by sessionStatus=completed | `{{baseUrl}}/api/v1/course-batches/1/sessions?sessionStatus=completed` |
| 7 | Filter by sessionStatus=cancelled | `{{baseUrl}}/api/v1/course-batches/1/sessions?sessionStatus=cancelled` |
| 8 | Filter by isDeleted=true | `{{baseUrl}}/api/v1/course-batches/1/sessions?isDeleted=true` |
| 9 | Sort by session_number ASC | `{{baseUrl}}/api/v1/course-batches/1/sessions?sortColumn=session_number&sortDirection=ASC` |
| 10 | Sort by session_date ASC (earliest) | `{{baseUrl}}/api/v1/course-batches/1/sessions?sortColumn=session_date&sortDirection=ASC` |
| 11 | Sort by session_date DESC (latest) | `{{baseUrl}}/api/v1/course-batches/1/sessions?sortColumn=session_date&sortDirection=DESC` |
| 12 | Sort by scheduled_at ASC | `{{baseUrl}}/api/v1/course-batches/1/sessions?sortColumn=scheduled_at&sortDirection=ASC` |
| 13 | Sort by session_status ASC | `{{baseUrl}}/api/v1/course-batches/1/sessions?sortColumn=session_status&sortDirection=ASC` |
| 14 | Sort by display_order ASC | `{{baseUrl}}/api/v1/course-batches/1/sessions?sortColumn=display_order&sortDirection=ASC` |
| 15 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/course-batches/1/sessions?sortColumn=created_at&sortDirection=DESC` |
| 16 | Sort by updated_at DESC | `{{baseUrl}}/api/v1/course-batches/1/sessions?sortColumn=updated_at&sortDirection=DESC` |
| 17 | Combo — scheduled sessions by date | `{{baseUrl}}/api/v1/course-batches/1/sessions?sessionStatus=scheduled&sortColumn=session_date&sortDirection=ASC` |
| 18 | Combo — completed sessions paginated | `{{baseUrl}}/api/v1/course-batches/1/sessions?pageIndex=1&pageSize=10&sessionStatus=completed&sortColumn=session_number&sortDirection=ASC` |

---

## 3.2 `GET /api/v1/course-batches/:batchId/sessions/:id`

Get a single batch session by ID. **Phase-02 contract**: returns the record even if soft-deleted.

### Responses

#### 200 OK

Same shape as a single object in §3.1 `data[]`.

#### 404 Not Found

```json
{ "success": false, "message": "Batch session 999 not found" }
```

---

## 3.3 `POST /api/v1/course-batches/:batchId/sessions`

Create a new session for a batch.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `sessionNumber` | int | **yes** | 0-32767. Unique within the batch. |
| `sessionDate` | date | **yes** | ISO 8601 date (YYYY-MM-DD). |
| `scheduledAt` | datetime | **yes** | ISO 8601 with timezone offset. |
| `durationMinutes` | int | no | Duration in minutes. Max 32767. |
| `meetingUrl` | string | no | Meeting join URL. Max 2000 chars. |
| `meetingId` | string | no | Platform meeting ID. Max 500 chars. |
| `recordingUrl` | string | no | Recording URL. Max 2000 chars. |
| `sessionStatus` | enum | no | Default: `scheduled`. Values: `scheduled`, `live`, `completed`, `cancelled`. |
| `displayOrder` | int | no | Default: 0. Max 32767. |

**Example request**

```json
{
  "sessionNumber": 1,
  "sessionDate": "2026-05-01",
  "scheduledAt": "2026-05-01T09:00:00+05:30",
  "durationMinutes": 120,
  "meetingUrl": "https://zoom.us/j/9876543210",
  "meetingId": "9876543210",
  "sessionStatus": "scheduled"
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Batch session created",
  "data": { "id": 1, "batchId": 1, "sessionNumber": 1, "..." : "..." }
}
```

#### 400 Validation Error

```json
{ "success": false, "message": "batch_id 999 does not exist or is deleted." }
```

---

## 3.4 `PATCH /api/v1/course-batches/:batchId/sessions/:id`

Update a batch session. `batch_id` and `session_number` are **immutable** after creation.

**Request body** — at least one field required.

| Field | Type | Notes |
|---|---|---|
| `sessionDate` | date | ISO 8601 date. |
| `scheduledAt` | datetime | |
| `durationMinutes` | int | |
| `meetingUrl` | string | Pass `""` to clear. |
| `meetingId` | string | Pass `""` to clear. |
| `recordingUrl` | string | Pass `""` to clear. |
| `sessionStatus` | enum | |
| `displayOrder` | int | |

### Responses

#### 200 OK

Returns the updated session (same shape as §3.2).

#### 404 Not Found

```json
{ "success": false, "message": "session_id 999 does not exist or is deleted." }
```

---

## 3.5 `DELETE /api/v1/course-batches/:batchId/sessions/:id`

Soft-delete a batch session. **Cascades** to all batch_session_translations.

### Responses

#### 200 OK

```json
{ "success": true, "message": "Batch session deleted", "data": { "id": 1, "deleted": true } }
```

#### 400 Bad Request

```json
{ "success": false, "message": "session_id 1 is already deleted." }
```

---

## 3.6 `POST /api/v1/course-batches/:batchId/sessions/:id/restore`

Restore a soft-deleted session. **Cascades** restore to all translations. Validates parent batch is not deleted.

### Responses

#### 200 OK

Returns the restored session (same shape as §3.2).

#### 400 Bad Request

```json
{ "success": false, "message": "Cannot restore session: parent batch is deleted." }
```

```json
{ "success": false, "message": "session_id 1 is not deleted." }
```

---

## 4.1 `GET /api/v1/course-batches/:batchId/sessions/:sessionId/translations`

List all translations for a specific batch session.

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | |
| `pageSize` | int | `20` | |
| `sortColumn` | enum | `created_at` | `id`, `title`, `created_at`, `updated_at`. |
| `sortDirection` | enum | `DESC` | |

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 1,
      "sessionId": 1,
      "languageId": 1,
      "title": "Session 1: Introduction to Python Basics",
      "description": "Cover Python syntax, variables, data types, and basic operations",
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-12T10:10:00.000Z",
      "updatedAt": "2026-04-12T10:10:00.000Z",
      "deletedAt": null,
      "languageName": "English",
      "languageIsoCode": "en",
      "languageNativeName": "English"
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 1, "totalPages": 1 }
}
```

### Saved examples to add in Postman

| # | Description | URL |
|---|---|---|
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/course-batches/1/sessions/1/translations?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/course-batches/1/sessions/1/translations?pageIndex=2&pageSize=20` |
| 3 | Sort by id ASC | `{{baseUrl}}/api/v1/course-batches/1/sessions/1/translations?sortColumn=id&sortDirection=ASC` |
| 4 | Sort by title ASC | `{{baseUrl}}/api/v1/course-batches/1/sessions/1/translations?sortColumn=title&sortDirection=ASC` |
| 5 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/course-batches/1/sessions/1/translations?sortColumn=created_at&sortDirection=DESC` |
| 6 | Sort by updated_at DESC | `{{baseUrl}}/api/v1/course-batches/1/sessions/1/translations?sortColumn=updated_at&sortDirection=DESC` |
| 7 | Custom page size (5) | `{{baseUrl}}/api/v1/course-batches/1/sessions/1/translations?pageIndex=1&pageSize=5` |
| 8 | Combo — sort + paginate | `{{baseUrl}}/api/v1/course-batches/1/sessions/1/translations?pageIndex=1&pageSize=10&sortColumn=title&sortDirection=ASC` |

---

## 4.2 `GET /api/v1/course-batches/:batchId/sessions/:sessionId/translations/:tid`

Get a single session translation by translation ID.

### Responses

#### 200 OK / 404 Not Found

Same as §3.2 pattern.

---

## 4.3 `POST /api/v1/course-batches/:batchId/sessions/:sessionId/translations`

Create a translation for a batch session. One translation per language per session.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `languageId` | int | **yes** | Must reference active, non-deleted language. |
| `title` | string | **yes** | 1-500 chars. |
| `description` | string | no | Up to 10,000 chars. |
| `isActive` | bool | no | Default: `true`. |

**Example request**

```json
{
  "languageId": 1,
  "title": "Session 1: Introduction to Python Basics",
  "description": "Cover Python syntax, variables, data types, and basic operations"
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Batch session translation created",
  "data": { "id": 1, "..." : "..." }
}
```

#### 400 Bad Request

```json
{ "success": false, "message": "batch_session_id 999 does not exist, is inactive, or is deleted." }
```

```json
{ "success": false, "message": "A translation for this session and language already exists." }
```

---

## 4.4 `PATCH /api/v1/course-batches/:batchId/sessions/:sessionId/translations/:tid`

Update a session translation. `batch_session_id` and `language_id` are immutable. `description` supports clearing by sending empty string `""` (sets to NULL). `title` is non-clearable — pass `null` to keep current.

**Request body** — at least one field required.

| Field | Type | Notes |
|---|---|---|
| `title` | string | 1-500 chars. |
| `description` | string | Pass `""` to clear. |
| `isActive` | bool | |

### Responses

#### 200 OK

Returns the updated translation.

#### 400 Bad Request

```json
{ "success": false, "message": "title cannot be empty string. Use NULL to keep current value." }
```

---

## 4.5 `DELETE /api/v1/course-batches/:batchId/sessions/:sessionId/translations/:tid`

Soft-delete a single session translation.

### Responses

#### 200 OK

```json
{ "success": true, "message": "Batch session translation deleted", "data": { "id": 1, "deleted": true } }
```

---

## 4.6 `POST /api/v1/course-batches/:batchId/sessions/:sessionId/translations/:tid/restore`

Restore a soft-deleted session translation. Validates parent session is not deleted.

### Responses

#### 200 OK

Returns the restored translation.

#### 400 Bad Request

```json
{ "success": false, "message": "Cannot restore translation: parent session is deleted." }
```

---

## Common error responses (all endpoints)

| Status | When |
|---|---|
| `400` | Validation failure, constraint violation, or UDF error. |
| `401` | Missing or invalid JWT token. |
| `403` | User lacks the required permission. |
| `404` | Resource not found (GET /:id, PATCH /:id). |
| `409` | Duplicate entry (e.g., same session+language translation). |
| `500` | Internal server error. |
