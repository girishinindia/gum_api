# Phase 10 — Descriptive Questions

Descriptive Questions represent short-answer and long-answer question items in the question bank. Each question is tied to a topic and can be of type short_answer or long_answer. Questions support word count limits (min_words, max_words), multiple images for both question and model answer (3 question images + 3 answer images), and multiple language translations. Questions and translations support soft-delete with admin restore. All routes require authentication.

Permission codes: `descriptive_question.create`, `descriptive_question.read`, `descriptive_question.update`, `descriptive_question.delete`, `descriptive_question.restore`, `descriptive_question_translation.create`, `descriptive_question_translation.read`, `descriptive_question_translation.update`, `descriptive_question_translation.delete`, `descriptive_question_translation.restore`.

- **Super-admin**: all 10 permissions.
- **Admin**: all except `*.delete` (no delete on question/translation; only soft-delete via DELETE endpoint which still requires `*.delete` permission).

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](../00%20-%20overview.md#8-postman-environment).

← [back to Phase 10](./00%20-%20overview.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1descriptive-questions) | `GET` | `{{baseUrl}}/api/v1/descriptive-questions` | `descriptive_question.read` | List all descriptive questions with pagination, search, filter, and sort. |
| [§1.2](#12-get-apiv1descriptive-questionsid) | `GET` | `{{baseUrl}}/api/v1/descriptive-questions/:id` | `descriptive_question.read` | Get one descriptive question by translation ID (returns joined question+translation+language data). |
| [§1.3](#13-post-apiv1descriptive-questions) | `POST` | `{{baseUrl}}/api/v1/descriptive-questions` | `descriptive_question.create` | Create a new descriptive question. |
| [§1.4](#14-patch-apiv1descriptive-questionsid) | `PATCH` | `{{baseUrl}}/api/v1/descriptive-questions/:id` | `descriptive_question.update` | Update a descriptive question by ID. |
| [§1.5](#15-delete-apiv1descriptive-questionsid) | `DELETE` | `{{baseUrl}}/api/v1/descriptive-questions/:id` | `descriptive_question.delete` | Cascade soft-delete a descriptive question (question → translations). |
| [§1.6](#16-post-apiv1descriptive-questionsidrestore) | `POST` | `{{baseUrl}}/api/v1/descriptive-questions/:id/restore` | `descriptive_question.restore` | Cascade restore a descriptive question, validates parent topic not deleted. |
| [§2.1](#21-post-apiv1descriptive-question-translations) | `POST` | `{{baseUrl}}/api/v1/descriptive-question-translations` | `descriptive_question_translation.create` | Create a translation for a descriptive question. |
| [§2.2](#22-patch-apiv1descriptive-question-translationsid) | `PATCH` | `{{baseUrl}}/api/v1/descriptive-question-translations/:id` | `descriptive_question_translation.update` | Update a question translation. |
| [§2.3](#23-delete-apiv1descriptive-question-translationsid) | `DELETE` | `{{baseUrl}}/api/v1/descriptive-question-translations/:id` | `descriptive_question_translation.delete` | Soft-delete a question translation. |
| [§2.4](#24-post-apiv1descriptive-question-translationsidrestore) | `POST` | `{{baseUrl}}/api/v1/descriptive-question-translations/:id/restore` | `descriptive_question_translation.restore` | Restore a question translation, validates parent question not deleted. |

---

## 1.1 `GET /api/v1/descriptive-questions`

List all descriptive questions with support for pagination, search, filtering, and sorting. Results include denormalized question, translation, and language metadata.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/descriptive-questions` |
| Permission | `descriptive_question.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number (for UI convenience). |
| `pageSize` | int | `25` | 1..500. |
| `descriptiveQuestionId` | int | — | Filter by descriptive_questions.id. |
| `languageId` | int | — | Filter by descriptive_question_translations.language_id. |
| `topicId` | int | — | Filter by descriptive_questions.topic_id. |
| `answerType` | enum | — | Filter by answer_type: `short_answer`, `long_answer`. |
| `difficultyLevel` | enum | — | Filter by difficulty_level: `easy`, `medium`, `hard`. |
| `isMandatory` | bool | — | Filter by is_mandatory flag. |
| `isActive` | bool | — | Filter by question is_active flag. |
| `filterIsActive` | bool | — | Filter by translation is_active flag. |
| `searchTerm` | string | — | `ILIKE` across question_text, explanation, hint, model_answer, code, slug. |
| `sortTable` | enum | `translation` | Sort by `question` (base table) or `translation` (translation table). |
| `sortColumn` | enum | `created_at` | See [sort columns table](#sort-columns-reference) below. |
| `sortDirection` | enum | `DESC` | `ASC` \| `DESC`. |

**Sort columns reference:**

When `sortTable=question`: `id`, `topic_id`, `answer_type`, `code`, `slug`, `points`, `min_words`, `max_words`, `display_order`, `difficulty_level`, `created_at`, `updated_at`.

When `sortTable=translation`: `id`, `question_text`, `model_answer`, `explanation`, `hint`, `created_at`, `updated_at`.

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
      "descriptiveQuestionId": 1,
      "languageId": 1,
      "questionText": "Explain the water cycle in detail.",
      "explanation": "The water cycle involves evaporation, condensation, and precipitation.",
      "hint": "Consider all phases of water",
      "modelAnswer": "Water evaporates from surface water bodies, condenses in the atmosphere, and precipitates as rain or snow.",
      "questionImage1": "https://cdn.example.com/water-cycle-1.webp",
      "questionImage2": null,
      "questionImage3": null,
      "answerImage1": "https://cdn.example.com/water-cycle-answer.webp",
      "answerImage2": null,
      "answerImage3": null,
      "translationIsActive": true,
      "translationCreatedAt": "2026-04-12T11:18:42.447Z",
      "translationUpdatedAt": "2026-04-12T11:18:42.447Z",
      "questionId": 1,
      "topicId": 5,
      "answerType": "long_answer",
      "code": "DQ001",
      "slug": "explain-water-cycle",
      "points": 5,
      "minWords": 50,
      "maxWords": 200,
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
      "langIsActive": true
    },
    {
      "translationId": 2,
      "descriptiveQuestionId": 2,
      "languageId": 1,
      "questionText": "What is photosynthesis?",
      "explanation": "The process by which plants convert light energy into chemical energy.",
      "hint": "Think about plants and sunlight",
      "modelAnswer": "Photosynthesis is the process where plants use sunlight, water, and carbon dioxide to produce oxygen and glucose.",
      "questionImage1": null,
      "questionImage2": null,
      "questionImage3": null,
      "answerImage1": null,
      "answerImage2": null,
      "answerImage3": null,
      "translationIsActive": true,
      "translationCreatedAt": "2026-04-12T11:20:15.892Z",
      "translationUpdatedAt": "2026-04-12T11:20:15.892Z",
      "questionId": 2,
      "topicId": 5,
      "answerType": "short_answer",
      "code": "DQ002",
      "slug": "what-is-photosynthesis",
      "points": 3,
      "minWords": 20,
      "maxWords": 75,
      "displayOrder": 2,
      "difficultyLevel": "easy",
      "isMandatory": false,
      "createdBy": 10,
      "updatedBy": 10,
      "questionIsActive": true,
      "questionCreatedAt": "2026-04-12T11:20:15.892Z",
      "questionUpdatedAt": "2026-04-12T11:20:15.892Z",
      "langId": 1,
      "langName": "English",
      "langCode": "en",
      "langIsActive": true
    }
  ],
  "meta": { "page": 1, "limit": 25, "totalCount": 47, "totalPages": 2 }
}
```

#### 403 Forbidden — caller lacks `descriptive_question.read`

```json
{
  "success": false,
  "message": "Missing required permission: descriptive_question.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

| # | Description | URL |
|---|---|---|
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/descriptive-questions?pageIndex=1&pageSize=25` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/descriptive-questions?pageIndex=2&pageSize=25` |
| 3 | Filter by topicId=5 | `{{baseUrl}}/api/v1/descriptive-questions?topicId=5` |
| 4 | Filter by answerType=short_answer | `{{baseUrl}}/api/v1/descriptive-questions?answerType=short_answer` |
| 5 | Filter by answerType=long_answer | `{{baseUrl}}/api/v1/descriptive-questions?answerType=long_answer` |
| 6 | Filter by difficultyLevel=easy | `{{baseUrl}}/api/v1/descriptive-questions?difficultyLevel=easy` |
| 7 | Filter by difficultyLevel=medium | `{{baseUrl}}/api/v1/descriptive-questions?difficultyLevel=medium` |
| 8 | Filter by difficultyLevel=hard | `{{baseUrl}}/api/v1/descriptive-questions?difficultyLevel=hard` |
| 9 | Filter by isMandatory=true | `{{baseUrl}}/api/v1/descriptive-questions?isMandatory=true` |
| 10 | Filter by isActive=true | `{{baseUrl}}/api/v1/descriptive-questions?isActive=true` |
| 11 | Filter by languageId=1 | `{{baseUrl}}/api/v1/descriptive-questions?languageId=1` |
| 12 | Search — "water" | `{{baseUrl}}/api/v1/descriptive-questions?searchTerm=water` |
| 13 | Search — "DQ001" | `{{baseUrl}}/api/v1/descriptive-questions?searchTerm=DQ001` |
| 14 | Filter topicId + difficulty | `{{baseUrl}}/api/v1/descriptive-questions?topicId=5&difficultyLevel=medium` |
| 15 | Filter answerType + mandatory | `{{baseUrl}}/api/v1/descriptive-questions?answerType=long_answer&isMandatory=true` |
| 16 | Sort by question id ASC | `{{baseUrl}}/api/v1/descriptive-questions?sortTable=question&sortColumn=id&sortDirection=ASC` |
| 17 | Sort by question id DESC | `{{baseUrl}}/api/v1/descriptive-questions?sortTable=question&sortColumn=id&sortDirection=DESC` |
| 18 | Sort by difficulty_level ASC | `{{baseUrl}}/api/v1/descriptive-questions?sortTable=question&sortColumn=difficulty_level&sortDirection=ASC` |
| 19 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/descriptive-questions?sortTable=question&sortColumn=created_at&sortDirection=DESC` |
| 20 | Sort by translation question_text ASC | `{{baseUrl}}/api/v1/descriptive-questions?sortTable=translation&sortColumn=question_text&sortDirection=ASC` |
| 21 | Combo — topic + difficulty + sort | `{{baseUrl}}/api/v1/descriptive-questions?topicId=5&difficultyLevel=easy&sortTable=question&sortColumn=display_order&sortDirection=ASC` |
| 22 | Combo — search + filter + paginate | `{{baseUrl}}/api/v1/descriptive-questions?pageIndex=1&pageSize=10&topicId=5&answerType=short_answer&searchTerm=basic` |

---

## 1.2 `GET /api/v1/descriptive-questions/:id`

Get one descriptive question by translation ID, including all metadata and language info. Returns joined question, translation, and language data.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/descriptive-questions/:id` |
| Permission | `descriptive_question.read` |

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
    "descriptiveQuestionId": 1,
    "languageId": 1,
    "questionText": "Explain the water cycle in detail.",
    "explanation": "The water cycle involves evaporation, condensation, and precipitation.",
    "hint": "Consider all phases of water",
    "modelAnswer": "Water evaporates from surface water bodies, condenses in the atmosphere, and precipitates as rain or snow.",
    "questionImage1": "https://cdn.example.com/water-cycle-1.webp",
    "questionImage2": null,
    "questionImage3": null,
    "answerImage1": "https://cdn.example.com/water-cycle-answer.webp",
    "answerImage2": null,
    "answerImage3": null,
    "translationIsActive": true,
    "translationCreatedAt": "2026-04-12T11:18:42.447Z",
    "translationUpdatedAt": "2026-04-12T11:18:42.447Z",
    "questionId": 1,
    "topicId": 5,
    "answerType": "long_answer",
    "code": "DQ001",
    "slug": "explain-water-cycle",
    "points": 5,
    "minWords": 50,
    "maxWords": 200,
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
    "langIsActive": true
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Descriptive question translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: descriptive_question.read",
  "code": "FORBIDDEN"
}
```

---

## 1.3 `POST /api/v1/descriptive-questions`

Create a new descriptive question. Validates that the parent topic exists and is not soft-deleted. Automatically generates a slug from the code if not provided.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/descriptive-questions` |
| Permission | `descriptive_question.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `topicId` | int | yes | Must reference an existing, non-deleted topic. |
| `answerType` | enum | no | Type of answer: `short_answer`, `long_answer`. Defaults to `short_answer`. |
| `code` | string | no | Unique code (e.g., "DQ001"). Auto-generated if not provided. Nullable = clearable. |
| `points` | int | no | Points awarded for correct answer. Defaults to `1`. Must be >= 0. |
| `minWords` | int | no | Minimum word count for answer. Defaults to NULL. Nullable = clearable. Send -1 sentinel to map to NULL in UDF. |
| `maxWords` | int | no | Maximum word count for answer. Defaults to NULL. Nullable = clearable. Send -1 sentinel to map to NULL in UDF. |
| `displayOrder` | int | no | Display order for UI sorting. Defaults to `0`. Must be >= 0. |
| `difficultyLevel` | enum | no | Difficulty: `easy`, `medium`, `hard`. Defaults to `easy`. |
| `isMandatory` | bool | no | Whether question is mandatory in assessments. Defaults to `true`. |
| `isActive` | bool | no | Whether question is active. Defaults to `true`. |

### Sample request (full)

```json
{
  "topicId": 5,
  "answerType": "long_answer",
  "code": "DQ001",
  "points": 5,
  "minWords": 50,
  "maxWords": 200,
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
  "message": "Descriptive question created successfully",
  "data": {
    "questionId": 1,
    "topicId": 5,
    "answerType": "long_answer",
    "code": "DQ001",
    "slug": "dq001",
    "points": 5,
    "minWords": 50,
    "maxWords": 200,
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

#### 400 Bad Request — invalid answerType

```json
{
  "success": false,
  "message": "Invalid answerType",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "answerType",
      "message": "answerType must be one of: short_answer, long_answer"
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

#### 400 Bad Request — invalid word limits

```json
{
  "success": false,
  "message": "Invalid word limit",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "maxWords",
      "message": "maxWords must be >= minWords"
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
  "message": "Missing required permission: descriptive_question.create",
  "code": "FORBIDDEN"
}
```

---

## 1.4 `PATCH /api/v1/descriptive-questions/:id`

Update a descriptive question by ID. Allows partial updates. topicId cannot be changed (immutable foreign key). At least one updatable field must be provided.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/descriptive-questions/:id` |
| Permission | `descriptive_question.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `answerType` | enum | no | `short_answer`, `long_answer`. |
| `code` | string | no | Unique code. Nullable = clearable. |
| `points` | int | no | Points awarded. Must be >= 0. |
| `minWords` | int | no | Minimum word count. Nullable = clearable. Send -1 sentinel to map to NULL in UDF. |
| `maxWords` | int | no | Maximum word count. Nullable = clearable. Send -1 sentinel to map to NULL in UDF. |
| `displayOrder` | int | no | Display order. Must be >= 0. |
| `difficultyLevel` | enum | no | `easy`, `medium`, `hard`. |
| `isMandatory` | bool | no | Mandatory flag. |
| `isActive` | bool | no | Active status. |

At least one field must be provided.

### Sample request — update points and difficulty

```json
{
  "points": 8,
  "difficultyLevel": "hard"
}
```

### Sample request — change answerType

```json
{
  "answerType": "long_answer"
}
```

### Sample request — clear code and set word limits

```json
{
  "code": null,
  "minWords": 100,
  "maxWords": 300
}
```

### Sample request — clear word limits

```json
{
  "minWords": -1,
  "maxWords": -1
}
```

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Descriptive question updated successfully",
  "data": {
    "questionId": 1,
    "topicId": 5,
    "answerType": "long_answer",
    "code": "DQ001",
    "slug": "dq001",
    "points": 8,
    "minWords": 100,
    "maxWords": 300,
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
  "message": "At least one field (answerType, code, points, minWords, maxWords, displayOrder, difficultyLevel, isMandatory, isActive) must be provided",
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

#### 400 Bad Request — invalid answerType

```json
{
  "success": false,
  "message": "Invalid answerType",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "answerType",
      "message": "answerType must be one of: short_answer, long_answer"
    }
  ]
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Descriptive question 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: descriptive_question.update",
  "code": "FORBIDDEN"
}
```

---

## 1.5 `DELETE /api/v1/descriptive-questions/:id`

Cascade soft-delete a descriptive question by ID. Sets is_active=FALSE, is_deleted=TRUE on the question and all child translations. The records remain in the database but will be filtered from most queries.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/descriptive-questions/:id` |
| Permission | `descriptive_question.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Descriptive question deleted successfully",
  "data": {
    "questionId": 1,
    "topicId": 5,
    "answerType": "long_answer",
    "code": "DQ001",
    "slug": "dq001",
    "points": 5,
    "minWords": 50,
    "maxWords": 200,
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
  "message": "Descriptive question 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: descriptive_question.delete",
  "code": "FORBIDDEN"
}
```

---

## 1.6 `POST /api/v1/descriptive-questions/:id/restore`

Cascade restore a soft-deleted descriptive question by ID. Sets is_deleted=FALSE and restores all child translations. Validates that the parent topic is not soft-deleted before restoring.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/descriptive-questions/:id/restore` |
| Permission | `descriptive_question.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Descriptive question restored successfully",
  "data": {
    "questionId": 1,
    "topicId": 5,
    "answerType": "long_answer",
    "code": "DQ001",
    "slug": "dq001",
    "points": 5,
    "minWords": 50,
    "maxWords": 200,
    "displayOrder": 1,
    "difficultyLevel": "medium",
    "isMandatory": true,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-12T11:22:50.312Z",
    "updatedAt": "2026-04-12T11:27:30.156Z"
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
  "message": "Descriptive question 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: descriptive_question.restore",
  "code": "FORBIDDEN"
}
```

---

## 2.1 `POST /api/v1/descriptive-question-translations`

Create a translation for a descriptive question. Validates that both parent question and language exist and are not soft-deleted. Validates that no duplicate (descriptiveQuestionId, languageId) pair already exists.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/descriptive-question-translations` |
| Permission | `descriptive_question_translation.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `descriptiveQuestionId` | int | yes | Must reference an existing, non-deleted descriptive question. |
| `languageId` | int | yes | Must reference an existing, non-deleted language. |
| `questionText` | string | yes | The translated question text. |
| `explanation` | string | no | Optional explanation for the question. Nullable. |
| `hint` | string | no | Optional hint for the student. Nullable. |
| `modelAnswer` | string | no | Optional model answer. Nullable. |
| `questionImage1` | string | no | Optional URL to first question image. Nullable. |
| `questionImage2` | string | no | Optional URL to second question image. Nullable. |
| `questionImage3` | string | no | Optional URL to third question image. Nullable. |
| `answerImage1` | string | no | Optional URL to first answer image. Nullable. |
| `answerImage2` | string | no | Optional URL to second answer image. Nullable. |
| `answerImage3` | string | no | Optional URL to third answer image. Nullable. |
| `isActive` | bool | no | Whether translation is active. Defaults to `true`. |

### Sample request (full)

```json
{
  "descriptiveQuestionId": 1,
  "languageId": 1,
  "questionText": "Explain the water cycle in detail.",
  "explanation": "The water cycle involves evaporation, condensation, and precipitation.",
  "hint": "Consider all phases of water",
  "modelAnswer": "Water evaporates from surface water bodies, condenses in the atmosphere, and precipitates as rain or snow.",
  "questionImage1": "https://cdn.example.com/water-cycle-1.webp",
  "questionImage2": null,
  "questionImage3": null,
  "answerImage1": "https://cdn.example.com/water-cycle-answer.webp",
  "answerImage2": null,
  "answerImage3": null,
  "isActive": true
}
```

### Sample request (minimal)

```json
{
  "descriptiveQuestionId": 1,
  "languageId": 1,
  "questionText": "Explain the water cycle in detail."
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "Descriptive question translation created successfully",
  "data": {
    "translationId": 1,
    "descriptiveQuestionId": 1,
    "languageId": 1,
    "questionText": "Explain the water cycle in detail.",
    "explanation": "The water cycle involves evaporation, condensation, and precipitation.",
    "hint": "Consider all phases of water",
    "modelAnswer": "Water evaporates from surface water bodies, condenses in the atmosphere, and precipitates as rain or snow.",
    "questionImage1": "https://cdn.example.com/water-cycle-1.webp",
    "questionImage2": null,
    "questionImage3": null,
    "answerImage1": "https://cdn.example.com/water-cycle-answer.webp",
    "answerImage2": null,
    "answerImage3": null,
    "isActive": true,
    "createdAt": "2026-04-12T11:22:50.312Z"
  }
}
```

#### 400 Bad Request — missing required field

```json
{
  "success": false,
  "message": "Descriptive Question ID, Language ID, and Question Text are required",
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
  "message": "Descriptive question 999 not found or is deleted",
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

#### 409 Conflict — duplicate pair

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
  "message": "Missing required permission: descriptive_question_translation.create",
  "code": "FORBIDDEN"
}
```

---

## 2.2 `PATCH /api/v1/descriptive-question-translations/:id`

Update a question translation by ID. Allows partial updates. Parent descriptiveQuestionId and languageId are immutable. At least one updatable field must be provided.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/descriptive-question-translations/:id` |
| Permission | `descriptive_question_translation.update` |

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
| `modelAnswer` | string | no | New model answer. Nullable = clearable. |
| `questionImage1` | string | no | New image1 URL. Nullable = clearable. |
| `questionImage2` | string | no | New image2 URL. Nullable = clearable. |
| `questionImage3` | string | no | New image3 URL. Nullable = clearable. |
| `answerImage1` | string | no | New answer image1 URL. Nullable = clearable. |
| `answerImage2` | string | no | New answer image2 URL. Nullable = clearable. |
| `answerImage3` | string | no | New answer image3 URL. Nullable = clearable. |
| `isActive` | bool | no | New active status. |

At least one field must be provided.

### Sample request — update question text

```json
{
  "questionText": "Describe the complete water cycle in detail."
}
```

### Sample request — update and clear fields

```json
{
  "explanation": "A more detailed explanation",
  "hint": null,
  "questionImage2": null
}
```

### Sample request — update model answer and images

```json
{
  "modelAnswer": "Water circulates through evaporation, condensation, precipitation, and infiltration.",
  "answerImage1": "https://cdn.example.com/updated-answer.webp"
}
```

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Descriptive question translation updated successfully",
  "data": {
    "translationId": 1,
    "descriptiveQuestionId": 1,
    "languageId": 1,
    "questionText": "Describe the complete water cycle in detail.",
    "explanation": "A more detailed explanation",
    "hint": null,
    "modelAnswer": "Water circulates through evaporation, condensation, precipitation, and infiltration.",
    "questionImage1": "https://cdn.example.com/water-cycle-1.webp",
    "questionImage2": null,
    "questionImage3": null,
    "answerImage1": "https://cdn.example.com/updated-answer.webp",
    "answerImage2": null,
    "answerImage3": null,
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
  "message": "At least one field (questionText, explanation, hint, modelAnswer, questionImage1, questionImage2, questionImage3, answerImage1, answerImage2, answerImage3, isActive) must be provided",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — attempt to update FK

```json
{
  "success": false,
  "message": "descriptiveQuestionId is immutable and cannot be changed",
  "code": "IMMUTABLE_FIELD"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Descriptive question translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: descriptive_question_translation.update",
  "code": "FORBIDDEN"
}
```

---

## 2.3 `DELETE /api/v1/descriptive-question-translations/:id`

Soft-delete a question translation by ID. Sets is_active=FALSE, is_deleted=TRUE on the translation record. The record remains in the database but will be filtered from most queries.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/descriptive-question-translations/:id` |
| Permission | `descriptive_question_translation.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Descriptive question translation deleted successfully",
  "data": {
    "translationId": 1,
    "descriptiveQuestionId": 1,
    "languageId": 1,
    "questionText": "Describe the complete water cycle in detail.",
    "explanation": "A more detailed explanation",
    "hint": null,
    "modelAnswer": "Water circulates through evaporation, condensation, precipitation, and infiltration.",
    "questionImage1": "https://cdn.example.com/water-cycle-1.webp",
    "questionImage2": null,
    "questionImage3": null,
    "answerImage1": "https://cdn.example.com/updated-answer.webp",
    "answerImage2": null,
    "answerImage3": null,
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
  "message": "Descriptive question translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: descriptive_question_translation.delete",
  "code": "FORBIDDEN"
}
```

---

## 2.4 `POST /api/v1/descriptive-question-translations/:id/restore`

Restore a soft-deleted question translation by ID. Sets is_deleted=FALSE. Validates that the parent question is not soft-deleted before restoring.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/descriptive-question-translations/:id/restore` |
| Permission | `descriptive_question_translation.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Descriptive question translation restored successfully",
  "data": {
    "translationId": 1,
    "descriptiveQuestionId": 1,
    "languageId": 1,
    "questionText": "Describe the complete water cycle in detail.",
    "explanation": "A more detailed explanation",
    "hint": null,
    "modelAnswer": "Water circulates through evaporation, condensation, precipitation, and infiltration.",
    "questionImage1": "https://cdn.example.com/water-cycle-1.webp",
    "questionImage2": null,
    "questionImage3": null,
    "answerImage1": "https://cdn.example.com/updated-answer.webp",
    "answerImage2": null,
    "answerImage3": null,
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
  "message": "Descriptive question translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: descriptive_question_translation.restore",
  "code": "FORBIDDEN"
}
```
