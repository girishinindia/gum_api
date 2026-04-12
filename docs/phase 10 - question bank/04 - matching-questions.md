# Phase 10 — Matching Questions

Matching Questions represent pair-matching question items in the question bank. Each question is tied to a topic and contains multiple pairs to match (left item ↔ right item). Each pair and question text can have translations in multiple languages, with support for text and/or images. Questions, translations, pairs, and pair translations all support soft-delete with admin restore. All routes require authentication.

Permission codes: `matching_question.create`, `matching_question.read`, `matching_question.update`, `matching_question.delete`, `matching_question.restore`, `matching_question_translation.create`, `matching_question_translation.update`, `matching_question_translation.delete`, `matching_question_translation.restore`, `matching_pair.create`, `matching_pair.update`, `matching_pair.delete`, `matching_pair.restore`, `matching_pair_translation.create`, `matching_pair_translation.update`, `matching_pair_translation.delete`, `matching_pair_translation.restore`.

- **Super-admin**: all 16 permissions.
- **Admin**: all except `*.delete` (no delete on question/translation/pair/pair-translation; only soft-delete via DELETE endpoint which still requires `*.delete` permission).

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](../00%20-%20overview.md#8-postman-environment).

← [back to Phase 10](./00%20-%20overview.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1matching-questions) | `GET` | `{{baseUrl}}/api/v1/matching-questions` | `matching_question.read` | List all matching questions with pagination, search, filter, and sort. |
| [§1.2](#12-get-apiv1matching-questionsid) | `GET` | `{{baseUrl}}/api/v1/matching-questions/:id` | `matching_question.read` | Get one matching question by translation ID (returns joined question+translation+language data). |
| [§1.3](#13-post-apiv1matching-questions) | `POST` | `{{baseUrl}}/api/v1/matching-questions` | `matching_question.create` | Create a new matching question. |
| [§1.4](#14-patch-apiv1matching-questionsid) | `PATCH` | `{{baseUrl}}/api/v1/matching-questions/:id` | `matching_question.update` | Update a matching question by ID. |
| [§1.5](#15-delete-apiv1matching-questionsid) | `DELETE` | `{{baseUrl}}/api/v1/matching-questions/:id` | `matching_question.delete` | Cascade soft-delete a matching question (question → translations → pairs → pair translations). |
| [§1.6](#16-post-apiv1matching-questionsidrestore) | `POST` | `{{baseUrl}}/api/v1/matching-questions/:id/restore` | `matching_question.restore` | Cascade restore a matching question, validates parent topic not deleted. |
| [§2.1](#21-post-apiv1matching-question-translations) | `POST` | `{{baseUrl}}/api/v1/matching-question-translations` | `matching_question_translation.create` | Create a translation for a matching question. |
| [§2.2](#22-patch-apiv1matching-question-translationsid) | `PATCH` | `{{baseUrl}}/api/v1/matching-question-translations/:id` | `matching_question_translation.update` | Update a question translation. |
| [§2.3](#23-delete-apiv1matching-question-translationsid) | `DELETE` | `{{baseUrl}}/api/v1/matching-question-translations/:id` | `matching_question_translation.delete` | Soft-delete a question translation. |
| [§2.4](#24-post-apiv1matching-question-translationsidrestore) | `POST` | `{{baseUrl}}/api/v1/matching-question-translations/:id/restore` | `matching_question_translation.restore` | Restore a question translation, validates parent question not deleted. |
| [§3.1](#31-post-apiv1matching-pairs) | `POST` | `{{baseUrl}}/api/v1/matching-pairs` | `matching_pair.create` | Create a new pair in a matching question. |
| [§3.2](#32-patch-apiv1matching-pairsid) | `PATCH` | `{{baseUrl}}/api/v1/matching-pairs/:id` | `matching_pair.update` | Update a pair by ID. |
| [§3.3](#33-delete-apiv1matching-pairsid) | `DELETE` | `{{baseUrl}}/api/v1/matching-pairs/:id` | `matching_pair.delete` | Cascade soft-delete a pair (pair → pair translations). |
| [§3.4](#34-post-apiv1matching-pairsidrestore) | `POST` | `{{baseUrl}}/api/v1/matching-pairs/:id/restore` | `matching_pair.restore` | Cascade restore a pair, validates parent question not deleted. |
| [§4.1](#41-post-apiv1matching-pair-translations) | `POST` | `{{baseUrl}}/api/v1/matching-pair-translations` | `matching_pair_translation.create` | Create a translation for a pair. |
| [§4.2](#42-patch-apiv1matching-pair-translationsid) | `PATCH` | `{{baseUrl}}/api/v1/matching-pair-translations/:id` | `matching_pair_translation.update` | Update a pair translation. |
| [§4.3](#43-delete-apiv1matching-pair-translationsid) | `DELETE` | `{{baseUrl}}/api/v1/matching-pair-translations/:id` | `matching_pair_translation.delete` | Soft-delete a pair translation. |
| [§4.4](#44-post-apiv1matching-pair-translationsidrestore) | `POST` | `{{baseUrl}}/api/v1/matching-pair-translations/:id/restore` | `matching_pair_translation.restore` | Restore a pair translation, validates parent pair not deleted. |

---

## 1.1 `GET /api/v1/matching-questions`

List all matching questions with support for pagination, search, filtering, and sorting. Results include denormalized question, translation, and language metadata.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/matching-questions` |
| Permission | `matching_question.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number (for UI convenience). |
| `pageSize` | int | `25` | 1..500. |
| `matchingQuestionId` | int | — | Filter by matching_questions.id. |
| `languageId` | int | — | Filter by matching_question_translations.language_id. |
| `topicId` | int | — | Filter by matching_questions.topic_id. |
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
      "matchingQuestionId": 1,
      "languageId": 1,
      "questionText": "Match the capital cities with their countries.",
      "explanation": "Each left item is the capital city; each right item is the country.",
      "hint": "Think about world geography",
      "image1": "https://cdn.example.com/map-1.webp",
      "image2": null,
      "translationIsActive": true,
      "translationCreatedAt": "2026-04-12T11:18:42.447Z",
      "translationUpdatedAt": "2026-04-12T11:18:42.447Z",
      "questionId": 1,
      "topicId": 5,
      "code": "MQ001",
      "slug": "match-capitals-countries",
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
      "pairCount": 5
    },
    {
      "translationId": 2,
      "matchingQuestionId": 2,
      "languageId": 1,
      "questionText": "Match the scientific elements with their symbols.",
      "explanation": "Left column: element names. Right column: chemical symbols.",
      "hint": "Consult the periodic table",
      "image1": null,
      "image2": null,
      "translationIsActive": true,
      "translationCreatedAt": "2026-04-12T11:20:15.892Z",
      "translationUpdatedAt": "2026-04-12T11:20:15.892Z",
      "questionId": 2,
      "topicId": 6,
      "code": "MQ002",
      "slug": "match-elements-symbols",
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
      "pairCount": 4
    }
  ],
  "meta": { "page": 1, "limit": 25, "totalCount": 47, "totalPages": 2 }
}
```

#### 403 Forbidden — caller lacks `matching_question.read`

```json
{
  "success": false,
  "message": "Missing required permission: matching_question.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

| # | Description | URL |
|---|---|---|
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/matching-questions?pageIndex=1&pageSize=25` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/matching-questions?pageIndex=2&pageSize=25` |
| 3 | Filter by topicId=5 | `{{baseUrl}}/api/v1/matching-questions?topicId=5` |
| 4 | Filter by difficultyLevel=easy | `{{baseUrl}}/api/v1/matching-questions?difficultyLevel=easy` |
| 5 | Filter by difficultyLevel=medium | `{{baseUrl}}/api/v1/matching-questions?difficultyLevel=medium` |
| 6 | Filter by difficultyLevel=hard | `{{baseUrl}}/api/v1/matching-questions?difficultyLevel=hard` |
| 7 | Filter by isMandatory=true | `{{baseUrl}}/api/v1/matching-questions?isMandatory=true` |
| 8 | Filter by partialScoring=true | `{{baseUrl}}/api/v1/matching-questions?partialScoring=true` |
| 9 | Filter by isActive=true | `{{baseUrl}}/api/v1/matching-questions?isActive=true` |
| 10 | Filter by languageId=1 | `{{baseUrl}}/api/v1/matching-questions?languageId=1` |
| 11 | Search — "capitals" | `{{baseUrl}}/api/v1/matching-questions?searchTerm=capitals` |
| 12 | Search — "MQ001" | `{{baseUrl}}/api/v1/matching-questions?searchTerm=MQ001` |
| 13 | Filter topicId + difficulty | `{{baseUrl}}/api/v1/matching-questions?topicId=5&difficultyLevel=medium` |
| 14 | Filter mandatory + partialScoring | `{{baseUrl}}/api/v1/matching-questions?isMandatory=true&partialScoring=true` |
| 15 | Sort by question id ASC | `{{baseUrl}}/api/v1/matching-questions?sortTable=question&sortColumn=id&sortDirection=ASC` |
| 16 | Sort by question id DESC | `{{baseUrl}}/api/v1/matching-questions?sortTable=question&sortColumn=id&sortDirection=DESC` |
| 17 | Sort by difficulty_level ASC | `{{baseUrl}}/api/v1/matching-questions?sortTable=question&sortColumn=difficulty_level&sortDirection=ASC` |
| 18 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/matching-questions?sortTable=question&sortColumn=created_at&sortDirection=DESC` |

---

## 1.2 `GET /api/v1/matching-questions/:id`

Get one matching question by translation ID, including all metadata and language info. Returns joined question, translation, and language data.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/matching-questions/:id` |
| Permission | `matching_question.read` |

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
    "matchingQuestionId": 1,
    "languageId": 1,
    "questionText": "Match the capital cities with their countries.",
    "explanation": "Each left item is the capital city; each right item is the country.",
    "hint": "Think about world geography",
    "image1": "https://cdn.example.com/map-1.webp",
    "image2": null,
    "translationIsActive": true,
    "translationCreatedAt": "2026-04-12T11:18:42.447Z",
    "translationUpdatedAt": "2026-04-12T11:18:42.447Z",
    "questionId": 1,
    "topicId": 5,
    "code": "MQ001",
    "slug": "match-capitals-countries",
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
    "pairCount": 5
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Matching question translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: matching_question.read",
  "code": "FORBIDDEN"
}
```

---

## 1.3 `POST /api/v1/matching-questions`

Create a new matching question. Validates that the parent topic exists and is not soft-deleted. Automatically generates a slug from the code if not provided.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/matching-questions` |
| Permission | `matching_question.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `topicId` | int | yes | Must reference an existing, non-deleted topic. |
| `code` | string | no | Unique code (e.g., "MQ001"). Auto-generated if not provided. Nullable = clearable. |
| `points` | int | no | Points awarded for correct match(es). Defaults to `1`. Must be >= 0. |
| `partialScoring` | bool | no | Whether partial credit is awarded for partially correct answers. Defaults to `false`. |
| `displayOrder` | int | no | Display order for UI sorting. Defaults to `0`. Must be >= 0. |
| `difficultyLevel` | enum | no | Difficulty: `easy`, `medium`, `hard`. Defaults to `easy`. |
| `isMandatory` | bool | no | Whether question is mandatory in assessments. Defaults to `true`. |
| `isActive` | bool | no | Whether question is active. Defaults to `true`. |

### Sample request (full)

```json
{
  "topicId": 5,
  "code": "MQ001",
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
  "message": "Matching question created successfully",
  "data": {
    "questionId": 1,
    "topicId": 5,
    "code": "MQ001",
    "slug": "mq001",
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
  "message": "Missing required permission: matching_question.create",
  "code": "FORBIDDEN"
}
```

---

## 1.4 `PATCH /api/v1/matching-questions/:id`

Update a matching question by ID. Allows partial updates. topicId cannot be changed (immutable foreign key). At least one updatable field must be provided.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/matching-questions/:id` |
| Permission | `matching_question.update` |

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
  "message": "Matching question updated successfully",
  "data": {
    "questionId": 1,
    "topicId": 5,
    "code": "MQ001",
    "slug": "mq001",
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
  "message": "Matching question 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: matching_question.update",
  "code": "FORBIDDEN"
}
```

---

## 1.5 `DELETE /api/v1/matching-questions/:id`

Cascade soft-delete a matching question by ID. Sets is_active=FALSE, is_deleted=TRUE on the question, all child translations, all child pairs, and all pair translations. The records remain in the database but will be filtered from most queries.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/matching-questions/:id` |
| Permission | `matching_question.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Matching question deleted successfully",
  "data": {
    "questionId": 1,
    "topicId": 5,
    "code": "MQ001",
    "slug": "mq001",
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
  "message": "Matching question 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: matching_question.delete",
  "code": "FORBIDDEN"
}
```

---

## 1.6 `POST /api/v1/matching-questions/:id/restore`

Cascade restore a soft-deleted matching question by ID. Sets is_deleted=FALSE and restores all child translations, pairs, and pair translations. Validates that the parent topic is not soft-deleted before restoring.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/matching-questions/:id/restore` |
| Permission | `matching_question.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Matching question restored successfully",
  "data": {
    "questionId": 1,
    "topicId": 5,
    "code": "MQ001",
    "slug": "mq001",
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
  "message": "Matching question 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: matching_question.restore",
  "code": "FORBIDDEN"
}
```

---

## 2.1 `POST /api/v1/matching-question-translations`

Create a translation for a matching question. Validates that the parent question exists and is not soft-deleted. Each (matchingQuestionId, languageId) pair must be unique.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/matching-question-translations` |
| Permission | `matching_question_translation.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `matchingQuestionId` | int | yes | Must reference an existing, non-deleted matching question. |
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
  "matchingQuestionId": 1,
  "languageId": 1,
  "questionText": "Match the capital cities with their countries.",
  "explanation": "Each left item is the capital city; each right item is the country.",
  "hint": "Think about world geography",
  "image1": "https://cdn.example.com/map-1.webp",
  "image2": null,
  "isActive": true
}
```

### Sample request (minimal)

```json
{
  "matchingQuestionId": 1,
  "languageId": 1,
  "questionText": "Match the capital cities with their countries."
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "Matching question translation created successfully",
  "data": {
    "translationId": 1,
    "matchingQuestionId": 1,
    "languageId": 1,
    "questionText": "Match the capital cities with their countries.",
    "explanation": "Each left item is the capital city; each right item is the country.",
    "hint": "Think about world geography",
    "image1": "https://cdn.example.com/map-1.webp",
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
  "message": "Matching question 999 not found or is deleted",
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
  "message": "Missing required permission: matching_question_translation.create",
  "code": "FORBIDDEN"
}
```

---

## 2.2 `PATCH /api/v1/matching-question-translations/:id`

Update a question translation by ID. Allows partial updates. Parent matchingQuestionId and languageId are immutable. At least one updatable field must be provided.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/matching-question-translations/:id` |
| Permission | `matching_question_translation.update` |

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
  "questionText": "Match each capital city with its corresponding country."
}
```

### Sample request — update and clear fields

```json
{
  "explanation": "A more detailed explanation",
  "hint": null,
  "image2": null
}
```

### Sample request — update images

```json
{
  "image1": "https://cdn.example.com/updated-map.webp"
}
```

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Matching question translation updated successfully",
  "data": {
    "translationId": 1,
    "matchingQuestionId": 1,
    "languageId": 1,
    "questionText": "Match each capital city with its corresponding country.",
    "explanation": "A more detailed explanation",
    "hint": null,
    "image1": "https://cdn.example.com/updated-map.webp",
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
  "message": "matchingQuestionId is immutable and cannot be changed",
  "code": "IMMUTABLE_FIELD"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Matching question translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: matching_question_translation.update",
  "code": "FORBIDDEN"
}
```

---

## 2.3 `DELETE /api/v1/matching-question-translations/:id`

Soft-delete a question translation by ID. Sets is_active=FALSE, is_deleted=TRUE on the translation record. The record remains in the database but will be filtered from most queries.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/matching-question-translations/:id` |
| Permission | `matching_question_translation.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Matching question translation deleted successfully",
  "data": {
    "translationId": 1,
    "matchingQuestionId": 1,
    "languageId": 1,
    "questionText": "Match each capital city with its corresponding country.",
    "explanation": "A more detailed explanation",
    "hint": null,
    "image1": "https://cdn.example.com/updated-map.webp",
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
  "message": "Matching question translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: matching_question_translation.delete",
  "code": "FORBIDDEN"
}
```

---

## 2.4 `POST /api/v1/matching-question-translations/:id/restore`

Restore a soft-deleted question translation by ID. Sets is_deleted=FALSE. Validates that the parent question is not soft-deleted before restoring.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/matching-question-translations/:id/restore` |
| Permission | `matching_question_translation.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Matching question translation restored successfully",
  "data": {
    "translationId": 1,
    "matchingQuestionId": 1,
    "languageId": 1,
    "questionText": "Match each capital city with its corresponding country.",
    "explanation": "A more detailed explanation",
    "hint": null,
    "image1": "https://cdn.example.com/updated-map.webp",
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
  "message": "Matching question translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: matching_question_translation.restore",
  "code": "FORBIDDEN"
}
```

---

## 3.1 `POST /api/v1/matching-pairs`

Create a new pair in a matching question. Validates that the parent question exists and is not soft-deleted.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/matching-pairs` |
| Permission | `matching_pair.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `matchingQuestionId` | int | yes | Must reference an existing, non-deleted matching question. |
| `displayOrder` | int | no | Display order for pair sequencing. Defaults to `0`. Must be >= 0. |
| `isActive` | bool | no | Whether pair is active. Defaults to `true`. |

### Sample request (full)

```json
{
  "matchingQuestionId": 1,
  "displayOrder": 1,
  "isActive": true
}
```

### Sample request (minimal)

```json
{
  "matchingQuestionId": 1
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "Matching pair created successfully",
  "data": {
    "pairId": 1,
    "matchingQuestionId": 1,
    "displayOrder": 1,
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
  "message": "Matching question ID is required",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "matchingQuestionId",
      "message": "matchingQuestionId is required"
    }
  ]
}
```

#### 404 Not Found — question does not exist

```json
{
  "success": false,
  "message": "Matching question 999 not found or is deleted",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: matching_pair.create",
  "code": "FORBIDDEN"
}
```

---

## 3.2 `PATCH /api/v1/matching-pairs/:id`

Update a pair by ID. Allows partial updates. Parent matchingQuestionId is immutable. At least one updatable field must be provided.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/matching-pairs/:id` |
| Permission | `matching_pair.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `displayOrder` | int | no | New display order. Must be >= 0. |
| `isActive` | bool | no | New active status. |

At least one field must be provided.

### Sample request — update display order

```json
{
  "displayOrder": 2
}
```

### Sample request — deactivate pair

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
  "message": "Matching pair updated successfully",
  "data": {
    "pairId": 1,
    "matchingQuestionId": 1,
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
  "message": "At least one field (displayOrder, isActive) must be provided",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — attempt to update FK

```json
{
  "success": false,
  "message": "matchingQuestionId is immutable and cannot be changed",
  "code": "IMMUTABLE_FIELD"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Matching pair 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: matching_pair.update",
  "code": "FORBIDDEN"
}
```

---

## 3.3 `DELETE /api/v1/matching-pairs/:id`

Cascade soft-delete a pair by ID. Sets is_active=FALSE, is_deleted=TRUE on the pair and all child pair translations. The records remain in the database but will be filtered from most queries.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/matching-pairs/:id` |
| Permission | `matching_pair.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Matching pair deleted successfully",
  "data": {
    "pairId": 1,
    "matchingQuestionId": 1,
    "displayOrder": 2,
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
  "message": "Matching pair 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: matching_pair.delete",
  "code": "FORBIDDEN"
}
```

---

## 3.4 `POST /api/v1/matching-pairs/:id/restore`

Cascade restore a soft-deleted pair by ID. Sets is_deleted=FALSE and restores all child pair translations. Validates that the parent question is not soft-deleted before restoring.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/matching-pairs/:id/restore` |
| Permission | `matching_pair.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Matching pair restored successfully",
  "data": {
    "pairId": 1,
    "matchingQuestionId": 1,
    "displayOrder": 2,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-12T11:22:50.312Z",
    "updatedAt": "2026-04-12T11:27:42.156Z"
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
  "message": "Matching pair 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: matching_pair.restore",
  "code": "FORBIDDEN"
}
```

---

## 4.1 `POST /api/v1/matching-pair-translations`

Create a translation for a matching pair. Validates that the parent pair exists and is not soft-deleted. Each (matchingPairId, languageId) pair must be unique.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/matching-pair-translations` |
| Permission | `matching_pair_translation.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `matchingPairId` | int | yes | Must reference an existing, non-deleted matching pair. |
| `languageId` | int | yes | Must reference an existing, active language. |
| `leftText` | string | yes | The left item text. |
| `rightText` | string | yes | The right item text. |
| `leftImage` | string | no | Optional left item image URL. Nullable = clearable. |
| `rightImage` | string | no | Optional right item image URL. Nullable = clearable. |
| `isActive` | bool | no | Whether translation is active. Defaults to `true`. |

### Sample request (full)

```json
{
  "matchingPairId": 1,
  "languageId": 1,
  "leftText": "Paris",
  "rightText": "France",
  "leftImage": "https://cdn.example.com/paris.webp",
  "rightImage": "https://cdn.example.com/france-flag.webp",
  "isActive": true
}
```

### Sample request (minimal — text only)

```json
{
  "matchingPairId": 1,
  "languageId": 1,
  "leftText": "Paris",
  "rightText": "France"
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "Matching pair translation created successfully",
  "data": {
    "translationId": 1,
    "matchingPairId": 1,
    "languageId": 1,
    "leftText": "Paris",
    "rightText": "France",
    "leftImage": "https://cdn.example.com/paris.webp",
    "rightImage": "https://cdn.example.com/france-flag.webp",
    "isActive": true,
    "createdAt": "2026-04-12T11:22:50.312Z"
  }
}
```

#### 400 Bad Request — missing required field

```json
{
  "success": false,
  "message": "Left text is required",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "leftText",
      "message": "leftText is required"
    }
  ]
}
```

#### 404 Not Found — pair does not exist

```json
{
  "success": false,
  "message": "Matching pair 999 not found or is deleted",
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
  "message": "A translation for this pair in this language already exists",
  "code": "DUPLICATE_TRANSLATION"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: matching_pair_translation.create",
  "code": "FORBIDDEN"
}
```

---

## 4.2 `PATCH /api/v1/matching-pair-translations/:id`

Update a pair translation by ID. Allows partial updates. Parent matchingPairId and languageId are immutable. At least one updatable field must be provided.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/matching-pair-translations/:id` |
| Permission | `matching_pair_translation.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `leftText` | string | no | New left item text. |
| `rightText` | string | no | New right item text. |
| `leftImage` | string | no | New left image URL. Nullable = clearable. |
| `rightImage` | string | no | New right image URL. Nullable = clearable. |
| `isActive` | bool | no | New active status. |

At least one field must be provided.

### Sample request — update both text items

```json
{
  "leftText": "Paris",
  "rightText": "France"
}
```

### Sample request — update and clear images

```json
{
  "leftImage": "https://cdn.example.com/paris-updated.webp",
  "rightImage": null
}
```

### Sample request — deactivate translation

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
  "message": "Matching pair translation updated successfully",
  "data": {
    "translationId": 1,
    "matchingPairId": 1,
    "languageId": 1,
    "leftText": "Paris",
    "rightText": "France",
    "leftImage": "https://cdn.example.com/paris-updated.webp",
    "rightImage": null,
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
  "message": "At least one field (leftText, rightText, leftImage, rightImage, isActive) must be provided",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad Request — attempt to update FK

```json
{
  "success": false,
  "message": "matchingPairId is immutable and cannot be changed",
  "code": "IMMUTABLE_FIELD"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Matching pair translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: matching_pair_translation.update",
  "code": "FORBIDDEN"
}
```

---

## 4.3 `DELETE /api/v1/matching-pair-translations/:id`

Soft-delete a pair translation by ID. Sets is_active=FALSE, is_deleted=TRUE on the translation record. The record remains in the database but will be filtered from most queries.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/matching-pair-translations/:id` |
| Permission | `matching_pair_translation.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Matching pair translation deleted successfully",
  "data": {
    "translationId": 1,
    "matchingPairId": 1,
    "languageId": 1,
    "leftText": "Paris",
    "rightText": "France",
    "leftImage": "https://cdn.example.com/paris-updated.webp",
    "rightImage": null,
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
  "message": "Matching pair translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: matching_pair_translation.delete",
  "code": "FORBIDDEN"
}
```

---

## 4.4 `POST /api/v1/matching-pair-translations/:id/restore`

Restore a soft-deleted pair translation by ID. Sets is_deleted=FALSE. Validates that the parent pair is not soft-deleted before restoring.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/matching-pair-translations/:id/restore` |
| Permission | `matching_pair_translation.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "Matching pair translation restored successfully",
  "data": {
    "translationId": 1,
    "matchingPairId": 1,
    "languageId": 1,
    "leftText": "Paris",
    "rightText": "France",
    "leftImage": "https://cdn.example.com/paris-updated.webp",
    "rightImage": null,
    "isActive": true,
    "isDeleted": false,
    "createdAt": "2026-04-12T11:22:50.312Z",
    "updatedAt": "2026-04-12T11:32:45.123Z"
  }
}
```

#### 400 Bad Request — parent pair is deleted

```json
{
  "success": false,
  "message": "Cannot restore: parent pair is deleted",
  "code": "INVALID_STATE"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Matching pair translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: matching_pair_translation.restore",
  "code": "FORBIDDEN"
}
```
