# Phase 10 — Ordering Questions

Ordering Questions represent sequential ordering question items in the question bank. Each question is tied to a topic and contains multiple items to order (each with a correct position). Each item and question text can have translations in multiple languages, with support for text and/or images. Questions, translations, items, and item translations all support soft-delete with admin restore. All routes require authentication.

Permission codes: `ordering_question.create`, `ordering_question.read`, `ordering_question.update`, `ordering_question.delete`, `ordering_question.restore`, `ordering_question_translation.create`, `ordering_question_translation.update`, `ordering_question_translation.delete`, `ordering_question_translation.restore`, `ordering_item.create`, `ordering_item.update`, `ordering_item.delete`, `ordering_item.restore`, `ordering_item_translation.create`, `ordering_item_translation.update`, `ordering_item_translation.delete`, `ordering_item_translation.restore`.

- **Super-admin**: all 16 permissions.
- **Admin**: all except `*.delete` (no delete on question/translation/item/item-translation; only soft-delete via DELETE endpoint which still requires `*.delete` permission).

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](../00%20-%20overview.md#8-postman-environment).

← [back to Phase 10](./00%20-%20overview.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1ordering-questions) | `GET` | `{{baseUrl}}/api/v1/ordering-questions` | `ordering_question.read` | List all ordering questions with pagination, search, filter, and sort. |
| [§1.2](#12-get-apiv1ordering-questionsid) | `GET` | `{{baseUrl}}/api/v1/ordering-questions/:id` | `ordering_question.read` | Get one ordering question by translation ID (returns joined question+translation+language data). |
| [§1.3](#13-post-apiv1ordering-questions) | `POST` | `{{baseUrl}}/api/v1/ordering-questions` | `ordering_question.create` | Create a new ordering question. |
| [§1.4](#14-patch-apiv1ordering-questionsid) | `PATCH` | `{{baseUrl}}/api/v1/ordering-questions/:id` | `ordering_question.update` | Update an ordering question by ID. |
| [§1.5](#15-delete-apiv1ordering-questionsid) | `DELETE` | `{{baseUrl}}/api/v1/ordering-questions/:id` | `ordering_question.delete` | Cascade soft-delete an ordering question (question → translations → items → item translations). |
| [§1.6](#16-post-apiv1ordering-questionsidrestore) | `POST` | `{{baseUrl}}/api/v1/ordering-questions/:id/restore` | `ordering_question.restore` | Cascade restore an ordering question, validates parent topic not deleted. |
| [§2.1](#21-post-apiv1ordering-question-translations) | `POST` | `{{baseUrl}}/api/v1/ordering-question-translations` | `ordering_question_translation.create` | Create a translation for an ordering question. |
| [§2.2](#22-patch-apiv1ordering-question-translationsid) | `PATCH` | `{{baseUrl}}/api/v1/ordering-question-translations/:id` | `ordering_question_translation.update` | Update a question translation. |
| [§2.3](#23-delete-apiv1ordering-question-translationsid) | `DELETE` | `{{baseUrl}}/api/v1/ordering-question-translations/:id` | `ordering_question_translation.delete` | Soft-delete a question translation. |
| [§2.4](#24-post-apiv1ordering-question-translationsidrestore) | `POST` | `{{baseUrl}}/api/v1/ordering-question-translations/:id/restore` | `ordering_question_translation.restore` | Restore a question translation, validates parent question not deleted. |
| [§3.1](#31-post-apiv1ordering-items) | `POST` | `{{baseUrl}}/api/v1/ordering-items` | `ordering_item.create` | Create a new item in an ordering question. |
| [§3.2](#32-patch-apiv1ordering-itemsid) | `PATCH` | `{{baseUrl}}/api/v1/ordering-items/:id` | `ordering_item.update` | Update an item by ID. |
| [§3.3](#33-delete-apiv1ordering-itemsid) | `DELETE` | `{{baseUrl}}/api/v1/ordering-items/:id` | `ordering_item.delete` | Cascade soft-delete an item (item → item translations). |
| [§3.4](#34-post-apiv1ordering-itemsidrestore) | `POST` | `{{baseUrl}}/api/v1/ordering-items/:id/restore` | `ordering_item.restore` | Cascade restore an item, validates parent question not deleted. |
| [§4.1](#41-post-apiv1ordering-item-translations) | `POST` | `{{baseUrl}}/api/v1/ordering-item-translations` | `ordering_item_translation.create` | Create a translation for an item. |
| [§4.2](#42-patch-apiv1ordering-item-translationsid) | `PATCH` | `{{baseUrl}}/api/v1/ordering-item-translations/:id` | `ordering_item_translation.update` | Update an item translation. |
| [§4.3](#43-delete-apiv1ordering-item-translationsid) | `DELETE` | `{{baseUrl}}/api/v1/ordering-item-translations/:id` | `ordering_item_translation.delete` | Soft-delete an item translation. |
| [§4.4](#44-post-apiv1ordering-item-translationsidrestore) | `POST` | `{{baseUrl}}/api/v1/ordering-item-translations/:id/restore` | `ordering_item_translation.restore` | Restore an item translation, validates parent item not deleted. |

---

## 1.1 `GET /api/v1/ordering-questions`

List all ordering questions with support for pagination, search, filtering, and sorting. Results include denormalized question, translation, and language metadata.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/ordering-questions` |
| Permission | `ordering_question.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number (for UI convenience). |
| `pageSize` | int | `25` | 1..500. |
| `orderingQuestionId` | int | — | Filter by ordering_questions.id. |
| `languageId` | int | — | Filter by ordering_question_translations.language_id. |
| `topicId` | int | — | Filter by ordering_questions.topic_id. |
| `difficultyLevel` | enum | — | Filter by difficulty_level: `easy`, `medium`, `hard`. |
| `isMandatory` | bool | — | Filter by is_mandatory flag. |
| `partialScoring` | bool | — | Filter by partial_scoring flag. |
| `isActive` | bool | — | Filter by question is_active flag. |
| `filterIsActive` | bool | — | Filter by translation is_active flag. |
| `searchTerm` | string | — | `ILIKE` across question_text, explanation, hint, code. |
| `sortTable` | enum | `translation` | Sort by `question` (base table) or `translation` (translation table). |
| `sortColumn` | enum | `created_at` | See [sort columns table](#sort-columns-reference) below. |
| `sortDirection` | enum | `DESC` | `ASC` \| `DESC`. |

**Sort columns reference:**

When `sortTable=question`: `id`, `topic_id`, `code`, `slug`, `points`, `partial_scoring`, `display_order`, `difficulty_level`, `created_at`, `updated_at`.

When `sortTable=translation`: `id`, `question_text`, `explanation`, `hint`, `created_at`, `updated_at`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "translationId": 1,
      "orderingQuestionId": 1,
      "languageId": 1,
      "questionText": "Arrange these events in chronological order.",
      "explanation": "Start with the earliest event and proceed to the most recent.",
      "hint": "Consider historical timeline context",
      "image1": "https://cdn.example.com/timeline-1.webp",
      "image2": null,
      "translationIsActive": true,
      "translationCreatedAt": "2026-04-12T11:18:42.447Z",
      "translationUpdatedAt": "2026-04-12T11:18:42.447Z",
      "questionId": 1,
      "topicId": 5,
      "code": "OQ001",
      "slug": "arrange-events-chronological",
      "points": 10,
      "partialScoring": true,
      "displayOrder": 1,
      "difficultyLevel": "medium",
      "isMandatory": true,
      "createdBy": 10,
      "updatedBy": 10,
      "questionIsActive": true,
      "questionCreatedAt": "2026-04-12T11:18:42.447Z",
      "questionUpdatedAt": "2026-04-12T11:18:42.447Z",
      "langId": 1,
      "langName": "English",
      "langCode": "en",
      "langIsActive": true,
      "itemCount": 4
    },
    {
      "translationId": 2,
      "orderingQuestionId": 2,
      "languageId": 1,
      "questionText": "Arrange these steps in correct order.",
      "explanation": "Follow the logical sequence of steps.",
      "hint": "Think about dependencies between steps",
      "image1": null,
      "image2": null,
      "translationIsActive": true,
      "translationCreatedAt": "2026-04-12T11:20:15.892Z",
      "translationUpdatedAt": "2026-04-12T11:20:15.892Z",
      "questionId": 2,
      "topicId": 6,
      "code": "OQ002",
      "slug": "arrange-steps-correct-order",
      "points": 8,
      "partialScoring": false,
      "displayOrder": 2,
      "difficultyLevel": "hard",
      "isMandatory": false,
      "createdBy": 10,
      "updatedBy": 10,
      "questionIsActive": true,
      "questionCreatedAt": "2026-04-12T11:20:15.892Z",
      "questionUpdatedAt": "2026-04-12T11:20:15.892Z",
      "langId": 1,
      "langName": "English",
      "langCode": "en",
      "langIsActive": true,
      "itemCount": 5
    }
  ],
  "meta": { "page": 1, "limit": 25, "totalCount": 47, "totalPages": 2 }
}
```

#### 403 Forbidden — caller lacks `ordering_question.read`

```json
{
  "success": false,
  "message": "Missing required permission: ordering_question.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

| # | Description | URL |
|---|---|---|
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/ordering-questions?pageIndex=1&pageSize=25` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/ordering-questions?pageIndex=2&pageSize=25` |
| 3 | Filter by topicId=5 | `{{baseUrl}}/api/v1/ordering-questions?topicId=5` |
| 4 | Filter by difficultyLevel=easy | `{{baseUrl}}/api/v1/ordering-questions?difficultyLevel=easy` |
| 5 | Filter by difficultyLevel=medium | `{{baseUrl}}/api/v1/ordering-questions?difficultyLevel=medium` |
| 6 | Filter by difficultyLevel=hard | `{{baseUrl}}/api/v1/ordering-questions?difficultyLevel=hard` |
| 7 | Filter by isMandatory=true | `{{baseUrl}}/api/v1/ordering-questions?isMandatory=true` |
| 8 | Filter by partialScoring=true | `{{baseUrl}}/api/v1/ordering-questions?partialScoring=true` |
| 9 | Filter by isActive=true | `{{baseUrl}}/api/v1/ordering-questions?isActive=true` |
| 10 | Filter by languageId=1 | `{{baseUrl}}/api/v1/ordering-questions?languageId=1` |
| 11 | Search — "chronological" | `{{baseUrl}}/api/v1/ordering-questions?searchTerm=chronological` |
| 12 | Search — "OQ001" | `{{baseUrl}}/api/v1/ordering-questions?searchTerm=OQ001` |
| 13 | Filter topicId + difficulty | `{{baseUrl}}/api/v1/ordering-questions?topicId=5&difficultyLevel=medium` |
| 14 | Filter mandatory + partialScoring | `{{baseUrl}}/api/v1/ordering-questions?isMandatory=true&partialScoring=true` |
| 15 | Sort by question id ASC | `{{baseUrl}}/api/v1/ordering-questions?sortTable=question&sortColumn=id&sortDirection=ASC` |
| 16 | Sort by question id DESC | `{{baseUrl}}/api/v1/ordering-questions?sortTable=question&sortColumn=id&sortDirection=DESC` |
| 17 | Sort by difficulty_level ASC | `{{baseUrl}}/api/v1/ordering-questions?sortTable=question&sortColumn=difficulty_level&sortDirection=ASC` |
| 18 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/ordering-questions?sortTable=question&sortColumn=created_at&sortDirection=DESC` |

---

## 1.2 `GET /api/v1/ordering-questions/:id`

Get one ordering question by translation ID, including all metadata and language info. Returns joined question, translation, and language data.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/ordering-questions/:id` |
| Permission | `ordering_question.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "translationId": 1,
    "orderingQuestionId": 1,
    "languageId": 1,
    "questionText": "Arrange these events in chronological order.",
    "explanation": "Start with the earliest event and proceed to the most recent.",
    "hint": "Consider historical timeline context",
    "image1": "https://cdn.example.com/timeline-1.webp",
    "image2": null,
    "translationIsActive": true,
    "translationCreatedAt": "2026-04-12T11:18:42.447Z",
    "translationUpdatedAt": "2026-04-12T11:18:42.447Z",
    "questionId": 1,
    "topicId": 5,
    "code": "OQ001",
    "slug": "arrange-events-chronological",
    "points": 10,
    "partialScoring": true,
    "displayOrder": 1,
    "difficultyLevel": "medium",
    "isMandatory": true,
    "createdBy": 10,
    "updatedBy": 10,
    "questionIsActive": true,
    "questionCreatedAt": "2026-04-12T11:18:42.447Z",
    "questionUpdatedAt": "2026-04-12T11:18:42.447Z",
    "langId": 1,
    "langName": "English",
    "langCode": "en",
    "langIsActive": true,
    "itemCount": 4
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Ordering question translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: ordering_question.read",
  "code": "FORBIDDEN"
}
```

---

## 1.3 `POST /api/v1/ordering-questions`

Create a new ordering question. Validates that the parent topic exists and is not soft-deleted. Automatically generates a slug from the code if not provided.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/ordering-questions` |
| Permission | `ordering_question.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `topicId` | int | yes | Must reference an existing, non-deleted topic. |
| `code` | string | no | Unique code (e.g., "OQ001"). Auto-generated if not provided. Nullable = clearable. |
| `points` | int | no | Points awarded for correct ordering. Defaults to `1`. Must be >= 0. |
| `partialScoring` | bool | no | Whether partial credit is awarded for partially correct answers. Defaults to `false`. |
| `displayOrder` | int | no | Display order for UI sorting. Defaults to `0`. Must be >= 0. |
| `difficultyLevel` | enum | no | Difficulty: `easy`, `medium`, `hard`. Defaults to `easy`. |
| `isMandatory` | bool | no | Whether question is mandatory in assessments. Defaults to `true`. |
| `isActive` | bool | no | Whether question is active. Defaults to `true`. |

### Sample request (full)

```json
{
  "topicId": 5,
  "code": "OQ001",
  "points": 10,
  "partialScoring": true,
  "displayOrder": 1,
  "difficultyLevel": "medium",
  "isMandatory": true,
  "isActive": true
}
```

### Sample request (minimal)

```json
{
  "topicId": 5
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "Ordering question created successfully",
  "data": {
    "questionId": 1,
    "topicId": 5,
    "code": "OQ001",
    "slug": "oq001",
    "points": 10,
    "partialScoring": true,
    "displayOrder": 1,
    "difficultyLevel": "medium",
    "isMandatory": true,
    "isActive": true,
    "createdAt": "2026-04-12T11:22:50.312Z",
    "createdBy": 10
  }
}
```

#### 400 Bad Request — missing required field

```json
{
  "success": false,
  "message": "Topic ID is required",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "topicId",
      "message": "topicId is required"
    }
  ]
}
```

#### 400 Bad Request — invalid points

```json
{
  "success": false,
  "message": "Invalid points value",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "points",
      "message": "points must be >= 0"
    }
  ]
}
```

#### 404 Not Found — topic does not exist

```json
{
  "success": false,
  "message": "Topic 999 not found or is deleted",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: ordering_question.create",
  "code": "FORBIDDEN"
}
```

---

## 1.4 `PATCH /api/v1/ordering-questions/:id`

Update an ordering question by ID. Allows partial updates. topicId cannot be changed (immutable foreign key). At least one updatable field must be provided.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/ordering-questions/:id` |
| Permission | `ordering_question.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | string | no | Unique code. Nullable = clearable. |
| `points` | int | no | Points awarded. Must be >= 0. |
| `partialScoring` | bool | no | Whether partial credit is awarded. |
| `displayOrder` | int | no | Display order. Must be >= 0. |
| `difficultyLevel` | enum | no | `easy`, `medium`, `hard`. |
| `isMandatory` | bool | no | Mandatory flag. |
| `isActive` | bool | no | Active status. |

At least one field must be provided.

### Sample request — update points and difficulty

```json
{
  "points": 15,
  "difficultyLevel": "hard"
}
```

### Sample request — enable partial scoring

```json
{
  "partialScoring": true
}
```

### Sample request — clear code

```json
{
  "code": null
}
```

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Ordering question updated successfully",
  "data": {
    "questionId": 1,
    "topicId": 5,
    "code": "OQ001",
    "slug": "oq001",
    "points": 15,
    "partialScoring": true,
    "displayOrder": 1,
    "difficultyLevel": "hard",
    "isMandatory": true,
    "isActive": true,
    "createdAt": "2026-04-12T11:22:50.312Z",
    "updatedAt": "2026-04-12T11:25:33.891Z"
  }
}
```

#### 400 Bad Request — no fields provided

```json
{
  "success": false,
  "message": "At least one field (code, points, partialScoring, displayOrder, difficultyLevel, isMandatory, isActive) must be provided",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — attempt to update FK

```json
{
  "success": false,
  "message": "topicId is immutable and cannot be changed",
  "code": "IMMUTABLE_FIELD"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Ordering question 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: ordering_question.update",
  "code": "FORBIDDEN"
}
```

---

## 1.5 `DELETE /api/v1/ordering-questions/:id`

Cascade soft-delete an ordering question by ID. Sets is_active=FALSE, is_deleted=TRUE on the question, all child translations, all child items, and all item translations. The records remain in the database but will be filtered from most queries.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/ordering-questions/:id` |
| Permission | `ordering_question.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Ordering question deleted successfully",
  "data": {
    "questionId": 1,
    "topicId": 5,
    "code": "OQ001",
    "slug": "oq001",
    "points": 10,
    "partialScoring": true,
    "displayOrder": 1,
    "difficultyLevel": "medium",
    "isMandatory": true,
    "isActive": false,
    "isDeleted": true,
    "createdAt": "2026-04-12T11:22:50.312Z",
    "updatedAt": "2026-04-12T11:26:15.503Z"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Ordering question 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: ordering_question.delete",
  "code": "FORBIDDEN"
}
```

---

## 1.6 `POST /api/v1/ordering-questions/:id/restore`

Cascade restore a soft-deleted ordering question by ID. Sets is_deleted=FALSE and restores all child translations, items, and item translations. Validates that the parent topic is not soft-deleted before restoring.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/ordering-questions/:id/restore` |
| Permission | `ordering_question.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Ordering question restored successfully",
  "data": {
    "questionId": 1,
    "topicId": 5,
    "code": "OQ001",
    "slug": "oq001",
    "points": 10,
    "partialScoring": true,
    "displayOrder": 1,
    "difficultyLevel": "medium",
    "isMandatory": true,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-12T11:22:50.312Z",
    "updatedAt": "2026-04-12T11:27:42.156Z"
  }
}
```

#### 400 Bad Request — parent topic is deleted

```json
{
  "success": false,
  "message": "Cannot restore: parent topic is deleted",
  "code": "INVALID_STATE"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Ordering question 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: ordering_question.restore",
  "code": "FORBIDDEN"
}
```

---

## 2.1 `POST /api/v1/ordering-question-translations`

Create a translation for an ordering question. Validates that the parent question exists and is not soft-deleted. Each (orderingQuestionId, languageId) pair must be unique.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/ordering-question-translations` |
| Permission | `ordering_question_translation.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `orderingQuestionId` | int | yes | Must reference an existing, non-deleted ordering question. |
| `languageId` | int | yes | Must reference an existing, active language. |
| `questionText` | string | yes | The translated question prompt. |
| `explanation` | string | no | Optional explanation. Nullable = clearable. |
| `hint` | string | no | Optional hint. Nullable = clearable. |
| `image1` | string | no | Optional image 1 URL. Nullable = clearable. |
| `image2` | string | no | Optional image 2 URL. Nullable = clearable. |
| `isActive` | bool | no | Whether translation is active. Defaults to `true`. |

### Sample request (full)

```json
{
  "orderingQuestionId": 1,
  "languageId": 1,
  "questionText": "Arrange these events in chronological order.",
  "explanation": "Start with the earliest event and proceed to the most recent.",
  "hint": "Consider historical timeline context",
  "image1": "https://cdn.example.com/timeline-1.webp",
  "image2": null,
  "isActive": true
}
```

### Sample request (minimal)

```json
{
  "orderingQuestionId": 1,
  "languageId": 1,
  "questionText": "Arrange these events in chronological order."
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "Ordering question translation created successfully",
  "data": {
    "translationId": 1,
    "orderingQuestionId": 1,
    "languageId": 1,
    "questionText": "Arrange these events in chronological order.",
    "explanation": "Start with the earliest event and proceed to the most recent.",
    "hint": "Consider historical timeline context",
    "image1": "https://cdn.example.com/timeline-1.webp",
    "image2": null,
    "isActive": true,
    "createdAt": "2026-04-12T11:22:50.312Z"
  }
}
```

#### 400 Bad Request — missing required field

```json
{
  "success": false,
  "message": "Question text is required",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "questionText",
      "message": "questionText is required"
    }
  ]
}
```

#### 404 Not Found — question does not exist

```json
{
  "success": false,
  "message": "Ordering question 999 not found or is deleted",
  "code": "NOT_FOUND"
}
```

#### 404 Not Found — language does not exist

```json
{
  "success": false,
  "message": "Language 999 not found or is deleted",
  "code": "NOT_FOUND"
}
```

#### 409 Conflict — duplicate translation

```json
{
  "success": false,
  "message": "A translation for this question in this language already exists",
  "code": "DUPLICATE_TRANSLATION"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: ordering_question_translation.create",
  "code": "FORBIDDEN"
}
```

---

## 2.2 `PATCH /api/v1/ordering-question-translations/:id`

Update a question translation by ID. Allows partial updates. Parent orderingQuestionId and languageId are immutable. At least one updatable field must be provided.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/ordering-question-translations/:id` |
| Permission | `ordering_question_translation.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `questionText` | string | no | New question text. |
| `explanation` | string | no | New explanation. Nullable = clearable. |
| `hint` | string | no | New hint. Nullable = clearable. |
| `image1` | string | no | New image1 URL. Nullable = clearable. |
| `image2` | string | no | New image2 URL. Nullable = clearable. |
| `isActive` | bool | no | New active status. |

At least one field must be provided.

### Sample request — update question text

```json
{
  "questionText": "Arrange these important events in correct chronological order."
}
```

### Sample request — update and clear fields

```json
{
  "explanation": "A more detailed explanation of the timeline",
  "hint": null,
  "image2": null
}
```

### Sample request — update images

```json
{
  "image1": "https://cdn.example.com/updated-timeline.webp"
}
```

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Ordering question translation updated successfully",
  "data": {
    "translationId": 1,
    "orderingQuestionId": 1,
    "languageId": 1,
    "questionText": "Arrange these important events in correct chronological order.",
    "explanation": "A more detailed explanation of the timeline",
    "hint": null,
    "image1": "https://cdn.example.com/updated-timeline.webp",
    "image2": null,
    "isActive": true,
    "createdAt": "2026-04-12T11:22:50.312Z",
    "updatedAt": "2026-04-12T11:30:15.892Z"
  }
}
```

#### 400 Bad Request — no fields provided

```json
{
  "success": false,
  "message": "At least one field (questionText, explanation, hint, image1, image2, isActive) must be provided",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — attempt to update FK

```json
{
  "success": false,
  "message": "orderingQuestionId is immutable and cannot be changed",
  "code": "IMMUTABLE_FIELD"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Ordering question translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: ordering_question_translation.update",
  "code": "FORBIDDEN"
}
```

---

## 2.3 `DELETE /api/v1/ordering-question-translations/:id`

Soft-delete a question translation by ID. Sets is_active=FALSE, is_deleted=TRUE on the translation record. The record remains in the database but will be filtered from most queries.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/ordering-question-translations/:id` |
| Permission | `ordering_question_translation.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Ordering question translation deleted successfully",
  "data": {
    "translationId": 1,
    "orderingQuestionId": 1,
    "languageId": 1,
    "questionText": "Arrange these important events in correct chronological order.",
    "explanation": "A more detailed explanation of the timeline",
    "hint": null,
    "image1": "https://cdn.example.com/updated-timeline.webp",
    "image2": null,
    "isActive": false,
    "isDeleted": true,
    "createdAt": "2026-04-12T11:22:50.312Z",
    "updatedAt": "2026-04-12T11:31:22.467Z"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Ordering question translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: ordering_question_translation.delete",
  "code": "FORBIDDEN"
}
```

---

## 2.4 `POST /api/v1/ordering-question-translations/:id/restore`

Restore a soft-deleted question translation by ID. Sets is_deleted=FALSE. Validates that the parent question is not soft-deleted before restoring.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/ordering-question-translations/:id/restore` |
| Permission | `ordering_question_translation.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Ordering question translation restored successfully",
  "data": {
    "translationId": 1,
    "orderingQuestionId": 1,
    "languageId": 1,
    "questionText": "Arrange these important events in correct chronological order.",
    "explanation": "A more detailed explanation of the timeline",
    "hint": null,
    "image1": "https://cdn.example.com/updated-timeline.webp",
    "image2": null,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-12T11:22:50.312Z",
    "updatedAt": "2026-04-12T11:32:45.123Z"
  }
}
```

#### 400 Bad Request — parent question is deleted

```json
{
  "success": false,
  "message": "Cannot restore: parent question is deleted",
  "code": "INVALID_STATE"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Ordering question translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: ordering_question_translation.restore",
  "code": "FORBIDDEN"
}
```

---

## 3.1 `POST /api/v1/ordering-items`

Create a new item in an ordering question. Validates that the parent question exists and is not soft-deleted. Each item requires a correct position (SMALLINT, minimum 1). Checks for duplicate correctPosition values within the same question.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/ordering-items` |
| Permission | `ordering_item.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `orderingQuestionId` | int | yes | Must reference an existing, non-deleted ordering question. |
| `correctPosition` | int | yes | Correct position in the ordering sequence. Must be >= 1. Must be unique within the question. |
| `isActive` | bool | no | Whether item is active. Defaults to `true`. |

### Sample request (full)

```json
{
  "orderingQuestionId": 1,
  "correctPosition": 1,
  "isActive": true
}
```

### Sample request (minimal)

```json
{
  "orderingQuestionId": 1,
  "correctPosition": 2
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "Ordering item created successfully",
  "data": {
    "itemId": 1,
    "orderingQuestionId": 1,
    "correctPosition": 1,
    "isActive": true,
    "createdAt": "2026-04-12T11:35:20.456Z",
    "createdBy": 10
  }
}
```

#### 400 Bad Request — missing required field

```json
{
  "success": false,
  "message": "Ordering question ID and correct position are required",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "orderingQuestionId",
      "message": "orderingQuestionId is required"
    },
    {
      "field": "correctPosition",
      "message": "correctPosition is required and must be >= 1"
    }
  ]
}
```

#### 400 Bad Request — invalid position

```json
{
  "success": false,
  "message": "Invalid correct position",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "correctPosition",
      "message": "correctPosition must be >= 1"
    }
  ]
}
```

#### 400 Bad Request — duplicate position

```json
{
  "success": false,
  "message": "An item with this correct position already exists in this question",
  "code": "DUPLICATE_POSITION"
}
```

#### 404 Not Found — question does not exist

```json
{
  "success": false,
  "message": "Ordering question 999 not found or is deleted",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: ordering_item.create",
  "code": "FORBIDDEN"
}
```

---

## 3.2 `PATCH /api/v1/ordering-items/:id`

Update an item by ID. Allows partial updates. orderingQuestionId cannot be changed (immutable foreign key). At least one updatable field must be provided. Checks for duplicate correctPosition values when updating.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/ordering-items/:id` |
| Permission | `ordering_item.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `correctPosition` | int | no | New correct position. Must be >= 1. Must remain unique within the question. |
| `isActive` | bool | no | New active status. |

At least one field must be provided.

### Sample request — update position

```json
{
  "correctPosition": 3
}
```

### Sample request — deactivate item

```json
{
  "isActive": false
}
```

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Ordering item updated successfully",
  "data": {
    "itemId": 1,
    "orderingQuestionId": 1,
    "correctPosition": 3,
    "isActive": true,
    "createdAt": "2026-04-12T11:35:20.456Z",
    "updatedAt": "2026-04-12T11:36:45.789Z"
  }
}
```

#### 400 Bad Request — no fields provided

```json
{
  "success": false,
  "message": "At least one field (correctPosition, isActive) must be provided",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — invalid position

```json
{
  "success": false,
  "message": "Invalid correct position",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "correctPosition",
      "message": "correctPosition must be >= 1"
    }
  ]
}
```

#### 400 Bad Request — duplicate position

```json
{
  "success": false,
  "message": "An item with this correct position already exists in this question",
  "code": "DUPLICATE_POSITION"
}
```

#### 400 Bad Request — attempt to update FK

```json
{
  "success": false,
  "message": "orderingQuestionId is immutable and cannot be changed",
  "code": "IMMUTABLE_FIELD"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Ordering item 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: ordering_item.update",
  "code": "FORBIDDEN"
}
```

---

## 3.3 `DELETE /api/v1/ordering-items/:id`

Cascade soft-delete an item by ID. Sets is_active=FALSE, is_deleted=TRUE on the item and all child item translations. The records remain in the database but will be filtered from most queries.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/ordering-items/:id` |
| Permission | `ordering_item.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Ordering item deleted successfully",
  "data": {
    "itemId": 1,
    "orderingQuestionId": 1,
    "correctPosition": 3,
    "isActive": false,
    "isDeleted": true,
    "createdAt": "2026-04-12T11:35:20.456Z",
    "updatedAt": "2026-04-12T11:37:10.234Z"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Ordering item 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: ordering_item.delete",
  "code": "FORBIDDEN"
}
```

---

## 3.4 `POST /api/v1/ordering-items/:id/restore`

Cascade restore a soft-deleted item by ID. Sets is_deleted=FALSE and restores all child item translations. Validates that the parent question is not soft-deleted before restoring.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/ordering-items/:id/restore` |
| Permission | `ordering_item.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Ordering item restored successfully",
  "data": {
    "itemId": 1,
    "orderingQuestionId": 1,
    "correctPosition": 3,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-12T11:35:20.456Z",
    "updatedAt": "2026-04-12T11:38:05.567Z"
  }
}
```

#### 400 Bad Request — parent question is deleted

```json
{
  "success": false,
  "message": "Cannot restore: parent question is deleted",
  "code": "INVALID_STATE"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Ordering item 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: ordering_item.restore",
  "code": "FORBIDDEN"
}
```

---

## 4.1 `POST /api/v1/ordering-item-translations`

Create a translation for an ordering item. Validates that the parent item exists and is not soft-deleted. Each (orderingItemId, languageId) pair must be unique.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/ordering-item-translations` |
| Permission | `ordering_item_translation.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `orderingItemId` | int | yes | Must reference an existing, non-deleted ordering item. |
| `languageId` | int | yes | Must reference an existing, active language. |
| `itemText` | string | yes | The translated item text. |
| `image` | string | no | Optional image URL. Nullable = clearable. |
| `isActive` | bool | no | Whether translation is active. Defaults to `true`. |

### Sample request (full)

```json
{
  "orderingItemId": 1,
  "languageId": 1,
  "itemText": "The signing of the Declaration of Independence",
  "image": "https://cdn.example.com/declaration-1776.webp",
  "isActive": true
}
```

### Sample request (minimal)

```json
{
  "orderingItemId": 1,
  "languageId": 1,
  "itemText": "The signing of the Declaration of Independence"
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "Ordering item translation created successfully",
  "data": {
    "translationId": 1,
    "orderingItemId": 1,
    "languageId": 1,
    "itemText": "The signing of the Declaration of Independence",
    "image": "https://cdn.example.com/declaration-1776.webp",
    "isActive": true,
    "createdAt": "2026-04-12T11:40:15.345Z"
  }
}
```

#### 400 Bad Request — missing required field

```json
{
  "success": false,
  "message": "Item text is required",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "itemText",
      "message": "itemText is required"
    }
  ]
}
```

#### 404 Not Found — item does not exist

```json
{
  "success": false,
  "message": "Ordering item 999 not found or is deleted",
  "code": "NOT_FOUND"
}
```

#### 404 Not Found — language does not exist

```json
{
  "success": false,
  "message": "Language 999 not found or is deleted",
  "code": "NOT_FOUND"
}
```

#### 409 Conflict — duplicate translation

```json
{
  "success": false,
  "message": "A translation for this item in this language already exists",
  "code": "DUPLICATE_TRANSLATION"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: ordering_item_translation.create",
  "code": "FORBIDDEN"
}
```

---

## 4.2 `PATCH /api/v1/ordering-item-translations/:id`

Update an item translation by ID. Allows partial updates. Parent orderingItemId and languageId are immutable. At least one updatable field must be provided.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/ordering-item-translations/:id` |
| Permission | `ordering_item_translation.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `itemText` | string | no | New item text. |
| `image` | string | no | New image URL. Nullable = clearable. |
| `isActive` | bool | no | New active status. |

At least one field must be provided.

### Sample request — update item text

```json
{
  "itemText": "The Declaration of Independence was signed"
}
```

### Sample request — update and clear image

```json
{
  "itemText": "Updated event description",
  "image": null
}
```

### Sample request — update image only

```json
{
  "image": "https://cdn.example.com/declaration-1776-hq.webp"
}
```

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Ordering item translation updated successfully",
  "data": {
    "translationId": 1,
    "orderingItemId": 1,
    "languageId": 1,
    "itemText": "The Declaration of Independence was signed",
    "image": "https://cdn.example.com/declaration-1776-hq.webp",
    "isActive": true,
    "createdAt": "2026-04-12T11:40:15.345Z",
    "updatedAt": "2026-04-12T11:42:30.678Z"
  }
}
```

#### 400 Bad Request — no fields provided

```json
{
  "success": false,
  "message": "At least one field (itemText, image, isActive) must be provided",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — attempt to update FK

```json
{
  "success": false,
  "message": "orderingItemId is immutable and cannot be changed",
  "code": "IMMUTABLE_FIELD"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Ordering item translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: ordering_item_translation.update",
  "code": "FORBIDDEN"
}
```

---

## 4.3 `DELETE /api/v1/ordering-item-translations/:id`

Soft-delete an item translation by ID. Sets is_active=FALSE, is_deleted=TRUE on the translation record. The record remains in the database but will be filtered from most queries.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/ordering-item-translations/:id` |
| Permission | `ordering_item_translation.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Ordering item translation deleted successfully",
  "data": {
    "translationId": 1,
    "orderingItemId": 1,
    "languageId": 1,
    "itemText": "The Declaration of Independence was signed",
    "image": "https://cdn.example.com/declaration-1776-hq.webp",
    "isActive": false,
    "isDeleted": true,
    "createdAt": "2026-04-12T11:40:15.345Z",
    "updatedAt": "2026-04-12T11:43:18.901Z"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Ordering item translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: ordering_item_translation.delete",
  "code": "FORBIDDEN"
}
```

---

## 4.4 `POST /api/v1/ordering-item-translations/:id/restore`

Restore a soft-deleted item translation by ID. Sets is_deleted=FALSE. Validates that the parent item is not soft-deleted before restoring.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/ordering-item-translations/:id/restore` |
| Permission | `ordering_item_translation.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Ordering item translation restored successfully",
  "data": {
    "translationId": 1,
    "orderingItemId": 1,
    "languageId": 1,
    "itemText": "The Declaration of Independence was signed",
    "image": "https://cdn.example.com/declaration-1776-hq.webp",
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-12T11:40:15.345Z",
    "updatedAt": "2026-04-12T11:44:05.234Z"
  }
}
```

#### 400 Bad Request — parent item is deleted

```json
{
  "success": false,
  "message": "Cannot restore: parent item is deleted",
  "code": "INVALID_STATE"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Ordering item translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: ordering_item_translation.restore",
  "code": "FORBIDDEN"
}
```
