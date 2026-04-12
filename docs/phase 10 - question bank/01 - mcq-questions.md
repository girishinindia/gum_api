# Phase 10 — MCQ Questions

MCQ Questions represent multiple-choice question items in the question bank. Each question is tied to a topic and can be of type single-choice, multiple-correct, or true/false. Questions support multiple language translations and have associated answer options that also translate. Questions and all child translations and options support soft-delete with admin restore. All routes require authentication.

Permission codes: `mcq_question.create`, `mcq_question.read`, `mcq_question.update`, `mcq_question.delete`, `mcq_question.restore`, `mcq_question_translation.create`, `mcq_question_translation.update`, `mcq_question_translation.delete`, `mcq_question_translation.restore`, `mcq_option.create`, `mcq_option.update`, `mcq_option.delete`, `mcq_option.restore`, `mcq_option_translation.create`, `mcq_option_translation.update`, `mcq_option_translation.delete`, `mcq_option_translation.restore`.

- **Super-admin**: all 16 permissions.
- **Admin**: all except `*.delete` (no delete on question/option/translation; only soft-delete via DELETE endpoint which still requires `*.delete` permission).

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](../00%20-%20overview.md#8-postman-environment).

← [back to Phase 10](./00%20-%20overview.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1mcq-questions) | `GET` | `{{baseUrl}}/api/v1/mcq-questions` | `mcq_question.read` | List all MCQ questions with pagination, search, filter, and sort. |
| [§1.2](#12-get-apiv1mcq-questionsid) | `GET` | `{{baseUrl}}/api/v1/mcq-questions/:id` | `mcq_question.read` | Get one MCQ question by translation ID (returns joined question+translation+language data). |
| [§1.3](#13-post-apiv1mcq-questions) | `POST` | `{{baseUrl}}/api/v1/mcq-questions` | `mcq_question.create` | Create a new MCQ question. |
| [§1.4](#14-patch-apiv1mcq-questionsid) | `PATCH` | `{{baseUrl}}/api/v1/mcq-questions/:id` | `mcq_question.update` | Update an MCQ question by ID. |
| [§1.5](#15-delete-apiv1mcq-questionsid) | `DELETE` | `{{baseUrl}}/api/v1/mcq-questions/:id` | `mcq_question.delete` | Cascade soft-delete an MCQ question (question → translations → options → option translations). |
| [§1.6](#16-post-apiv1mcq-questionsidrestore) | `POST` | `{{baseUrl}}/api/v1/mcq-questions/:id/restore` | `mcq_question.restore` | Cascade restore an MCQ question, validates parent topic not deleted. |
| [§2.1](#21-post-apiv1mcq-question-translations) | `POST` | `{{baseUrl}}/api/v1/mcq-question-translations` | `mcq_question_translation.create` | Create a translation for an MCQ question. |
| [§2.2](#22-patch-apiv1mcq-question-translationsid) | `PATCH` | `{{baseUrl}}/api/v1/mcq-question-translations/:id` | `mcq_question_translation.update` | Update a question translation. |
| [§2.3](#23-delete-apiv1mcq-question-translationsid) | `DELETE` | `{{baseUrl}}/api/v1/mcq-question-translations/:id` | `mcq_question_translation.delete` | Soft-delete a question translation. |
| [§2.4](#24-post-apiv1mcq-question-translationsidrestore) | `POST` | `{{baseUrl}}/api/v1/mcq-question-translations/:id/restore` | `mcq_question_translation.restore` | Restore a question translation, validates parent question not deleted. |
| [§3.1](#31-post-apiv1mcq-options) | `POST` | `{{baseUrl}}/api/v1/mcq-options` | `mcq_option.create` | Create an answer option for an MCQ question. |
| [§3.2](#32-patch-apiv1mcq-optionsid) | `PATCH` | `{{baseUrl}}/api/v1/mcq-options/:id` | `mcq_option.update` | Update an MCQ option. |
| [§3.3](#33-delete-apiv1mcq-optionsid) | `DELETE` | `{{baseUrl}}/api/v1/mcq-options/:id` | `mcq_option.delete` | Cascade soft-delete an option (option → option translations). |
| [§3.4](#34-post-apiv1mcq-optionsidrestore) | `POST` | `{{baseUrl}}/api/v1/mcq-options/:id/restore` | `mcq_option.restore` | Cascade restore an option, validates parent question not deleted. |
| [§4.1](#41-post-apiv1mcq-option-translations) | `POST` | `{{baseUrl}}/api/v1/mcq-option-translations` | `mcq_option_translation.create` | Create a translation for an MCQ option. |
| [§4.2](#42-patch-apiv1mcq-option-translationsid) | `PATCH` | `{{baseUrl}}/api/v1/mcq-option-translations/:id` | `mcq_option_translation.update` | Update an option translation. |
| [§4.3](#43-delete-apiv1mcq-option-translationsid) | `DELETE` | `{{baseUrl}}/api/v1/mcq-option-translations/:id` | `mcq_option_translation.delete` | Soft-delete an option translation. |
| [§4.4](#44-post-apiv1mcq-option-translationsidrestore) | `POST` | `{{baseUrl}}/api/v1/mcq-option-translations/:id/restore` | `mcq_option_translation.restore` | Restore an option translation, validates parent option not deleted. |

---

## 1.1 `GET /api/v1/mcq-questions`

List all MCQ questions with support for pagination, search, filtering, and sorting. Results include denormalized question, translation, and language metadata.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/mcq-questions` |
| Permission | `mcq_question.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number (for UI convenience). |
| `pageSize` | int | `20` | 1..500. |
| `mcqQuestionId` | int | — | Filter by mcq_questions.id. |
| `languageId` | int | — | Filter by mcq_question_translations.language_id. |
| `topicId` | int | — | Filter by mcq_questions.topic_id. |
| `mcqType` | enum | — | Filter by mcq_type: `single`, `multiple`, `true_false`. |
| `difficultyLevel` | enum | — | Filter by difficulty_level: `easy`, `medium`, `hard`. |
| `isMandatory` | bool | — | Filter by is_mandatory flag. |
| `isActive` | bool | — | Filter by question is_active flag. |
| `filterIsActive` | bool | — | Filter by translation is_active flag. |
| `searchTerm` | string | — | `ILIKE` across question code, slug, and translation question_text. |
| `sortTable` | enum | `question` | Sort by `question` (base table) or `translation` (translation table). |
| `sortColumn` | enum | `id` | See [sort columns table](#sort-columns-reference) below. |
| `sortDirection` | enum | `ASC` | `ASC` \| `DESC`. |

**Sort columns reference:**

When `sortTable=question`: `id`, `topic_id`, `code`, `slug`, `points`, `display_order`, `difficulty_level`, `mcq_type`, `created_at`, `updated_at`.

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
      "mcqQuestionId": 1,
      "languageId": 1,
      "questionText": "What is 2 + 2?",
      "explanation": "Basic arithmetic",
      "hint": "Count on your fingers",
      "image1": "https://cdn.example.com/img1.webp",
      "image2": null,
      "translationIsActive": true,
      "translationCreatedAt": "2026-04-12T11:18:42.447Z",
      "translationUpdatedAt": "2026-04-12T11:18:42.447Z",
      "questionId": 1,
      "topicId": 5,
      "mcqType": "single",
      "code": "Q001",
      "slug": "what-is-2-plus-2",
      "points": 1,
      "displayOrder": 1,
      "difficultyLevel": "easy",
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
      "mcqQuestionId": 2,
      "languageId": 1,
      "questionText": "Which of the following are prime numbers?",
      "explanation": "Prime numbers are divisible only by 1 and themselves",
      "hint": "Check divisibility",
      "image1": null,
      "image2": null,
      "translationIsActive": true,
      "translationCreatedAt": "2026-04-12T11:20:15.892Z",
      "translationUpdatedAt": "2026-04-12T11:20:15.892Z",
      "questionId": 2,
      "topicId": 5,
      "mcqType": "multiple",
      "code": "Q002",
      "slug": "which-are-prime-numbers",
      "points": 2,
      "displayOrder": 2,
      "difficultyLevel": "medium",
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
  "meta": { "page": 1, "limit": 20, "totalCount": 47, "totalPages": 3 }
}
```

#### 403 Forbidden — caller lacks `mcq_question.read`

```json
{
  "success": false,
  "message": "Missing required permission: mcq_question.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

| # | Description | URL |
|---|---|---|
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/mcq-questions?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/mcq-questions?pageIndex=2&pageSize=20` |
| 3 | Filter by topicId=5 | `{{baseUrl}}/api/v1/mcq-questions?topicId=5` |
| 4 | Filter by mcqType=single | `{{baseUrl}}/api/v1/mcq-questions?mcqType=single` |
| 5 | Filter by mcqType=multiple | `{{baseUrl}}/api/v1/mcq-questions?mcqType=multiple` |
| 6 | Filter by mcqType=true_false | `{{baseUrl}}/api/v1/mcq-questions?mcqType=true_false` |
| 7 | Filter by difficultyLevel=easy | `{{baseUrl}}/api/v1/mcq-questions?difficultyLevel=easy` |
| 8 | Filter by difficultyLevel=medium | `{{baseUrl}}/api/v1/mcq-questions?difficultyLevel=medium` |
| 9 | Filter by difficultyLevel=hard | `{{baseUrl}}/api/v1/mcq-questions?difficultyLevel=hard` |
| 10 | Filter by isMandatory=true | `{{baseUrl}}/api/v1/mcq-questions?isMandatory=true` |
| 11 | Filter by isActive=true | `{{baseUrl}}/api/v1/mcq-questions?isActive=true` |
| 12 | Filter by languageId=1 | `{{baseUrl}}/api/v1/mcq-questions?languageId=1` |
| 13 | Search — "prime" | `{{baseUrl}}/api/v1/mcq-questions?searchTerm=prime` |
| 14 | Search — "Q001" | `{{baseUrl}}/api/v1/mcq-questions?searchTerm=Q001` |
| 15 | Filter topicId + difficulty | `{{baseUrl}}/api/v1/mcq-questions?topicId=5&difficultyLevel=easy` |
| 16 | Filter mcqType + mandatory | `{{baseUrl}}/api/v1/mcq-questions?mcqType=single&isMandatory=true` |
| 17 | Sort by question id ASC | `{{baseUrl}}/api/v1/mcq-questions?sortTable=question&sortColumn=id&sortDirection=ASC` |
| 18 | Sort by question id DESC | `{{baseUrl}}/api/v1/mcq-questions?sortTable=question&sortColumn=id&sortDirection=DESC` |
| 19 | Sort by difficulty_level ASC | `{{baseUrl}}/api/v1/mcq-questions?sortTable=question&sortColumn=difficulty_level&sortDirection=ASC` |
| 20 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/mcq-questions?sortTable=question&sortColumn=created_at&sortDirection=DESC` |
| 21 | Sort by translation question_text ASC | `{{baseUrl}}/api/v1/mcq-questions?sortTable=translation&sortColumn=question_text&sortDirection=ASC` |
| 22 | Combo — topic + difficulty + sort | `{{baseUrl}}/api/v1/mcq-questions?topicId=5&difficultyLevel=easy&sortTable=question&sortColumn=display_order&sortDirection=ASC` |
| 23 | Combo — search + filter + paginate | `{{baseUrl}}/api/v1/mcq-questions?pageIndex=1&pageSize=10&topicId=5&mcqType=single&searchTerm=basic` |

---

## 1.2 `GET /api/v1/mcq-questions/:id`

Get one MCQ question by translation ID, including all metadata and language info. Returns joined question, translation, and language data.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/mcq-questions/:id` |
| Permission | `mcq_question.read` |

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
    "mcqQuestionId": 1,
    "languageId": 1,
    "questionText": "What is 2 + 2?",
    "explanation": "Basic arithmetic",
    "hint": "Count on your fingers",
    "image1": "https://cdn.example.com/img1.webp",
    "image2": null,
    "translationIsActive": true,
    "translationCreatedAt": "2026-04-12T11:18:42.447Z",
    "translationUpdatedAt": "2026-04-12T11:18:42.447Z",
    "questionId": 1,
    "topicId": 5,
    "mcqType": "single",
    "code": "Q001",
    "slug": "what-is-2-plus-2",
    "points": 1,
    "displayOrder": 1,
    "difficultyLevel": "easy",
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
  "message": "MCQ question translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: mcq_question.read",
  "code": "FORBIDDEN"
}
```

---

## 1.3 `POST /api/v1/mcq-questions`

Create a new MCQ question. Validates that the parent topic exists and is not soft-deleted. Automatically generates a slug from the code if not provided.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/mcq-questions` |
| Permission | `mcq_question.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `topicId` | int | yes | Must reference an existing, non-deleted topic. |
| `mcqType` | enum | no | Type of question: `single`, `multiple`, `true_false`. Defaults to `single`. |
| `code` | string | no | Unique code (e.g., "Q001"). Auto-generated if not provided. Nullable = clearable. |
| `points` | int | no | Points awarded for correct answer. Defaults to `1`. Must be >= 0. |
| `displayOrder` | int | no | Display order for UI sorting. Defaults to `0`. Must be >= 0. |
| `difficultyLevel` | enum | no | Difficulty: `easy`, `medium`, `hard`. Defaults to `easy`. |
| `isMandatory` | bool | no | Whether question is mandatory in assessments. Defaults to `true`. |
| `isActive` | bool | no | Whether question is active. Defaults to `true`. |

### Sample request (full)

```json
{
  "topicId": 5,
  "mcqType": "single",
  "code": "Q001",
  "points": 1,
  "displayOrder": 1,
  "difficultyLevel": "easy",
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
  "message": "MCQ question created successfully",
  "data": {
    "questionId": 1,
    "topicId": 5,
    "mcqType": "single",
    "code": "Q001",
    "slug": "q001",
    "points": 1,
    "displayOrder": 1,
    "difficultyLevel": "easy",
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

#### 400 Bad Request — invalid mcqType

```json
{
  "success": false,
  "message": "Invalid mcqType",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "mcqType",
      "message": "mcqType must be one of: single, multiple, true_false"
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
  "message": "Missing required permission: mcq_question.create",
  "code": "FORBIDDEN"
}
```

---

## 1.4 `PATCH /api/v1/mcq-questions/:id`

Update an MCQ question by ID. Allows partial updates. topicId cannot be changed (immutable foreign key). At least one updatable field must be provided.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/mcq-questions/:id` |
| Permission | `mcq_question.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `mcqType` | enum | no | `single`, `multiple`, `true_false`. |
| `code` | string | no | Unique code. Nullable = clearable. |
| `points` | int | no | Points awarded. Must be >= 0. |
| `displayOrder` | int | no | Display order. Must be >= 0. |
| `difficultyLevel` | enum | no | `easy`, `medium`, `hard`. |
| `isMandatory` | bool | no | Mandatory flag. |
| `isActive` | bool | no | Active status. |

At least one field must be provided.

### Sample request — update points and difficulty

```json
{
  "points": 2,
  "difficultyLevel": "medium"
}
```

### Sample request — change mcqType

```json
{
  "mcqType": "multiple"
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
  "message": "MCQ question updated successfully",
  "data": {
    "questionId": 1,
    "topicId": 5,
    "mcqType": "multiple",
    "code": "Q001",
    "slug": "q001",
    "points": 2,
    "displayOrder": 1,
    "difficultyLevel": "medium",
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
  "message": "At least one field (mcqType, code, points, displayOrder, difficultyLevel, isMandatory, isActive) must be provided",
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

#### 400 Bad Request — invalid mcqType

```json
{
  "success": false,
  "message": "Invalid mcqType",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "mcqType",
      "message": "mcqType must be one of: single, multiple, true_false"
    }
  ]
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "MCQ question 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: mcq_question.update",
  "code": "FORBIDDEN"
}
```

---

## 1.5 `DELETE /api/v1/mcq-questions/:id`

Cascade soft-delete an MCQ question by ID. Sets is_active=FALSE, is_deleted=TRUE on the question and all child translations, options, and option translations. The records remain in the database but will be filtered from most queries.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/mcq-questions/:id` |
| Permission | `mcq_question.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "MCQ question deleted successfully (cascade: 3 translations, 4 options with 8 option translations deleted)",
  "data": {
    "questionId": 1,
    "deleted": true,
    "cascadeStats": {
      "translationsDeleted": 3,
      "optionsDeleted": 4,
      "optionTranslationsDeleted": 8
    }
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "MCQ question 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: mcq_question.delete",
  "code": "FORBIDDEN"
}
```

---

## 1.6 `POST /api/v1/mcq-questions/:id/restore`

Cascade restore a soft-deleted MCQ question by ID. Validates that the record is deleted and that its parent topic is not deleted. Sets is_active=TRUE, is_deleted=FALSE on the question and all child translations, options, and option translations.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/mcq-questions/:id/restore` |
| Permission | `mcq_question.restore` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "MCQ question restored successfully (cascade: 3 translations, 4 options with 8 option translations restored)",
  "data": {
    "questionId": 1,
    "topicId": 5,
    "mcqType": "single",
    "code": "Q001",
    "slug": "q001",
    "points": 1,
    "displayOrder": 1,
    "difficultyLevel": "easy",
    "isMandatory": true,
    "isActive": true,
    "createdAt": "2026-04-12T11:22:50.312Z",
    "updatedAt": "2026-04-12T11:30:02.654Z",
    "cascadeStats": {
      "translationsRestored": 3,
      "optionsRestored": 4,
      "optionTranslationsRestored": 8
    }
  }
}
```

#### 400 Bad Request — record not deleted

```json
{
  "success": false,
  "message": "MCQ question 1 is not deleted and cannot be restored",
  "code": "INVALID_STATE"
}
```

#### 404 Not Found — parent topic deleted

```json
{
  "success": false,
  "message": "Cannot restore: parent topic is deleted",
  "code": "PARENT_DELETED"
}
```

#### 404 Not Found — question not found

```json
{
  "success": false,
  "message": "MCQ question 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: mcq_question.restore",
  "code": "FORBIDDEN"
}
```

---

## 2.1 `POST /api/v1/mcq-question-translations`

Create a translation for an MCQ question. Validates that both parent question and language exist and are not soft-deleted. Validates that no duplicate (mcqQuestionId, languageId) pair already exists.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/mcq-question-translations` |
| Permission | `mcq_question_translation.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `mcqQuestionId` | int | yes | Must reference an existing, non-deleted MCQ question. |
| `languageId` | int | yes | Must reference an existing, non-deleted language. |
| `questionText` | string | yes | The translated question text. |
| `explanation` | string | no | Optional explanation for the question. Nullable. |
| `hint` | string | no | Optional hint for the student. Nullable. |
| `image1` | string | no | Optional URL to first image. Nullable. |
| `image2` | string | no | Optional URL to second image. Nullable. |
| `isActive` | bool | no | Whether translation is active. Defaults to `true`. |

### Sample request (full)

```json
{
  "mcqQuestionId": 1,
  "languageId": 1,
  "questionText": "What is 2 + 2?",
  "explanation": "Basic arithmetic",
  "hint": "Count on your fingers",
  "image1": "https://cdn.example.com/img1.webp",
  "image2": null,
  "isActive": true
}
```

### Sample request (minimal)

```json
{
  "mcqQuestionId": 1,
  "languageId": 1,
  "questionText": "What is 2 + 2?"
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "MCQ question translation created successfully",
  "data": {
    "translationId": 1,
    "mcqQuestionId": 1,
    "languageId": 1,
    "questionText": "What is 2 + 2?",
    "explanation": "Basic arithmetic",
    "hint": "Count on your fingers",
    "image1": "https://cdn.example.com/img1.webp",
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
  "message": "MCQ Question ID, Language ID, and Question Text are required",
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
  "message": "MCQ question 999 not found or is deleted",
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
  "message": "Missing required permission: mcq_question_translation.create",
  "code": "FORBIDDEN"
}
```

---

## 2.2 `PATCH /api/v1/mcq-question-translations/:id`

Update a question translation by ID. Allows partial updates. Parent mcqQuestionId and languageId are immutable. At least one updatable field must be provided.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/mcq-question-translations/:id` |
| Permission | `mcq_question_translation.update` |

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
  "questionText": "What is the sum of 2 and 2?"
}
```

### Sample request — update and clear fields

```json
{
  "explanation": "This is a basic math question",
  "hint": null
}
```

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "MCQ question translation updated successfully",
  "data": {
    "translationId": 1,
    "mcqQuestionId": 1,
    "languageId": 1,
    "questionText": "What is the sum of 2 and 2?",
    "explanation": "This is a basic math question",
    "hint": null,
    "image1": "https://cdn.example.com/img1.webp",
    "image2": null,
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
  "message": "At least one field (questionText, explanation, hint, image1, image2, isActive) must be provided",
  "code": "VALIDATION_ERROR"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "MCQ question translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: mcq_question_translation.update",
  "code": "FORBIDDEN"
}
```

---

## 2.3 `DELETE /api/v1/mcq-question-translations/:id`

Soft-delete a question translation by ID. Sets is_active=FALSE, is_deleted=TRUE, and deleted_at to the current timestamp.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/mcq-question-translations/:id` |
| Permission | `mcq_question_translation.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "MCQ question translation deleted successfully",
  "data": {
    "translationId": 1,
    "deleted": true
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "MCQ question translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: mcq_question_translation.delete",
  "code": "FORBIDDEN"
}
```

---

## 2.4 `POST /api/v1/mcq-question-translations/:id/restore`

Restore a soft-deleted question translation by ID. Validates that the record is deleted and that its parent question is not deleted. Sets is_active=TRUE, is_deleted=FALSE, and deleted_at=NULL.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/mcq-question-translations/:id/restore` |
| Permission | `mcq_question_translation.restore` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "MCQ question translation restored successfully",
  "data": {
    "translationId": 1,
    "mcqQuestionId": 1,
    "languageId": 1,
    "questionText": "What is 2 + 2?",
    "explanation": "Basic arithmetic",
    "hint": "Count on your fingers",
    "image1": "https://cdn.example.com/img1.webp",
    "image2": null,
    "isActive": true,
    "createdAt": "2026-04-12T11:22:50.312Z",
    "updatedAt": "2026-04-12T11:30:02.654Z"
  }
}
```

#### 400 Bad Request — record not deleted

```json
{
  "success": false,
  "message": "MCQ question translation 1 is not deleted and cannot be restored",
  "code": "INVALID_STATE"
}
```

#### 404 Not Found — parent question deleted

```json
{
  "success": false,
  "message": "Cannot restore: parent question is deleted",
  "code": "PARENT_DELETED"
}
```

#### 404 Not Found — translation not found

```json
{
  "success": false,
  "message": "MCQ question translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: mcq_question_translation.restore",
  "code": "FORBIDDEN"
}
```

---

## 3.1 `POST /api/v1/mcq-options`

Create an answer option for an MCQ question. Validates that the parent question exists and is not soft-deleted.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/mcq-options` |
| Permission | `mcq_option.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `mcqQuestionId` | int | yes | Must reference an existing, non-deleted MCQ question. |
| `isCorrect` | bool | no | Whether this is a correct answer. Defaults to `false`. |
| `displayOrder` | int | no | Display order for UI sorting (option position). Defaults to `0`. Must be >= 0. |
| `isActive` | bool | no | Whether option is active. Defaults to `true`. |

### Sample request (full)

```json
{
  "mcqQuestionId": 1,
  "isCorrect": true,
  "displayOrder": 1,
  "isActive": true
}
```

### Sample request (minimal)

```json
{
  "mcqQuestionId": 1,
  "isCorrect": true
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "MCQ option created successfully",
  "data": {
    "optionId": 1,
    "mcqQuestionId": 1,
    "isCorrect": true,
    "displayOrder": 1,
    "isActive": true,
    "createdAt": "2026-04-12T11:22:50.312Z"
  }
}
```

#### 400 Bad Request — missing required field

```json
{
  "success": false,
  "message": "MCQ Question ID is required",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "mcqQuestionId",
      "message": "mcqQuestionId is required"
    }
  ]
}
```

#### 400 Bad Request — invalid display order

```json
{
  "success": false,
  "message": "Display order must be a non-negative integer",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "displayOrder",
      "message": "displayOrder must be >= 0"
    }
  ]
}
```

#### 404 Not Found — question does not exist

```json
{
  "success": false,
  "message": "MCQ question 999 not found or is deleted",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: mcq_option.create",
  "code": "FORBIDDEN"
}
```

---

## 3.2 `PATCH /api/v1/mcq-options/:id`

Update an MCQ option by ID. Allows partial updates. mcqQuestionId is immutable. At least one updatable field must be provided.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/mcq-options/:id` |
| Permission | `mcq_option.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `isCorrect` | bool | no | New correct flag. |
| `displayOrder` | int | no | New display order. Must be >= 0. |
| `isActive` | bool | no | New active status. |

At least one field must be provided.

### Sample request — mark as correct

```json
{
  "isCorrect": true
}
```

### Sample request — update order and status

```json
{
  "displayOrder": 2,
  "isActive": true
}
```

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "MCQ option updated successfully",
  "data": {
    "optionId": 1,
    "mcqQuestionId": 1,
    "isCorrect": true,
    "displayOrder": 2,
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
  "message": "At least one field (isCorrect, displayOrder, isActive) must be provided",
  "code": "VALIDATION_ERROR"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "MCQ option 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: mcq_option.update",
  "code": "FORBIDDEN"
}
```

---

## 3.3 `DELETE /api/v1/mcq-options/:id`

Cascade soft-delete an MCQ option by ID. Sets is_active=FALSE, is_deleted=TRUE on the option and all child option translations.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/mcq-options/:id` |
| Permission | `mcq_option.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "MCQ option deleted successfully (cascade: 3 option translations deleted)",
  "data": {
    "optionId": 1,
    "deleted": true,
    "cascadeStats": {
      "optionTranslationsDeleted": 3
    }
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "MCQ option 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: mcq_option.delete",
  "code": "FORBIDDEN"
}
```

---

## 3.4 `POST /api/v1/mcq-options/:id/restore`

Cascade restore a soft-deleted MCQ option by ID. Validates that the record is deleted and that its parent question is not deleted. Sets is_active=TRUE, is_deleted=FALSE on the option and all child option translations.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/mcq-options/:id/restore` |
| Permission | `mcq_option.restore` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "MCQ option restored successfully (cascade: 3 option translations restored)",
  "data": {
    "optionId": 1,
    "mcqQuestionId": 1,
    "isCorrect": true,
    "displayOrder": 1,
    "isActive": true,
    "createdAt": "2026-04-12T11:22:50.312Z",
    "updatedAt": "2026-04-12T11:30:02.654Z",
    "cascadeStats": {
      "optionTranslationsRestored": 3
    }
  }
}
```

#### 400 Bad Request — record not deleted

```json
{
  "success": false,
  "message": "MCQ option 1 is not deleted and cannot be restored",
  "code": "INVALID_STATE"
}
```

#### 404 Not Found — parent question deleted

```json
{
  "success": false,
  "message": "Cannot restore: parent question is deleted",
  "code": "PARENT_DELETED"
}
```

#### 404 Not Found — option not found

```json
{
  "success": false,
  "message": "MCQ option 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: mcq_option.restore",
  "code": "FORBIDDEN"
}
```

---

## 4.1 `POST /api/v1/mcq-option-translations`

Create a translation for an MCQ option. Validates that both parent option and language exist and are not soft-deleted. Validates that no duplicate (mcqOptionId, languageId) pair already exists.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/mcq-option-translations` |
| Permission | `mcq_option_translation.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `mcqOptionId` | int | yes | Must reference an existing, non-deleted MCQ option. |
| `languageId` | int | yes | Must reference an existing, non-deleted language. |
| `optionText` | string | yes | The translated option text. |
| `image` | string | no | Optional URL to option image. Nullable. |
| `isActive` | bool | no | Whether translation is active. Defaults to `true`. |

### Sample request (full)

```json
{
  "mcqOptionId": 1,
  "languageId": 1,
  "optionText": "4",
  "image": null,
  "isActive": true
}
```

### Sample request (minimal)

```json
{
  "mcqOptionId": 1,
  "languageId": 1,
  "optionText": "4"
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "MCQ option translation created successfully",
  "data": {
    "optionTranslationId": 1,
    "mcqOptionId": 1,
    "languageId": 1,
    "optionText": "4",
    "image": null,
    "isActive": true,
    "createdAt": "2026-04-12T11:22:50.312Z"
  }
}
```

#### 400 Bad Request — missing required field

```json
{
  "success": false,
  "message": "MCQ Option ID, Language ID, and Option Text are required",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "optionText",
      "message": "optionText is required"
    }
  ]
}
```

#### 404 Not Found — option does not exist

```json
{
  "success": false,
  "message": "MCQ option 999 not found or is deleted",
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
  "message": "A translation for this option in this language already exists",
  "code": "DUPLICATE_TRANSLATION"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: mcq_option_translation.create",
  "code": "FORBIDDEN"
}
```

---

## 4.2 `PATCH /api/v1/mcq-option-translations/:id`

Update an option translation by ID. Allows partial updates. Parent mcqOptionId and languageId are immutable. At least one updatable field must be provided.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/mcq-option-translations/:id` |
| Permission | `mcq_option_translation.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `optionText` | string | no | New option text. |
| `image` | string | no | New image URL. Nullable = clearable. |
| `isActive` | bool | no | New active status. |

At least one field must be provided.

### Sample request — update option text

```json
{
  "optionText": "Four"
}
```

### Sample request — update and clear image

```json
{
  "optionText": "4",
  "image": null
}
```

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "MCQ option translation updated successfully",
  "data": {
    "optionTranslationId": 1,
    "mcqOptionId": 1,
    "languageId": 1,
    "optionText": "Four",
    "image": null,
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
  "message": "At least one field (optionText, image, isActive) must be provided",
  "code": "VALIDATION_ERROR"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "MCQ option translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: mcq_option_translation.update",
  "code": "FORBIDDEN"
}
```

---

## 4.3 `DELETE /api/v1/mcq-option-translations/:id`

Soft-delete an option translation by ID. Sets is_active=FALSE, is_deleted=TRUE, and deleted_at to the current timestamp.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/mcq-option-translations/:id` |
| Permission | `mcq_option_translation.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "MCQ option translation deleted successfully",
  "data": {
    "optionTranslationId": 1,
    "deleted": true
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "MCQ option translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: mcq_option_translation.delete",
  "code": "FORBIDDEN"
}
```

---

## 4.4 `POST /api/v1/mcq-option-translations/:id/restore`

Restore a soft-deleted option translation by ID. Validates that the record is deleted and that its parent option is not deleted. Sets is_active=TRUE, is_deleted=FALSE, and deleted_at=NULL.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/mcq-option-translations/:id/restore` |
| Permission | `mcq_option_translation.restore` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "MCQ option translation restored successfully",
  "data": {
    "optionTranslationId": 1,
    "mcqOptionId": 1,
    "languageId": 1,
    "optionText": "4",
    "image": null,
    "isActive": true,
    "createdAt": "2026-04-12T11:22:50.312Z",
    "updatedAt": "2026-04-12T11:30:02.654Z"
  }
}
```

#### 400 Bad Request — record not deleted

```json
{
  "success": false,
  "message": "MCQ option translation 1 is not deleted and cannot be restored",
  "code": "INVALID_STATE"
}
```

#### 404 Not Found — parent option deleted

```json
{
  "success": false,
  "message": "Cannot restore: parent option is deleted",
  "code": "PARENT_DELETED"
}
```

#### 404 Not Found — translation not found

```json
{
  "success": false,
  "message": "MCQ option translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: mcq_option_translation.restore",
  "code": "FORBIDDEN"
}
```

---

## Cascade behavior and constraints

### MCQ Questions cascade deletion

When a question is deleted (DELETE `/api/v1/mcq-questions/:id`):
- All translations (mcq_question_translations) are soft-deleted
- All options (mcq_options) are soft-deleted
- All option translations (mcq_option_translations) are soft-deleted

When a question is restored (POST `/api/v1/mcq-questions/:id/restore`):
- All child translations are restored
- All child options and their translations are restored
- Parent topic must not be deleted

### MCQ Options cascade deletion

When an option is deleted (DELETE `/api/v1/mcq-options/:id`):
- All option translations (mcq_option_translations) are soft-deleted

When an option is restored (POST `/api/v1/mcq-options/:id/restore`):
- All child option translations are restored
- Parent question must not be deleted

### Translation constraints

- A translation cannot be created if parent question/option is soft-deleted
- A translation cannot be created if parent language is soft-deleted
- Duplicate (parent_id, language_id) pairs are rejected at creation time
- When a parent is hard-deleted, child translations are cascade hard-deleted
- When a parent is soft-deleted, child translations are cascade soft-deleted

---

## Data transfer objects (DTOs)

### MCQQuestionListDto — returned by GET /api/v1/mcq-questions

```json
{
  "translationId": 1,
  "mcqQuestionId": 1,
  "languageId": 1,
  "questionText": "What is 2 + 2?",
  "explanation": "Basic arithmetic",
  "hint": "Count on your fingers",
  "image1": "https://cdn.example.com/img1.webp",
  "image2": null,
  "translationIsActive": true,
  "translationCreatedAt": "2026-04-12T11:18:42.447Z",
  "translationUpdatedAt": "2026-04-12T11:18:42.447Z",
  "questionId": 1,
  "topicId": 5,
  "mcqType": "single",
  "code": "Q001",
  "slug": "q001",
  "points": 1,
  "displayOrder": 1,
  "difficultyLevel": "easy",
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
```

### MCQQuestionDetailDto — returned by GET /api/v1/mcq-questions/:id

Same structure as MCQQuestionListDto.

### MCQQuestionCreateDto — request body for POST /api/v1/mcq-questions

```json
{
  "topicId": 5,
  "mcqType": "single",
  "code": "Q001",
  "points": 1,
  "displayOrder": 1,
  "difficultyLevel": "easy",
  "isMandatory": true,
  "isActive": true
}
```

### MCQQuestionUpdateDto — request body for PATCH /api/v1/mcq-questions/:id

```json
{
  "mcqType": "multiple",
  "code": null,
  "points": 2,
  "displayOrder": 2,
  "difficultyLevel": "medium",
  "isMandatory": false,
  "isActive": true
}
```

### MCQQuestionTranslationCreateDto — request body for POST /api/v1/mcq-question-translations

```json
{
  "mcqQuestionId": 1,
  "languageId": 1,
  "questionText": "What is 2 + 2?",
  "explanation": "Basic arithmetic",
  "hint": "Count on your fingers",
  "image1": "https://cdn.example.com/img1.webp",
  "image2": null,
  "isActive": true
}
```

### MCQQuestionTranslationUpdateDto — request body for PATCH /api/v1/mcq-question-translations/:id

```json
{
  "questionText": "What is the sum of 2 and 2?",
  "explanation": "This is a basic math question",
  "hint": null,
  "image1": "https://cdn.example.com/img2.webp",
  "image2": null,
  "isActive": true
}
```

### MCQOptionCreateDto — request body for POST /api/v1/mcq-options

```json
{
  "mcqQuestionId": 1,
  "isCorrect": true,
  "displayOrder": 1,
  "isActive": true
}
```

### MCQOptionUpdateDto — request body for PATCH /api/v1/mcq-options/:id

```json
{
  "isCorrect": false,
  "displayOrder": 2,
  "isActive": true
}
```

### MCQOptionTranslationCreateDto — request body for POST /api/v1/mcq-option-translations

```json
{
  "mcqOptionId": 1,
  "languageId": 1,
  "optionText": "4",
  "image": null,
  "isActive": true
}
```

### MCQOptionTranslationUpdateDto — request body for PATCH /api/v1/mcq-option-translations/:id

```json
{
  "optionText": "Four",
  "image": "https://cdn.example.com/num4.webp",
  "isActive": true
}
```

---

## Field descriptions (common across DTOs)

| Field | Type | Notes |
|---|---|---|
| `translationId` | int | Unique identifier for the translation. Primary key of mcq_question_translations. |
| `mcqQuestionId` | int | Foreign key to mcq_questions table. Immutable. |
| `languageId` | int | Foreign key to languages table. Immutable. |
| `questionText` | string | The translated question text. Required at creation. |
| `explanation` | string | Optional explanation for the question (nullable). |
| `hint` | string | Optional hint for students (nullable). |
| `image1` | string | Optional URL to first image asset (nullable). |
| `image2` | string | Optional URL to second image asset (nullable). |
| `translationIsActive` | bool | Whether this translation is active. |
| `translationCreatedAt` | ISO 8601 | Timestamp of translation creation (UTC). |
| `translationUpdatedAt` | ISO 8601 | Timestamp of last translation update (UTC). |
| `questionId` | int | Unique identifier for the MCQ question. Primary key of mcq_questions. |
| `topicId` | int | Foreign key to topics table. Immutable. |
| `mcqType` | enum | Type of question: `single`, `multiple`, `true_false`. Defaults to `single`. |
| `code` | string | Unique code for the question (e.g., "Q001"). Nullable = can be cleared. |
| `slug` | string | URL-friendly slug auto-generated from code (read-only). |
| `points` | int | Points awarded for correct answer. Defaults to 1. Must be >= 0. |
| `displayOrder` | int | Display order for UI sorting (0-based). Defaults to 0. Must be >= 0. |
| `difficultyLevel` | enum | Difficulty: `easy`, `medium`, `hard`. Defaults to `easy`. |
| `isMandatory` | bool | Whether question is mandatory in assessments. Defaults to true. |
| `createdBy` | int | User ID who created the question (read-only). |
| `updatedBy` | int | User ID who last updated the question (read-only). |
| `questionIsActive` | bool | Whether the question is active (read-only). |
| `questionCreatedAt` | ISO 8601 | Timestamp of question creation (UTC). |
| `questionUpdatedAt` | ISO 8601 | Timestamp of last question update (UTC). |
| `langId` | int | Unique identifier for the language. |
| `langName` | string | Display name of the language (e.g., "English"). |
| `langCode` | string | ISO 639-1 language code (e.g., "en"). |
| `langIsActive` | bool | Whether the language is active (read-only). |
| `optionId` | int | Unique identifier for the MCQ option. Primary key of mcq_options. |
| `isCorrect` | bool | Whether this option is a correct answer. |
| `optionTranslationId` | int | Unique identifier for the option translation. Primary key of mcq_option_translations. |
| `mcqOptionId` | int | Foreign key to mcq_options table. Immutable. |
| `optionText` | string | The translated option text. Required at creation. |
| `image` | string | Optional URL to option image (nullable). |
