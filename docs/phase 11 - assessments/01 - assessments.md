# Phase 11 — Assessments

Assessments are the evaluation units of the Grow Up More platform. Each assessment belongs to a scope (chapter, module, or course) and has a type (assignment, mini_project, capstone_project). Assessments support multiple content types (coding, github, pdf, image, mixed), difficulty levels, scoring, deadlines, and translatable content. Translations include title, description, instructions, tech stack, learning outcomes, images, tags, and full SEO metadata. Assessments support soft-delete with cascade to translations/attachments/solutions, and admin restore.

Permission codes: `assessment.read`, `assessment.create`, `assessment.update`, `assessment.delete`, `assessment.restore`, `assessment_translation.read`, `assessment_translation.create`, `assessment_translation.update`, `assessment_translation.delete`, `assessment_translation.restore`.

- **Super-admin**: all 10 permissions.
- **Admin**: all except `assessment.delete` and `assessment_translation.delete`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`**.

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1assessments) | `GET` | `/api/v1/assessments` | `assessment.read` | List assessments with pagination, search, filter, sort. |
| [§1.2](#12-get-apiv1assessmentsid) | `GET` | `/api/v1/assessments/:id` | `assessment.read` | Get one assessment by ID (includes deleted — phase-02 contract). |
| [§1.3](#13-post-apiv1assessments) | `POST` | `/api/v1/assessments` | `assessment.create` | Create a new assessment. |
| [§1.4](#14-patch-apiv1assessmentsid) | `PATCH` | `/api/v1/assessments/:id` | `assessment.update` | Update an assessment. |
| [§1.5](#15-delete-apiv1assessmentsid) | `DELETE` | `/api/v1/assessments/:id` | `assessment.delete` | Soft-delete (cascades to translations, attachments, solutions). |
| [§1.6](#16-post-apiv1assessmentsidrestore) | `POST` | `/api/v1/assessments/:id/restore` | `assessment.restore` | Restore a soft-deleted assessment (cascades). |
| [§2.1](#21-get-apiv1assessmentsidtranslations) | `GET` | `/api/v1/assessments/:id/translations` | `assessment_translation.read` | List translations of an assessment. |
| [§2.2](#22-get-apiv1assessmentsidtranslationstid) | `GET` | `/api/v1/assessments/:id/translations/:tid` | `assessment_translation.read` | Get one translation by ID. |
| [§2.3](#23-post-apiv1assessmentsidtranslations) | `POST` | `/api/v1/assessments/:id/translations` | `assessment_translation.create` | Create a translation. |
| [§2.4](#24-patch-apiv1assessmentsidtranslationstid) | `PATCH` | `/api/v1/assessments/:id/translations/:tid` | `assessment_translation.update` | Update a translation. |
| [§2.5](#25-delete-apiv1assessmentsidtranslationstid) | `DELETE` | `/api/v1/assessments/:id/translations/:tid` | `assessment_translation.delete` | Soft-delete a translation. |
| [§2.6](#26-post-apiv1assessmentsidtranslationstidrestore) | `POST` | `/api/v1/assessments/:id/translations/:tid/restore` | `assessment_translation.restore` | Restore a soft-deleted translation. |

---

## Type-Scope constraints

| assessment_type | Allowed scope(s) |
|---|---|
| `assignment` | `chapter`, `module` |
| `mini_project` | `module` |
| `capstone_project` | `course` |

The required FK depends on scope: `chapterId` for chapter, `moduleId` for module, `courseId` for course. Other FKs must be null.

---

## 1.1 `GET /api/v1/assessments`

List all assessments with their translation context.

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `languageId` | int | — | Filter by language (e.g., `1` for English). |
| `assessmentType` | enum | — | `assignment`, `mini_project`, `capstone_project`. |
| `assessmentScope` | enum | — | `chapter`, `module`, `course`. |
| `contentType` | enum | — | `coding`, `github`, `pdf`, `image`, `mixed`. |
| `difficultyLevel` | enum | — | `easy`, `medium`, `hard`. |
| `chapterId` | int | — | Filter by chapter. |
| `moduleId` | int | — | Filter by module. |
| `courseId` | int | — | Filter by course. |
| `isMandatory` | bool | — | Filter mandatory assessments. |
| `isActive` | bool | — | Filter by active flag. |
| `isDeleted` | bool | `false` | Include soft-deleted assessments. |
| `searchTerm` | string | — | Searches title, description, instructions, code, slug, focus_keyword. |
| `sortColumn` | enum | `display_order` | `display_order`, `code`, `slug`, `points`, `difficulty_level`, `due_days`, `estimated_hours`, `created_at`, `updated_at`, `title`, `assessment_type`, `assessment_scope`, `content_type`. |
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
      "assessmentType": "assignment",
      "assessmentScope": "chapter",
      "chapterId": 4,
      "moduleId": null,
      "courseId": null,
      "contentType": "coding",
      "code": "CH4_ASN_001",
      "slug": "ch4asn001",
      "points": 75,
      "difficultyLevel": "hard",
      "dueDays": null,
      "estimatedHours": null,
      "isMandatory": true,
      "displayOrder": 0,
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-12T10:00:00.000Z",
      "updatedAt": "2026-04-12T10:05:00.000Z",
      "deletedAt": null,
      "translation": {
        "id": 1,
        "languageId": 1,
        "title": "Advanced REST API Design",
        "description": "Master RESTful API patterns",
        "instructions": "Complete 5 coding exercises covering CRUD operations",
        "techStack": ["Node.js", "Express", "PostgreSQL"],
        "learningOutcomes": ["Design REST APIs", "Handle errors", "Write tests"],
        "image1": null,
        "image2": null,
        "tags": [],
        "metaTitle": null,
        "metaDescription": null,
        "isActive": true,
        "languageName": "English",
        "languageIsoCode": "en"
      }
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
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/assessments?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/assessments?pageIndex=2&pageSize=20` |
| 3 | Custom page size (10) | `{{baseUrl}}/api/v1/assessments?pageIndex=1&pageSize=10` |
| 4 | Filter by languageId=1 | `{{baseUrl}}/api/v1/assessments?languageId=1` |
| 5 | Filter by assessmentType=assignment | `{{baseUrl}}/api/v1/assessments?assessmentType=assignment` |
| 6 | Filter by assessmentType=mini_project | `{{baseUrl}}/api/v1/assessments?assessmentType=mini_project` |
| 7 | Filter by assessmentType=capstone_project | `{{baseUrl}}/api/v1/assessments?assessmentType=capstone_project` |
| 8 | Filter by assessmentScope=chapter | `{{baseUrl}}/api/v1/assessments?assessmentScope=chapter` |
| 9 | Filter by assessmentScope=module | `{{baseUrl}}/api/v1/assessments?assessmentScope=module` |
| 10 | Filter by assessmentScope=course | `{{baseUrl}}/api/v1/assessments?assessmentScope=course` |
| 11 | Filter by contentType=coding | `{{baseUrl}}/api/v1/assessments?contentType=coding` |
| 12 | Filter by contentType=github | `{{baseUrl}}/api/v1/assessments?contentType=github` |
| 13 | Filter by contentType=pdf | `{{baseUrl}}/api/v1/assessments?contentType=pdf` |
| 14 | Filter by contentType=image | `{{baseUrl}}/api/v1/assessments?contentType=image` |
| 15 | Filter by contentType=mixed | `{{baseUrl}}/api/v1/assessments?contentType=mixed` |
| 16 | Filter by difficultyLevel=easy | `{{baseUrl}}/api/v1/assessments?difficultyLevel=easy` |
| 17 | Filter by difficultyLevel=medium | `{{baseUrl}}/api/v1/assessments?difficultyLevel=medium` |
| 18 | Filter by difficultyLevel=hard | `{{baseUrl}}/api/v1/assessments?difficultyLevel=hard` |
| 19 | Filter by chapterId=4 | `{{baseUrl}}/api/v1/assessments?chapterId=4` |
| 20 | Filter by moduleId=2 | `{{baseUrl}}/api/v1/assessments?moduleId=2` |
| 21 | Filter by courseId=1 | `{{baseUrl}}/api/v1/assessments?courseId=1` |
| 22 | Filter by isMandatory=true | `{{baseUrl}}/api/v1/assessments?isMandatory=true` |
| 23 | Filter by isActive=true | `{{baseUrl}}/api/v1/assessments?isActive=true` |
| 24 | Filter by isDeleted=true | `{{baseUrl}}/api/v1/assessments?isDeleted=true` |
| 25 | Search — "REST" | `{{baseUrl}}/api/v1/assessments?searchTerm=REST` |
| 26 | Search — "CH4_ASN" | `{{baseUrl}}/api/v1/assessments?searchTerm=CH4_ASN` |
| 27 | Filter type + scope | `{{baseUrl}}/api/v1/assessments?assessmentType=assignment&assessmentScope=chapter` |
| 28 | Filter type + difficulty | `{{baseUrl}}/api/v1/assessments?assessmentType=mini_project&difficultyLevel=hard` |
| 29 | Filter scope + content type | `{{baseUrl}}/api/v1/assessments?assessmentScope=module&contentType=coding` |
| 30 | Sort by display_order ASC | `{{baseUrl}}/api/v1/assessments?sortColumn=display_order&sortDirection=ASC` |
| 31 | Sort by display_order DESC | `{{baseUrl}}/api/v1/assessments?sortColumn=display_order&sortDirection=DESC` |
| 32 | Sort by code ASC | `{{baseUrl}}/api/v1/assessments?sortColumn=code&sortDirection=ASC` |
| 33 | Sort by points DESC | `{{baseUrl}}/api/v1/assessments?sortColumn=points&sortDirection=DESC` |
| 34 | Sort by difficulty_level ASC | `{{baseUrl}}/api/v1/assessments?sortColumn=difficulty_level&sortDirection=ASC` |
| 35 | Sort by due_days DESC | `{{baseUrl}}/api/v1/assessments?sortColumn=due_days&sortDirection=DESC` |
| 36 | Sort by estimated_hours DESC | `{{baseUrl}}/api/v1/assessments?sortColumn=estimated_hours&sortDirection=DESC` |
| 37 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/assessments?sortColumn=created_at&sortDirection=DESC` |
| 38 | Sort by updated_at DESC | `{{baseUrl}}/api/v1/assessments?sortColumn=updated_at&sortDirection=DESC` |
| 39 | Sort by title ASC | `{{baseUrl}}/api/v1/assessments?sortColumn=title&sortDirection=ASC` |
| 40 | Sort by assessment_type ASC | `{{baseUrl}}/api/v1/assessments?sortColumn=assessment_type&sortDirection=ASC` |
| 41 | Sort by assessment_scope ASC | `{{baseUrl}}/api/v1/assessments?sortColumn=assessment_scope&sortDirection=ASC` |
| 42 | Sort by content_type ASC | `{{baseUrl}}/api/v1/assessments?sortColumn=content_type&sortDirection=ASC` |
| 43 | Combo — chapter assignments, sorted by points | `{{baseUrl}}/api/v1/assessments?assessmentType=assignment&assessmentScope=chapter&sortColumn=points&sortDirection=DESC` |
| 44 | Combo — search + filter + paginate | `{{baseUrl}}/api/v1/assessments?pageIndex=1&pageSize=10&assessmentType=assignment&difficultyLevel=easy&searchTerm=API` |
| 45 | Combo — mandatory hard assessments | `{{baseUrl}}/api/v1/assessments?isMandatory=true&difficultyLevel=hard&sortColumn=created_at&sortDirection=DESC` |

---

## 1.2 `GET /api/v1/assessments/:id`

Get a single assessment by ID. **Phase-02 contract**: returns the record even if soft-deleted.

### Responses

#### 200 OK

Same shape as a single object in §1.1 `data[]`.

#### 404 Not Found

```json
{ "success": false, "message": "Assessment 999 not found" }
```

---

## 1.3 `POST /api/v1/assessments`

Create a new assessment.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `assessmentType` | enum | no | Default: `assignment`. Values: `assignment`, `mini_project`, `capstone_project`. |
| `assessmentScope` | enum | no | Default: `chapter`. Values: `chapter`, `module`, `course`. Must be compatible with type. |
| `chapterId` | int | cond. | Required when scope = `chapter`. Others must be null. |
| `moduleId` | int | cond. | Required when scope = `module`. Others must be null. |
| `courseId` | int | cond. | Required when scope = `course`. Others must be null. |
| `contentType` | enum | no | Default: `coding`. Values: `coding`, `github`, `pdf`, `image`, `mixed`. |
| `code` | string | no | Unique identifier code (e.g., `CH4_ASN_001`). Auto-generates slug. |
| `points` | number | no | Default: 0. Max 9999.99. |
| `difficultyLevel` | enum | no | Default: `medium`. Values: `easy`, `medium`, `hard`. |
| `dueDays` | int | no | Days to complete (null = no deadline). |
| `estimatedHours` | number | no | For projects. |
| `isMandatory` | bool | no | Default: `true`. |
| `displayOrder` | int | no | Default: 0. |
| `isActive` | bool | no | Default: `true`. |

**Example request**

```json
{
  "assessmentType": "assignment",
  "assessmentScope": "chapter",
  "chapterId": 4,
  "contentType": "coding",
  "code": "CH4_ASN_002",
  "points": 50,
  "difficultyLevel": "medium"
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Assessment created",
  "data": { "id": 2, "assessmentType": "assignment", "assessmentScope": "chapter", "..." : "..." }
}
```

#### 400 Validation Error

```json
{ "success": false, "message": "assignment type requires scope: chapter or module." }
```

```json
{ "success": false, "message": "chapter_id is required when scope is chapter." }
```

```json
{ "success": false, "message": "When scope is chapter, module_id and course_id must be NULL." }
```

---

## 1.4 `PATCH /api/v1/assessments/:id`

Update an assessment. Scope and scope-FKs are **immutable** (cannot change after creation). Assessment type can be changed only if compatible with current scope.

**Request body** — at least one field required.

| Field | Type | Notes |
|---|---|---|
| `assessmentType` | enum | Must be compatible with current scope. |
| `contentType` | enum | |
| `code` | string | |
| `points` | number | |
| `difficultyLevel` | enum | |
| `dueDays` | int | |
| `estimatedHours` | number | |
| `isMandatory` | bool | |
| `displayOrder` | int | |
| `isActive` | bool | |

### Responses

#### 200 OK

Returns the updated assessment (same shape as §1.2).

#### 400 Bad Request

```json
{ "success": false, "message": "capstone_project type cannot be set for scope: chapter." }
```

#### 404 Not Found

```json
{ "success": false, "message": "assessment_id does not exist or is deleted." }
```

---

## 1.5 `DELETE /api/v1/assessments/:id`

Soft-delete an assessment. **Cascades** to: assessment_translations, assessment_attachments, assessment_attachment_translations, assessment_solutions, assessment_solution_translations.

### Responses

#### 200 OK

```json
{ "success": true, "message": "Assessment deleted", "data": { "id": 1, "deleted": true } }
```

#### 400 Bad Request

```json
{ "success": false, "message": "assessment_id does not exist or is already deleted." }
```

---

## 1.6 `POST /api/v1/assessments/:id/restore`

Restore a soft-deleted assessment. **Cascades** restore to all child records. Validates parent scope-FK is not deleted.

### Responses

#### 200 OK

Returns the restored assessment (same shape as §1.2).

#### 400 Bad Request

```json
{ "success": false, "message": "Cannot restore assessment: parent chapter is deleted." }
```

```json
{ "success": false, "message": "assessment_id does not exist or is not deleted." }
```

---

## 2.1 `GET /api/v1/assessments/:id/translations`

List all translations for a specific assessment.

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | |
| `pageSize` | int | `20` | |
| `languageId` | int | — | Filter by language. |
| `isActive` | bool | — | |
| `isDeleted` | bool | `false` | |
| `searchTerm` | string | — | |
| `sortColumn` | enum | `created_at` | `id`, `title`, `created_at`, `updated_at`. |
| `sortDirection` | enum | `DESC` | |

### Responses

#### 200 OK

Same paginated shape as §1.1, filtered to translations of the given assessment.

### Saved examples to add in Postman

| # | Description | URL |
|---|---|---|
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/assessments/1/translations?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/assessments/1/translations?pageIndex=2&pageSize=20` |
| 3 | Filter by languageId=1 | `{{baseUrl}}/api/v1/assessments/1/translations?languageId=1` |
| 4 | Filter by isActive=true | `{{baseUrl}}/api/v1/assessments/1/translations?isActive=true` |
| 5 | Filter by isDeleted=true | `{{baseUrl}}/api/v1/assessments/1/translations?isDeleted=true` |
| 6 | Search — "REST" | `{{baseUrl}}/api/v1/assessments/1/translations?searchTerm=REST` |
| 7 | Sort by id ASC | `{{baseUrl}}/api/v1/assessments/1/translations?sortColumn=id&sortDirection=ASC` |
| 8 | Sort by title ASC | `{{baseUrl}}/api/v1/assessments/1/translations?sortColumn=title&sortDirection=ASC` |
| 9 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/assessments/1/translations?sortColumn=created_at&sortDirection=DESC` |
| 10 | Sort by updated_at DESC | `{{baseUrl}}/api/v1/assessments/1/translations?sortColumn=updated_at&sortDirection=DESC` |
| 11 | Combo — language + search | `{{baseUrl}}/api/v1/assessments/1/translations?languageId=1&searchTerm=API` |
| 12 | Combo — filter + sort + paginate | `{{baseUrl}}/api/v1/assessments/1/translations?pageIndex=1&pageSize=10&isActive=true&sortColumn=title&sortDirection=ASC` |

---

## 2.2 `GET /api/v1/assessments/:id/translations/:tid`

Get a single translation by translation ID.

### Responses

#### 200 OK / 404 Not Found

Same as §1.2 pattern.

---

## 2.3 `POST /api/v1/assessments/:id/translations`

Create a translation for an assessment. One translation per language per assessment.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `languageId` | int | **yes** | Must reference active, non-deleted language. |
| `title` | string | **yes** | 1-500 chars. |
| `description` | string | no | Up to 10,000 chars. |
| `instructions` | string | no | Up to 10,000 chars. |
| `techStack` | json array | no | e.g., `["Node.js", "Express"]`. |
| `learningOutcomes` | json array | no | e.g., `["Build REST APIs"]`. |
| `image1` | string | no | URL. |
| `image2` | string | no | URL. |
| `tags` | json array | no | |
| `metaTitle` | string | no | SEO. |
| `metaDescription` | string | no | SEO. |
| `metaKeywords` | string | no | SEO. |
| `canonicalUrl` | string | no | SEO. |
| `ogSiteName` | string | no | Open Graph. |
| `ogTitle` | string | no | Open Graph. |
| `ogDescription` | string | no | Open Graph. |
| `ogType` | string | no | Open Graph. |
| `ogImage` | string | no | Open Graph. |
| `ogUrl` | string | no | Open Graph. |
| `twitterSite` | string | no | Twitter Card. |
| `twitterTitle` | string | no | Twitter Card. |
| `twitterDescription` | string | no | Twitter Card. |
| `twitterImage` | string | no | Twitter Card. |
| `twitterCard` | string | no | Default: `summary_large_image`. |
| `robotsDirective` | string | no | Default: `index,follow`. |
| `focusKeyword` | string | no | SEO. |
| `structuredData` | json array | no | JSON-LD. |
| `isActive` | bool | no | Default: `true`. |

**Example request**

```json
{
  "languageId": 1,
  "title": "Introduction to REST APIs",
  "description": "Build and test RESTful APIs using Node.js and Express",
  "instructions": "Complete 5 coding exercises",
  "techStack": ["Node.js", "Express", "PostgreSQL"],
  "learningOutcomes": ["Design REST APIs", "Handle errors"]
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Assessment translation created",
  "data": { "id": 1, "..." : "..." }
}
```

#### 400 Bad Request

```json
{ "success": false, "message": "assessment_id does not exist, is inactive, or is deleted." }
```

```json
{ "success": false, "message": "A translation for this assessment and language already exists." }
```

---

## 2.4 `PATCH /api/v1/assessments/:id/translations/:tid`

Update a translation. `assessment_id` and `language_id` are immutable. Text fields support clearing by sending empty string `""` (sets to NULL). JSONB fields use COALESCE (NULL = keep current).

**Request body** — at least one field required. Same fields as §2.3 except `languageId`.

### Responses

#### 200 OK

Returns the updated translation.

#### 400 Bad Request

```json
{ "success": false, "message": "title cannot be empty string. Use NULL to keep current value." }
```

---

## 2.5 `DELETE /api/v1/assessments/:id/translations/:tid`

Soft-delete a single translation.

### Responses

#### 200 OK

```json
{ "success": true, "message": "Assessment translation deleted", "data": { "id": 1, "deleted": true } }
```

---

## 2.6 `POST /api/v1/assessments/:id/translations/:tid/restore`

Restore a soft-deleted translation. Validates parent assessment is not deleted.

### Responses

#### 200 OK

Returns the restored translation.

#### 400 Bad Request

```json
{ "success": false, "message": "Cannot restore translation: parent assessment is deleted." }
```

---

## Common error responses (all endpoints)

| Status | When |
|---|---|
| `400` | Validation failure, constraint violation, or UDF error. |
| `401` | Missing or invalid JWT token. |
| `403` | User lacks the required permission. |
| `404` | Resource not found (GET /:id, PATCH /:id). |
| `409` | Duplicate entry (e.g., same assessment+language translation). |
| `500` | Internal server error. |
