# Phase 10 — One-Word Questions

One-Word Questions represent short-answer question items in the question bank. Each question is tied to a topic and can be of type one_word, fill_in_the_blank, or code_output. Questions support multiple language translations and have associated synonyms (alternative correct answers) that also translate. Additional question-specific fields include is_case_sensitive, is_trim_whitespace, and correct_answer (on the translation). Questions and all child translations and synonyms support soft-delete with admin restore. All routes require authentication.

Permission codes: `one_word_question.create`, `one_word_question.read`, `one_word_question.update`, `one_word_question.delete`, `one_word_question.restore`, `one_word_question_translation.create`, `one_word_question_translation.update`, `one_word_question_translation.delete`, `one_word_question_translation.restore`, `one_word_synonym.create`, `one_word_synonym.update`, `one_word_synonym.delete`, `one_word_synonym.restore`, `one_word_synonym_translation.create`, `one_word_synonym_translation.update`, `one_word_synonym_translation.delete`, `one_word_synonym_translation.restore`.

- **Super-admin**: all 18 permissions.
- **Admin**: all except `*.delete` (no delete on question/synonym/translation; only soft-delete via DELETE endpoint which still requires `*.delete` permission).

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](../00%20-%20overview.md#8-postman-environment).

← [back to Phase 10](./00%20-%20overview.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1one-word-questions) | `GET` | `{{baseUrl}}/api/v1/one-word-questions` | `one_word_question.read` | List all one-word questions with pagination, search, filter, and sort. |
| [§1.2](#12-get-apiv1one-word-questionsid) | `GET` | `{{baseUrl}}/api/v1/one-word-questions/:id` | `one_word_question.read` | Get one one-word question by translation ID (returns joined question+translation+language data). |
| [§1.3](#13-post-apiv1one-word-questions) | `POST` | `{{baseUrl}}/api/v1/one-word-questions` | `one_word_question.create` | Create a new one-word question. |
| [§1.4](#14-patch-apiv1one-word-questionsid) | `PATCH` | `{{baseUrl}}/api/v1/one-word-questions/:id` | `one_word_question.update` | Update a one-word question by ID. |
| [§1.5](#15-delete-apiv1one-word-questionsid) | `DELETE` | `{{baseUrl}}/api/v1/one-word-questions/:id` | `one_word_question.delete` | Cascade soft-delete a one-word question (question → translations → synonyms → synonym translations). |
| [§1.6](#16-post-apiv1one-word-questionsidrestore) | `POST` | `{{baseUrl}}/api/v1/one-word-questions/:id/restore` | `one_word_question.restore` | Cascade restore a one-word question, validates parent topic not deleted. |
| [§2.1](#21-post-apiv1one-word-question-translations) | `POST` | `{{baseUrl}}/api/v1/one-word-question-translations` | `one_word_question_translation.create` | Create a translation for a one-word question. |
| [§2.2](#22-patch-apiv1one-word-question-translationsid) | `PATCH` | `{{baseUrl}}/api/v1/one-word-question-translations/:id` | `one_word_question_translation.update` | Update a question translation. |
| [§2.3](#23-delete-apiv1one-word-question-translationsid) | `DELETE` | `{{baseUrl}}/api/v1/one-word-question-translations/:id` | `one_word_question_translation.delete` | Soft-delete a question translation. |
| [§2.4](#24-post-apiv1one-word-question-translationsidrestore) | `POST` | `{{baseUrl}}/api/v1/one-word-question-translations/:id/restore` | `one_word_question_translation.restore` | Restore a question translation, validates parent question not deleted. |
| [§3.1](#31-post-apiv1one-word-synonyms) | `POST` | `{{baseUrl}}/api/v1/one-word-synonyms` | `one_word_synonym.create` | Create a synonym (alternative correct answer) for a one-word question. |
| [§3.2](#32-patch-apiv1one-word-synonymsid) | `PATCH` | `{{baseUrl}}/api/v1/one-word-synonyms/:id` | `one_word_synonym.update` | Update a one-word synonym. |
| [§3.3](#33-delete-apiv1one-word-synonymsid) | `DELETE` | `{{baseUrl}}/api/v1/one-word-synonyms/:id` | `one_word_synonym.delete` | Cascade soft-delete a synonym (synonym → synonym translations). |
| [§3.4](#34-post-apiv1one-word-synonymsidrestore) | `POST` | `{{baseUrl}}/api/v1/one-word-synonyms/:id/restore` | `one_word_synonym.restore` | Cascade restore a synonym, validates parent question not deleted. |
| [§4.1](#41-post-apiv1one-word-synonym-translations) | `POST` | `{{baseUrl}}/api/v1/one-word-synonym-translations` | `one_word_synonym_translation.create` | Create a translation for a one-word synonym. |
| [§4.2](#42-patch-apiv1one-word-synonym-translationsid) | `PATCH` | `{{baseUrl}}/api/v1/one-word-synonym-translations/:id` | `one_word_synonym_translation.update` | Update a synonym translation. |
| [§4.3](#43-delete-apiv1one-word-synonym-translationsid) | `DELETE` | `{{baseUrl}}/api/v1/one-word-synonym-translations/:id` | `one_word_synonym_translation.delete` | Soft-delete a synonym translation. |
| [§4.4](#44-post-apiv1one-word-synonym-translationsidrestore) | `POST` | `{{baseUrl}}/api/v1/one-word-synonym-translations/:id/restore` | `one_word_synonym_translation.restore` | Restore a synonym translation, validates parent synonym not deleted. |

---

## 1.1 `GET /api/v1/one-word-questions`

List all one-word questions with support for pagination, search, filtering, and sorting. Results include denormalized question, translation, and language metadata.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/one-word-questions` |
| Permission | `one_word_question.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number (for UI convenience). |
| `pageSize` | int | `25` | 1..500. |
| `oneWordQuestionId` | int | — | Filter by one_word_questions.id. |
| `languageId` | int | — | Filter by one_word_question_translations.language_id. |
| `topicId` | int | — | Filter by one_word_questions.topic_id. |
| `questionType` | enum | — | Filter by question_type: `one_word`, `fill_in_the_blank`, `code_output`. |
| `difficultyLevel` | enum | — | Filter by difficulty_level: `easy`, `medium`, `hard`. |
| `isMandatory` | bool | — | Filter by is_mandatory flag. |
| `isCaseSensitive` | bool | — | Filter by is_case_sensitive flag. |
| `isActive` | bool | — | Filter by question is_active flag. |
| `filterIsActive` | bool | — | Filter by translation is_active flag. |
| `searchTerm` | string | — | `ILIKE` across question code, slug, and translation question_text. |
| `sortTable` | enum | `translation` | Sort by `question` (base table) or `translation` (translation table). |
| `sortColumn` | string | `created_at` | See [sort columns table](#sort-columns-reference) below. |
| `sortDirection` | enum | `DESC` | `ASC` \| `DESC`. |

**Sort columns reference:**

When `sortTable=question`: `id`, `topic_id`, `code`, `slug`, `points`, `display_order`, `difficulty_level`, `question_type`, `is_case_sensitive`, `is_trim_whitespace`, `created_at`, `updated_at`.

When `sortTable=translation`: `id`, `one_word_question_id`, `language_id`, `question_text`, `correct_answer`, `created_at`, `updated_at`.

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
      "oneWordQuestionId": 1,
      "languageId": 1,
      "questionText": "What is the capital of France?",
      "explanation": "Paris is the largest city and capital of France",
      "hint": "It starts with P",
      "correctAnswer": "Paris",
      "image1": "https://cdn.example.com/paris.webp",
      "image2": null,
      "translationIsActive": true,
      "translationCreatedAt": "2026-04-12T11:18:42.447Z",
      "translationUpdatedAt": "2026-04-12T11:18:42.447Z",
      "questionId": 1,
      "topicId": 5,
      "questionType": "one_word",
      "code": "OWQ001",
      "slug": "capital-of-france",
      "points": 1,
      "isCaseSensitive": false,
      "isTrimWhitespace": true,
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
      "oneWordQuestionId": 2,
      "languageId": 1,
      "questionText": "Complete the blank: The quick brown fox jumps over the ___",
      "explanation": "This is a famous pangram used to test fonts",
      "hint": "It's an animal",
      "correctAnswer": "lazy dog",
      "image1": null,
      "image2": null,
      "translationIsActive": true,
      "translationCreatedAt": "2026-04-12T11:20:15.892Z",
      "translationUpdatedAt": "2026-04-12T11:20:15.892Z",
      "questionId": 2,
      "topicId": 5,
      "questionType": "fill_in_the_blank",
      "code": "OWQ002",
      "slug": "quick-brown-fox-blank",
      "points": 2,
      "isCaseSensitive": false,
      "isTrimWhitespace": true,
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
  "meta": { "page": 1, "limit": 25, "totalCount": 47, "totalPages": 2 }
}
```

#### 403 Forbidden — caller lacks `one_word_question.read`

```json
{
  "success": false,
  "message": "Missing required permission: one_word_question.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

| # | Description | URL |
|---|---|---|
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/one-word-questions?pageIndex=1&pageSize=25` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/one-word-questions?pageIndex=2&pageSize=25` |
| 3 | Filter by topicId=5 | `{{baseUrl}}/api/v1/one-word-questions?topicId=5` |
| 4 | Filter by questionType=one_word | `{{baseUrl}}/api/v1/one-word-questions?questionType=one_word` |
| 5 | Filter by questionType=fill_in_the_blank | `{{baseUrl}}/api/v1/one-word-questions?questionType=fill_in_the_blank` |
| 6 | Filter by questionType=code_output | `{{baseUrl}}/api/v1/one-word-questions?questionType=code_output` |
| 7 | Filter by difficultyLevel=easy | `{{baseUrl}}/api/v1/one-word-questions?difficultyLevel=easy` |
| 8 | Filter by difficultyLevel=medium | `{{baseUrl}}/api/v1/one-word-questions?difficultyLevel=medium` |
| 9 | Filter by difficultyLevel=hard | `{{baseUrl}}/api/v1/one-word-questions?difficultyLevel=hard` |
| 10 | Filter by isMandatory=true | `{{baseUrl}}/api/v1/one-word-questions?isMandatory=true` |
| 11 | Filter by isCaseSensitive=true | `{{baseUrl}}/api/v1/one-word-questions?isCaseSensitive=true` |
| 12 | Filter by isActive=true | `{{baseUrl}}/api/v1/one-word-questions?isActive=true` |
| 13 | Filter by languageId=1 | `{{baseUrl}}/api/v1/one-word-questions?languageId=1` |
| 14 | Search — "capital" | `{{baseUrl}}/api/v1/one-word-questions?searchTerm=capital` |
| 15 | Search — "OWQ001" | `{{baseUrl}}/api/v1/one-word-questions?searchTerm=OWQ001` |
| 16 | Filter topicId + difficulty | `{{baseUrl}}/api/v1/one-word-questions?topicId=5&difficultyLevel=easy` |
| 17 | Filter questionType + mandatory | `{{baseUrl}}/api/v1/one-word-questions?questionType=one_word&isMandatory=true` |
| 18 | Sort by question id ASC | `{{baseUrl}}/api/v1/one-word-questions?sortTable=question&sortColumn=id&sortDirection=ASC` |
| 19 | Sort by question id DESC | `{{baseUrl}}/api/v1/one-word-questions?sortTable=question&sortColumn=id&sortDirection=DESC` |
| 20 | Sort by difficulty_level ASC | `{{baseUrl}}/api/v1/one-word-questions?sortTable=question&sortColumn=difficulty_level&sortDirection=ASC` |
| 21 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/one-word-questions?sortTable=question&sortColumn=created_at&sortDirection=DESC` |
| 22 | Sort by translation question_text ASC | `{{baseUrl}}/api/v1/one-word-questions?sortTable=translation&sortColumn=question_text&sortDirection=ASC` |
| 23 | Combo — topic + difficulty + sort | `{{baseUrl}}/api/v1/one-word-questions?topicId=5&difficultyLevel=easy&sortTable=question&sortColumn=display_order&sortDirection=ASC` |
| 24 | Combo — search + filter + paginate | `{{baseUrl}}/api/v1/one-word-questions?pageIndex=1&pageSize=10&topicId=5&questionType=one_word&searchTerm=capital` |

---

## 1.2 `GET /api/v1/one-word-questions/:id`

Get one one-word question by translation ID, including all metadata and language info. Returns joined question, translation, and language data.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/one-word-questions/:id` |
| Permission | `one_word_question.read` |

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
    "oneWordQuestionId": 1,
    "languageId": 1,
    "questionText": "What is the capital of France?",
    "explanation": "Paris is the largest city and capital of France",
    "hint": "It starts with P",
    "correctAnswer": "Paris",
    "image1": "https://cdn.example.com/paris.webp",
    "image2": null,
    "translationIsActive": true,
    "translationCreatedAt": "2026-04-12T11:18:42.447Z",
    "translationUpdatedAt": "2026-04-12T11:18:42.447Z",
    "questionId": 1,
    "topicId": 5,
    "questionType": "one_word",
    "code": "OWQ001",
    "slug": "capital-of-france",
    "points": 1,
    "isCaseSensitive": false,
    "isTrimWhitespace": true,
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
  "message": "One-word question translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: one_word_question.read",
  "code": "FORBIDDEN"
}
```

---

## 1.3 `POST /api/v1/one-word-questions`

Create a new one-word question. Validates that the parent topic exists and is not soft-deleted. Automatically generates a slug from the code if not provided.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/one-word-questions` |
| Permission | `one_word_question.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `topicId` | int | yes | Must reference an existing, non-deleted topic. |
| `questionType` | enum | no | Type of question: `one_word`, `fill_in_the_blank`, `code_output`. Defaults to `one_word`. |
| `code` | string | no | Unique code (e.g., "OWQ001"). Auto-generated if not provided. Nullable = clearable. |
| `points` | int | no | Points awarded for correct answer. Defaults to `1`. Must be >= 0. |
| `isCaseSensitive` | bool | no | Whether correct answer is case-sensitive. Defaults to `false`. |
| `isTrimWhitespace` | bool | no | Whether to trim whitespace before matching. Defaults to `true`. |
| `displayOrder` | int | no | Display order for UI sorting. Defaults to `0`. Must be >= 0. |
| `difficultyLevel` | enum | no | Difficulty: `easy`, `medium`, `hard`. Defaults to `easy`. |
| `isMandatory` | bool | no | Whether question is mandatory in assessments. Defaults to `true`. |
| `isActive` | bool | no | Whether question is active. Defaults to `true`. |

### Sample request (full)

```json
{
  "topicId": 5,
  "questionType": "one_word",
  "code": "OWQ001",
  "points": 1,
  "isCaseSensitive": false,
  "isTrimWhitespace": true,
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
  "message": "One-word question created successfully",
  "data": {
    "questionId": 1,
    "topicId": 5,
    "questionType": "one_word",
    "code": "OWQ001",
    "slug": "owq001",
    "points": 1,
    "isCaseSensitive": false,
    "isTrimWhitespace": true,
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

#### 400 Bad Request — invalid questionType

```json
{
  "success": false,
  "message": "Invalid questionType",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "questionType",
      "message": "questionType must be one of: one_word, fill_in_the_blank, code_output"
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
  "message": "Missing required permission: one_word_question.create",
  "code": "FORBIDDEN"
}
```

---

## 1.4 `PATCH /api/v1/one-word-questions/:id`

Update a one-word question by ID. Allows partial updates. topicId cannot be changed (immutable foreign key). At least one updatable field must be provided.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/one-word-questions/:id` |
| Permission | `one_word_question.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `questionType` | enum | no | `one_word`, `fill_in_the_blank`, `code_output`. |
| `code` | string | no | Unique code. Nullable = clearable. |
| `points` | int | no | Points awarded. Must be >= 0. |
| `isCaseSensitive` | bool | no | Case-sensitive flag. |
| `isTrimWhitespace` | bool | no | Trim whitespace flag. |
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

### Sample request — change questionType

```json
{
  "questionType": "fill_in_the_blank"
}
```

### Sample request — update case sensitivity

```json
{
  "isCaseSensitive": true
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
  "message": "One-word question updated successfully",
  "data": {
    "questionId": 1,
    "topicId": 5,
    "questionType": "fill_in_the_blank",
    "code": "OWQ001",
    "slug": "owq001",
    "points": 2,
    "isCaseSensitive": true,
    "isTrimWhitespace": true,
    "displayOrder": 1,
    "difficultyLevel": "medium",
    "isMandatory": true,
    "isActive": true,
    "createdAt": "2026-04-12T11:22:50.312Z",
    "updatedAt": "2026-04-12T11:25:10.892Z",
    "createdBy": 10,
    "updatedBy": 10
  }
}
```

#### 400 Bad Request — no fields provided

```json
{
  "success": false,
  "message": "At least one field must be provided for update",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — invalid enum value

```json
{
  "success": false,
  "message": "Invalid questionType",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "questionType",
      "message": "questionType must be one of: one_word, fill_in_the_blank, code_output"
    }
  ]
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "One-word question 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: one_word_question.update",
  "code": "FORBIDDEN"
}
```

---

## 1.5 `DELETE /api/v1/one-word-questions/:id`

Cascade soft-delete a one-word question and all its child translations and synonyms (including all synonym translations). Marks the question and all descendants as deleted.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/one-word-questions/:id` |
| Permission | `one_word_question.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 204 No Content — happy path

(Empty response body on success)

#### 404 Not Found

```json
{
  "success": false,
  "message": "One-word question 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: one_word_question.delete",
  "code": "FORBIDDEN"
}
```

---

## 1.6 `POST /api/v1/one-word-questions/:id/restore`

Cascade restore a soft-deleted one-word question and all its child translations and synonyms. Validates that the parent topic is not deleted. Returns the restored question.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/one-word-questions/:id/restore` |
| Permission | `one_word_question.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "One-word question restored successfully",
  "data": {
    "questionId": 1,
    "topicId": 5,
    "questionType": "one_word",
    "code": "OWQ001",
    "slug": "owq001",
    "points": 1,
    "isCaseSensitive": false,
    "isTrimWhitespace": true,
    "displayOrder": 1,
    "difficultyLevel": "easy",
    "isMandatory": true,
    "isActive": true,
    "createdAt": "2026-04-12T11:22:50.312Z",
    "updatedAt": "2026-04-12T11:26:15.445Z",
    "createdBy": 10,
    "updatedBy": 10
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "One-word question 999 not found",
  "code": "NOT_FOUND"
}
```

#### 409 Conflict — parent topic is deleted

```json
{
  "success": false,
  "message": "Cannot restore: parent topic is deleted",
  "code": "CONFLICT"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: one_word_question.restore",
  "code": "FORBIDDEN"
}
```

---

## 2.1 `POST /api/v1/one-word-question-translations`

Create a translation for a one-word question. Validates that the parent question and language both exist and are not soft-deleted. Enforces unique constraint: only one translation per (question_id, language_id) pair.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/one-word-question-translations` |
| Permission | `one_word_question_translation.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `oneWordQuestionId` | int | yes | Foreign key to one_word_questions. Question must exist and not be deleted. |
| `languageId` | int | yes | Foreign key to languages. Language must exist and be active. |
| `questionText` | string | yes | The translated question text. |
| `correctAnswer` | string | yes | The correct answer for this translation. |
| `explanation` | string | no | Optional explanation (nullable). |
| `hint` | string | no | Optional hint for students (nullable). |
| `image1` | string | no | Optional URL to first image asset (nullable). |
| `image2` | string | no | Optional URL to second image asset (nullable). |
| `isActive` | bool | no | Whether translation is active. Defaults to `true`. |

### Sample request (full)

```json
{
  "oneWordQuestionId": 1,
  "languageId": 1,
  "questionText": "What is the capital of France?",
  "correctAnswer": "Paris",
  "explanation": "Paris is the largest city and capital of France",
  "hint": "It starts with P",
  "image1": "https://cdn.example.com/paris.webp",
  "image2": null,
  "isActive": true
}
```

### Sample request (minimal)

```json
{
  "oneWordQuestionId": 1,
  "languageId": 1,
  "questionText": "What is the capital of France?",
  "correctAnswer": "Paris"
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "One-word question translation created successfully",
  "data": {
    "translationId": 1,
    "oneWordQuestionId": 1,
    "languageId": 1,
    "questionText": "What is the capital of France?",
    "correctAnswer": "Paris",
    "explanation": "Paris is the largest city and capital of France",
    "hint": "It starts with P",
    "image1": "https://cdn.example.com/paris.webp",
    "image2": null,
    "isActive": true,
    "createdAt": "2026-04-12T11:23:15.892Z",
    "createdBy": 10
  }
}
```

#### 400 Bad Request — missing required field

```json
{
  "success": false,
  "message": "Question text and correct answer are required",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "questionText",
      "message": "questionText is required"
    },
    {
      "field": "correctAnswer",
      "message": "correctAnswer is required"
    }
  ]
}
```

#### 404 Not Found — question or language does not exist

```json
{
  "success": false,
  "message": "One-word question 999 not found or is deleted",
  "code": "NOT_FOUND"
}
```

#### 409 Conflict — duplicate translation

```json
{
  "success": false,
  "message": "Translation already exists for this question and language",
  "code": "CONFLICT"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: one_word_question_translation.create",
  "code": "FORBIDDEN"
}
```

---

## 2.2 `PATCH /api/v1/one-word-question-translations/:id`

Update a one-word question translation. Allows partial updates. oneWordQuestionId and languageId cannot be changed (immutable foreign keys). At least one updatable field must be provided. Nullable fields can be cleared by sending `null`.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/one-word-question-translations/:id` |
| Permission | `one_word_question_translation.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `questionText` | string | no | Updated question text. |
| `correctAnswer` | string | no | Updated correct answer. |
| `explanation` | string | no | Updated explanation (send `null` to clear). |
| `hint` | string | no | Updated hint (send `null` to clear). |
| `image1` | string | no | Updated image URL (send `null` to clear). |
| `image2` | string | no | Updated image URL (send `null` to clear). |
| `isActive` | bool | no | Updated active status. |

At least one field must be provided.

### Sample request — update question and answer

```json
{
  "questionText": "What is the capital of France?",
  "correctAnswer": "Paris"
}
```

### Sample request — update with null

```json
{
  "explanation": null,
  "hint": "It starts with P"
}
```

### Sample request — toggle active status

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
  "message": "One-word question translation updated successfully",
  "data": {
    "translationId": 1,
    "oneWordQuestionId": 1,
    "languageId": 1,
    "questionText": "What is the capital of France?",
    "correctAnswer": "Paris",
    "explanation": null,
    "hint": "It starts with P",
    "image1": "https://cdn.example.com/paris.webp",
    "image2": null,
    "isActive": false,
    "createdAt": "2026-04-12T11:23:15.892Z",
    "updatedAt": "2026-04-12T11:24:30.156Z",
    "createdBy": 10,
    "updatedBy": 10
  }
}
```

#### 400 Bad Request — no fields provided

```json
{
  "success": false,
  "message": "At least one field must be provided for update",
  "code": "VALIDATION_ERROR"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "One-word question translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: one_word_question_translation.update",
  "code": "FORBIDDEN"
}
```

---

## 2.3 `DELETE /api/v1/one-word-question-translations/:id`

Soft-delete a one-word question translation.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/one-word-question-translations/:id` |
| Permission | `one_word_question_translation.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 204 No Content — happy path

(Empty response body on success)

#### 404 Not Found

```json
{
  "success": false,
  "message": "One-word question translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: one_word_question_translation.delete",
  "code": "FORBIDDEN"
}
```

---

## 2.4 `POST /api/v1/one-word-question-translations/:id/restore`

Restore a soft-deleted one-word question translation. Validates that the parent question is not deleted.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/one-word-question-translations/:id/restore` |
| Permission | `one_word_question_translation.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "One-word question translation restored successfully",
  "data": {
    "translationId": 1,
    "oneWordQuestionId": 1,
    "languageId": 1,
    "questionText": "What is the capital of France?",
    "correctAnswer": "Paris",
    "explanation": "Paris is the largest city and capital of France",
    "hint": "It starts with P",
    "image1": "https://cdn.example.com/paris.webp",
    "image2": null,
    "isActive": true,
    "createdAt": "2026-04-12T11:23:15.892Z",
    "updatedAt": "2026-04-12T11:25:45.223Z",
    "createdBy": 10,
    "updatedBy": 10
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "One-word question translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 409 Conflict — parent question is deleted

```json
{
  "success": false,
  "message": "Cannot restore: parent question is deleted",
  "code": "CONFLICT"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: one_word_question_translation.restore",
  "code": "FORBIDDEN"
}
```

---

## 3.1 `POST /api/v1/one-word-synonyms`

Create a synonym (alternative correct answer) for a one-word question. Validates that the parent question exists and is not soft-deleted.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/one-word-synonyms` |
| Permission | `one_word_synonym.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `oneWordQuestionId` | int | yes | Foreign key to one_word_questions. Question must exist and not be deleted. |
| `displayOrder` | int | no | Display order for UI sorting. Defaults to `0`. Must be >= 0. |
| `isActive` | bool | no | Whether synonym is active. Defaults to `true`. |

### Sample request (full)

```json
{
  "oneWordQuestionId": 1,
  "displayOrder": 1,
  "isActive": true
}
```

### Sample request (minimal)

```json
{
  "oneWordQuestionId": 1
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "One-word synonym created successfully",
  "data": {
    "synonymId": 1,
    "oneWordQuestionId": 1,
    "displayOrder": 1,
    "isActive": true,
    "createdAt": "2026-04-12T11:24:00.512Z",
    "createdBy": 10
  }
}
```

#### 400 Bad Request — missing required field

```json
{
  "success": false,
  "message": "One-word question ID is required",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "oneWordQuestionId",
      "message": "oneWordQuestionId is required"
    }
  ]
}
```

#### 404 Not Found — question does not exist

```json
{
  "success": false,
  "message": "One-word question 999 not found or is deleted",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: one_word_synonym.create",
  "code": "FORBIDDEN"
}
```

---

## 3.2 `PATCH /api/v1/one-word-synonyms/:id`

Update a one-word synonym. Allows partial updates. oneWordQuestionId cannot be changed (immutable foreign key). At least one updatable field must be provided.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/one-word-synonyms/:id` |
| Permission | `one_word_synonym.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `displayOrder` | int | no | Display order. Must be >= 0. |
| `isActive` | bool | no | Active status. |

At least one field must be provided.

### Sample request

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
  "message": "One-word synonym updated successfully",
  "data": {
    "synonymId": 1,
    "oneWordQuestionId": 1,
    "displayOrder": 2,
    "isActive": true,
    "createdAt": "2026-04-12T11:24:00.512Z",
    "updatedAt": "2026-04-12T11:25:20.678Z",
    "createdBy": 10,
    "updatedBy": 10
  }
}
```

#### 400 Bad Request — no fields provided

```json
{
  "success": false,
  "message": "At least one field must be provided for update",
  "code": "VALIDATION_ERROR"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "One-word synonym 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: one_word_synonym.update",
  "code": "FORBIDDEN"
}
```

---

## 3.3 `DELETE /api/v1/one-word-synonyms/:id`

Cascade soft-delete a one-word synonym and all its child synonym translations.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/one-word-synonyms/:id` |
| Permission | `one_word_synonym.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 204 No Content — happy path

(Empty response body on success)

#### 404 Not Found

```json
{
  "success": false,
  "message": "One-word synonym 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: one_word_synonym.delete",
  "code": "FORBIDDEN"
}
```

---

## 3.4 `POST /api/v1/one-word-synonyms/:id/restore`

Cascade restore a soft-deleted one-word synonym and all its child synonym translations. Validates that the parent question is not deleted.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/one-word-synonyms/:id/restore` |
| Permission | `one_word_synonym.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "One-word synonym restored successfully",
  "data": {
    "synonymId": 1,
    "oneWordQuestionId": 1,
    "displayOrder": 2,
    "isActive": true,
    "createdAt": "2026-04-12T11:24:00.512Z",
    "updatedAt": "2026-04-12T11:26:10.234Z",
    "createdBy": 10,
    "updatedBy": 10
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "One-word synonym 999 not found",
  "code": "NOT_FOUND"
}
```

#### 409 Conflict — parent question is deleted

```json
{
  "success": false,
  "message": "Cannot restore: parent question is deleted",
  "code": "CONFLICT"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: one_word_synonym.restore",
  "code": "FORBIDDEN"
}
```

---

## 4.1 `POST /api/v1/one-word-synonym-translations`

Create a translation for a one-word synonym. Validates that the parent synonym and language both exist and are not soft-deleted. Enforces unique constraint: only one translation per (synonym_id, language_id) pair.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/one-word-synonym-translations` |
| Permission | `one_word_synonym_translation.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `oneWordSynonymId` | int | yes | Foreign key to one_word_synonyms. Synonym must exist and not be deleted. |
| `languageId` | int | yes | Foreign key to languages. Language must exist and be active. |
| `synonymText` | string | yes | The translated synonym text. |
| `isActive` | bool | no | Whether translation is active. Defaults to `true`. |

### Sample request (full)

```json
{
  "oneWordSynonymId": 1,
  "languageId": 1,
  "synonymText": "Parisian capital",
  "isActive": true
}
```

### Sample request (minimal)

```json
{
  "oneWordSynonymId": 1,
  "languageId": 1,
  "synonymText": "Parisian capital"
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "One-word synonym translation created successfully",
  "data": {
    "synonymTranslationId": 1,
    "oneWordSynonymId": 1,
    "languageId": 1,
    "synonymText": "Parisian capital",
    "isActive": true,
    "createdAt": "2026-04-12T11:24:30.892Z",
    "createdBy": 10
  }
}
```

#### 400 Bad Request — missing required field

```json
{
  "success": false,
  "message": "Synonym text is required",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "synonymText",
      "message": "synonymText is required"
    }
  ]
}
```

#### 404 Not Found — synonym or language does not exist

```json
{
  "success": false,
  "message": "One-word synonym 999 not found or is deleted",
  "code": "NOT_FOUND"
}
```

#### 409 Conflict — duplicate translation

```json
{
  "success": false,
  "message": "Translation already exists for this synonym and language",
  "code": "CONFLICT"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: one_word_synonym_translation.create",
  "code": "FORBIDDEN"
}
```

---

## 4.2 `PATCH /api/v1/one-word-synonym-translations/:id`

Update a one-word synonym translation. Allows partial updates. oneWordSynonymId and languageId cannot be changed (immutable foreign keys). At least one updatable field must be provided.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/one-word-synonym-translations/:id` |
| Permission | `one_word_synonym_translation.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `synonymText` | string | no | Updated synonym text. |
| `isActive` | bool | no | Updated active status. |

At least one field must be provided.

### Sample request

```json
{
  "synonymText": "French capital",
  "isActive": true
}
```

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "One-word synonym translation updated successfully",
  "data": {
    "synonymTranslationId": 1,
    "oneWordSynonymId": 1,
    "languageId": 1,
    "synonymText": "French capital",
    "isActive": true,
    "createdAt": "2026-04-12T11:24:30.892Z",
    "updatedAt": "2026-04-12T11:25:55.445Z",
    "createdBy": 10,
    "updatedBy": 10
  }
}
```

#### 400 Bad Request — no fields provided

```json
{
  "success": false,
  "message": "At least one field must be provided for update",
  "code": "VALIDATION_ERROR"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "One-word synonym translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: one_word_synonym_translation.update",
  "code": "FORBIDDEN"
}
```

---

## 4.3 `DELETE /api/v1/one-word-synonym-translations/:id`

Soft-delete a one-word synonym translation.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/one-word-synonym-translations/:id` |
| Permission | `one_word_synonym_translation.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 204 No Content — happy path

(Empty response body on success)

#### 404 Not Found

```json
{
  "success": false,
  "message": "One-word synonym translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: one_word_synonym_translation.delete",
  "code": "FORBIDDEN"
}
```

---

## 4.4 `POST /api/v1/one-word-synonym-translations/:id/restore`

Restore a soft-deleted one-word synonym translation. Validates that the parent synonym is not deleted.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/one-word-synonym-translations/:id/restore` |
| Permission | `one_word_synonym_translation.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "One-word synonym translation restored successfully",
  "data": {
    "synonymTranslationId": 1,
    "oneWordSynonymId": 1,
    "languageId": 1,
    "synonymText": "French capital",
    "isActive": true,
    "createdAt": "2026-04-12T11:24:30.892Z",
    "updatedAt": "2026-04-12T11:26:25.567Z",
    "createdBy": 10,
    "updatedBy": 10
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "One-word synonym translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 409 Conflict — parent synonym is deleted

```json
{
  "success": false,
  "message": "Cannot restore: parent synonym is deleted",
  "code": "CONFLICT"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: one_word_synonym_translation.restore",
  "code": "FORBIDDEN"
}
```

---

## Request DTOs — full definitions

### OneWordQuestionCreateDto — request body for POST /api/v1/one-word-questions

```json
{
  "topicId": 5,
  "questionType": "one_word",
  "code": "OWQ001",
  "points": 1,
  "isCaseSensitive": false,
  "isTrimWhitespace": true,
  "displayOrder": 1,
  "difficultyLevel": "easy",
  "isMandatory": true,
  "isActive": true
}
```

### OneWordQuestionUpdateDto — request body for PATCH /api/v1/one-word-questions/:id

```json
{
  "questionType": "fill_in_the_blank",
  "code": "OWQ001",
  "points": 2,
  "isCaseSensitive": true,
  "isTrimWhitespace": true,
  "displayOrder": 1,
  "difficultyLevel": "medium",
  "isMandatory": true,
  "isActive": true
}
```

### OneWordQuestionTranslationCreateDto — request body for POST /api/v1/one-word-question-translations

```json
{
  "oneWordQuestionId": 1,
  "languageId": 1,
  "questionText": "What is the capital of France?",
  "correctAnswer": "Paris",
  "explanation": "Paris is the largest city and capital of France",
  "hint": "It starts with P",
  "image1": "https://cdn.example.com/paris.webp",
  "image2": null,
  "isActive": true
}
```

### OneWordQuestionTranslationUpdateDto — request body for PATCH /api/v1/one-word-question-translations/:id

```json
{
  "questionText": "What is the capital of France?",
  "correctAnswer": "Paris",
  "explanation": "This is a basic geography question",
  "hint": null,
  "image1": "https://cdn.example.com/paris2.webp",
  "image2": null,
  "isActive": true
}
```

### OneWordSynonymCreateDto — request body for POST /api/v1/one-word-synonyms

```json
{
  "oneWordQuestionId": 1,
  "displayOrder": 1,
  "isActive": true
}
```

### OneWordSynonymUpdateDto — request body for PATCH /api/v1/one-word-synonyms/:id

```json
{
  "displayOrder": 2,
  "isActive": true
}
```

### OneWordSynonymTranslationCreateDto — request body for POST /api/v1/one-word-synonym-translations

```json
{
  "oneWordSynonymId": 1,
  "languageId": 1,
  "synonymText": "Parisian capital",
  "isActive": true
}
```

### OneWordSynonymTranslationUpdateDto — request body for PATCH /api/v1/one-word-synonym-translations/:id

```json
{
  "synonymText": "French capital",
  "isActive": true
}
```

---

## Field descriptions (common across DTOs)

| Field | Type | Notes |
|---|---|---|
| `translationId` | int | Unique identifier for the translation. Primary key of one_word_question_translations. |
| `oneWordQuestionId` | int | Foreign key to one_word_questions table. Immutable. |
| `languageId` | int | Foreign key to languages table. Immutable. |
| `questionText` | string | The translated question text. Required at creation. |
| `correctAnswer` | string | The correct answer string for this translation. Compared against user input after case/whitespace handling. Required at creation. |
| `explanation` | string | Optional explanation for the question (nullable). |
| `hint` | string | Optional hint for students (nullable). |
| `image1` | string | Optional URL to first image asset (nullable). |
| `image2` | string | Optional URL to second image asset (nullable). |
| `translationIsActive` | bool | Whether this translation is active. |
| `translationCreatedAt` | ISO 8601 | Timestamp of translation creation (UTC). |
| `translationUpdatedAt` | ISO 8601 | Timestamp of last translation update (UTC). |
| `questionId` | int | Unique identifier for the one-word question. Primary key of one_word_questions. |
| `topicId` | int | Foreign key to topics table. Immutable. |
| `questionType` | enum | Type of question: `one_word`, `fill_in_the_blank`, `code_output`. Defaults to `one_word`. |
| `code` | string | Unique code for the question (e.g., "OWQ001"). Nullable = can be cleared. |
| `slug` | string | URL-friendly slug auto-generated from code (read-only). |
| `points` | int | Points awarded for correct answer. Defaults to 1. Must be >= 0. |
| `isCaseSensitive` | bool | Whether correct answer matching is case-sensitive. Defaults to false. |
| `isTrimWhitespace` | bool | Whether to trim whitespace before matching user answer. Defaults to true. |
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
| `synonymId` | int | Unique identifier for the one-word synonym. Primary key of one_word_synonyms. |
| `synonymTranslationId` | int | Unique identifier for the synonym translation. Primary key of one_word_synonym_translations. |
| `oneWordSynonymId` | int | Foreign key to one_word_synonyms table. Immutable. |
| `synonymText` | string | The translated synonym text (alternative correct answer). Required at creation. |
