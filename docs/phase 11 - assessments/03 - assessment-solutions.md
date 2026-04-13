# Phase 11 — Assessment Solutions

Assessment solutions are the answer/walkthrough materials for assessments — video walkthroughs, solution code, reference PDFs, etc. Each assessment can have many solutions. Solutions support an extra `video` type with video-specific metadata (URL, duration, translated video title/description/thumbnail). Each solution supports multilingual translations. Solutions support soft-delete with cascade to translations and admin restore.

Permission codes: `assessment_solution.read`, `assessment_solution.create`, `assessment_solution.update`, `assessment_solution.delete`, `assessment_solution.restore`, `assessment_solution_translation.read`, `assessment_solution_translation.create`, `assessment_solution_translation.update`, `assessment_solution_translation.delete`, `assessment_solution_translation.restore`.

- **Super-admin**: all 10 permissions.
- **Admin**: all except `assessment_solution.delete` and `assessment_solution_translation.delete`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`**.

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1assessmentsassessmentidsolutions) | `GET` | `/api/v1/assessments/:assessmentId/solutions` | `assessment_solution.read` | List solutions for an assessment. |
| [§1.2](#12-get-apiv1assessmentsassessmentidsolutionsid) | `GET` | `/api/v1/assessments/:assessmentId/solutions/:id` | `assessment_solution.read` | Get one solution by ID (includes deleted — phase-02 contract). |
| [§1.3](#13-post-apiv1assessmentsassessmentidsolutions) | `POST` | `/api/v1/assessments/:assessmentId/solutions` | `assessment_solution.create` | Create a new solution. |
| [§1.4](#14-patch-apiv1assessmentsassessmentidsolutionsid) | `PATCH` | `/api/v1/assessments/:assessmentId/solutions/:id` | `assessment_solution.update` | Update a solution. |
| [§1.5](#15-delete-apiv1assessmentsassessmentidsolutionsid) | `DELETE` | `/api/v1/assessments/:assessmentId/solutions/:id` | `assessment_solution.delete` | Soft-delete (cascades to translations). |
| [§1.6](#16-post-apiv1assessmentsassessmentidsolutionsidrestore) | `POST` | `/api/v1/assessments/:assessmentId/solutions/:id/restore` | `assessment_solution.restore` | Restore a soft-deleted solution (cascades). |
| [§2.1](#21-get-apiv1assessmentsassessmentidsolutionsidtranslations) | `GET` | `/api/v1/assessments/:assessmentId/solutions/:id/translations` | `assessment_solution_translation.read` | List translations of a solution. |
| [§2.2](#22-get-apiv1assessmentsassessmentidsolutionsidtranslationstid) | `GET` | `/api/v1/assessments/:assessmentId/solutions/:id/translations/:tid` | `assessment_solution_translation.read` | Get one translation by ID. |
| [§2.3](#23-post-apiv1assessmentsassessmentidsolutionsidtranslations) | `POST` | `/api/v1/assessments/:assessmentId/solutions/:id/translations` | `assessment_solution_translation.create` | Create a translation. |
| [§2.4](#24-patch-apiv1assessmentsassessmentidsolutionsidtranslationstid) | `PATCH` | `/api/v1/assessments/:assessmentId/solutions/:id/translations/:tid` | `assessment_solution_translation.update` | Update a translation. |
| [§2.5](#25-delete-apiv1assessmentsassessmentidsolutionsidtranslationstid) | `DELETE` | `/api/v1/assessments/:assessmentId/solutions/:id/translations/:tid` | `assessment_solution_translation.delete` | Soft-delete a translation. |
| [§2.6](#26-post-apiv1assessmentsassessmentidsolutionsidtranslationstidrestore) | `POST` | `/api/v1/assessments/:assessmentId/solutions/:id/translations/:tid/restore` | `assessment_solution_translation.restore` | Restore a soft-deleted translation. |

---

## Solution types

| solution_type | Description |
|---|---|
| `coding_file` | Source code solution files |
| `github_link` | GitHub repository with solution code |
| `pdf` | PDF solution documents |
| `image` | Solution images/diagrams |
| `video` | Video walkthroughs (YouTube, Vimeo, self-hosted) |
| `other` | Any other solution format |

**URL constraint**: At least one of `fileUrl`, `githubUrl`, or `videoUrl` must be provided.

---

## 1.1 `GET /api/v1/assessments/:assessmentId/solutions`

List all solutions for an assessment with their translation context.

**Headers**

```
Authorization: Bearer {{accessToken}}
```

**Query parameters**

| Param | Type | Default | Description |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `50` | Rows per page (1–200). |
| `languageId` | int | — | Filter by language. |
| `solutionType` | string | — | Filter: `coding_file`, `github_link`, `pdf`, `image`, `video`, `other`. |
| `isActive` | bool | — | Filter by active status. |
| `isDeleted` | bool | `false` | Include soft-deleted rows. |
| `searchTerm` | string | — | ILIKE search over title, description, video_title, file_name. |
| `sortColumn` | string | `display_order` | One of: `display_order`, `solution_type`, `file_name`, `file_size_bytes`, `video_duration_seconds`, `created_at`, `updated_at`, `title`. |
| `sortDirection` | string | `ASC` | `ASC` or `DESC`. |

**Response `200`**

```jsonc
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 1,
      "assessmentId": 1,
      "solutionType": "video",
      "fileUrl": null,
      "githubUrl": null,
      "videoUrl": "https://youtube.com/watch?v=abc123",
      "fileName": "walkthrough.mp4",
      "fileSizeBytes": null,
      "mimeType": null,
      "videoDurationSeconds": 1200,
      "displayOrder": 1,
      "createdBy": 54,
      "updatedBy": null,
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-12T...",
      "updatedAt": "2026-04-12T...",
      "deletedAt": null,
      "assessmentType": "assignment",
      "assessmentScope": "chapter",
      "assessmentCode": "CH1_ASN_001",
      "translation": {
        "id": 1,
        "assessmentSolutionId": 1,
        "languageId": 1,
        "title": "Solution Walkthrough Video",
        "description": "Step-by-step video explaining the solution",
        "videoTitle": "REST API Solution Walkthrough",
        "videoDescription": "Complete walkthrough of the solution code",
        "videoThumbnail": "https://cdn.example.com/thumb.jpg",
        "isActive": true,
        "isDeleted": false,
        "createdAt": "2026-04-12T...",
        "updatedAt": "2026-04-12T...",
        "deletedAt": null,
        "languageName": "English",
        "languageIsoCode": "en"
      }
    }
  ],
  "meta": { "pageIndex": 1, "pageSize": 50, "totalCount": 1, "totalPages": 1 }
}
```

### Saved examples to add in Postman

| # | Description | URL |
|---|---|---|
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/assessments/1/solutions?pageIndex=1&pageSize=50` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/assessments/1/solutions?pageIndex=2&pageSize=50` |
| 3 | Custom page size (10) | `{{baseUrl}}/api/v1/assessments/1/solutions?pageIndex=1&pageSize=10` |
| 4 | Filter by languageId=1 | `{{baseUrl}}/api/v1/assessments/1/solutions?languageId=1` |
| 5 | Filter by solutionType=coding_file | `{{baseUrl}}/api/v1/assessments/1/solutions?solutionType=coding_file` |
| 6 | Filter by solutionType=github_link | `{{baseUrl}}/api/v1/assessments/1/solutions?solutionType=github_link` |
| 7 | Filter by solutionType=pdf | `{{baseUrl}}/api/v1/assessments/1/solutions?solutionType=pdf` |
| 8 | Filter by solutionType=image | `{{baseUrl}}/api/v1/assessments/1/solutions?solutionType=image` |
| 9 | Filter by solutionType=video | `{{baseUrl}}/api/v1/assessments/1/solutions?solutionType=video` |
| 10 | Filter by solutionType=other | `{{baseUrl}}/api/v1/assessments/1/solutions?solutionType=other` |
| 11 | Filter by isActive=true | `{{baseUrl}}/api/v1/assessments/1/solutions?isActive=true` |
| 12 | Filter by isDeleted=true | `{{baseUrl}}/api/v1/assessments/1/solutions?isDeleted=true` |
| 13 | Search — "walkthrough" | `{{baseUrl}}/api/v1/assessments/1/solutions?searchTerm=walkthrough` |
| 14 | Search — "solution" | `{{baseUrl}}/api/v1/assessments/1/solutions?searchTerm=solution` |
| 15 | Filter type + search | `{{baseUrl}}/api/v1/assessments/1/solutions?solutionType=video&searchTerm=walkthrough` |
| 16 | Sort by display_order ASC | `{{baseUrl}}/api/v1/assessments/1/solutions?sortColumn=display_order&sortDirection=ASC` |
| 17 | Sort by display_order DESC | `{{baseUrl}}/api/v1/assessments/1/solutions?sortColumn=display_order&sortDirection=DESC` |
| 18 | Sort by solution_type ASC | `{{baseUrl}}/api/v1/assessments/1/solutions?sortColumn=solution_type&sortDirection=ASC` |
| 19 | Sort by file_name ASC | `{{baseUrl}}/api/v1/assessments/1/solutions?sortColumn=file_name&sortDirection=ASC` |
| 20 | Sort by file_size_bytes DESC | `{{baseUrl}}/api/v1/assessments/1/solutions?sortColumn=file_size_bytes&sortDirection=DESC` |
| 21 | Sort by video_duration_seconds DESC | `{{baseUrl}}/api/v1/assessments/1/solutions?sortColumn=video_duration_seconds&sortDirection=DESC` |
| 22 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/assessments/1/solutions?sortColumn=created_at&sortDirection=DESC` |
| 23 | Sort by updated_at DESC | `{{baseUrl}}/api/v1/assessments/1/solutions?sortColumn=updated_at&sortDirection=DESC` |
| 24 | Sort by title ASC | `{{baseUrl}}/api/v1/assessments/1/solutions?sortColumn=title&sortDirection=ASC` |
| 25 | Combo — videos sorted by duration | `{{baseUrl}}/api/v1/assessments/1/solutions?solutionType=video&sortColumn=video_duration_seconds&sortDirection=DESC` |
| 26 | Combo — search + filter + paginate | `{{baseUrl}}/api/v1/assessments/1/solutions?pageIndex=1&pageSize=10&solutionType=coding_file&searchTerm=solution` |
| 27 | Combo — active items sorted by display order | `{{baseUrl}}/api/v1/assessments/1/solutions?isActive=true&sortColumn=display_order&sortDirection=ASC` |

---

## 1.2 `GET /api/v1/assessments/:assessmentId/solutions/:id`

Get one solution by ID. **Phase-02 contract**: returns the row even if soft-deleted.

**Response `200`** — same shape as a single element from §1.1 data array.

**Response `404`** — solution not found.

---

## 1.3 `POST /api/v1/assessments/:assessmentId/solutions`

Create a new solution for the assessment.

**Body**

```json
{
  "solutionType": "video",
  "videoUrl": "https://youtube.com/watch?v=abc123",
  "fileName": "walkthrough.mp4",
  "videoDurationSeconds": 1200,
  "displayOrder": 1,
  "isActive": true
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `solutionType` | string | **yes** | One of: `coding_file`, `github_link`, `pdf`, `image`, `video`, `other`. |
| `fileUrl` | string | conditional | At least one URL required. |
| `githubUrl` | string | conditional | At least one URL required. |
| `videoUrl` | string | conditional | At least one URL required. |
| `fileName` | string | no | Original file name. |
| `fileSizeBytes` | int | no | File size in bytes. |
| `mimeType` | string | no | MIME type. |
| `videoDurationSeconds` | int | no | Video length in seconds. |
| `displayOrder` | int | no | Sort order (default 0). |
| `isActive` | bool | no | Default `true`. |

**Response `201`** — created solution.

---

## 1.4 `PATCH /api/v1/assessments/:assessmentId/solutions/:id`

Update an existing solution. COALESCE pattern — omit fields to keep current value. Pass `""` for `fileUrl`, `githubUrl`, `videoUrl`, `fileName`, or `mimeType` to clear. At least one URL must remain.

**Response `200`** — updated solution.

---

## 1.5 `DELETE /api/v1/assessments/:assessmentId/solutions/:id`

Soft-delete a solution and cascade to all its translations.

**Response `200`**

```json
{ "success": true, "message": "Assessment solution deleted", "data": { "id": 1, "deleted": true } }
```

---

## 1.6 `POST /api/v1/assessments/:assessmentId/solutions/:id/restore`

Restore a soft-deleted solution and cascade-restore its translations. Fails if parent assessment is deleted.

**Response `200`** — restored solution.

---

## 2.1 `GET /api/v1/assessments/:assessmentId/solutions/:id/translations`

List translations for a solution.

**Query parameters**

| Param | Type | Default | Description |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `50` | Rows per page (1–200). |
| `languageId` | int | — | Filter by language. |
| `isActive` | bool | — | Filter by active status. |
| `isDeleted` | bool | `false` | Include soft-deleted. |
| `searchTerm` | string | — | ILIKE search over title, description, video_title. |
| `sortColumn` | string | `created_at` | One of: `id`, `title`, `created_at`, `updated_at`. |
| `sortDirection` | string | `DESC` | `ASC` or `DESC`. |

**Response `200`** — paginated list.

### Saved examples to add in Postman

| # | Description | URL |
|---|---|---|
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/assessments/1/solutions/1/translations?pageIndex=1&pageSize=50` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/assessments/1/solutions/1/translations?pageIndex=2&pageSize=50` |
| 3 | Filter by languageId=1 | `{{baseUrl}}/api/v1/assessments/1/solutions/1/translations?languageId=1` |
| 4 | Filter by isActive=true | `{{baseUrl}}/api/v1/assessments/1/solutions/1/translations?isActive=true` |
| 5 | Filter by isDeleted=true | `{{baseUrl}}/api/v1/assessments/1/solutions/1/translations?isDeleted=true` |
| 6 | Search — "walkthrough" | `{{baseUrl}}/api/v1/assessments/1/solutions/1/translations?searchTerm=walkthrough` |
| 7 | Sort by id ASC | `{{baseUrl}}/api/v1/assessments/1/solutions/1/translations?sortColumn=id&sortDirection=ASC` |
| 8 | Sort by title ASC | `{{baseUrl}}/api/v1/assessments/1/solutions/1/translations?sortColumn=title&sortDirection=ASC` |
| 9 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/assessments/1/solutions/1/translations?sortColumn=created_at&sortDirection=DESC` |
| 10 | Sort by updated_at DESC | `{{baseUrl}}/api/v1/assessments/1/solutions/1/translations?sortColumn=updated_at&sortDirection=DESC` |
| 11 | Combo — language + search | `{{baseUrl}}/api/v1/assessments/1/solutions/1/translations?languageId=1&searchTerm=REST` |
| 12 | Combo — filter + sort + paginate | `{{baseUrl}}/api/v1/assessments/1/solutions/1/translations?pageIndex=1&pageSize=10&isActive=true&sortColumn=title&sortDirection=ASC` |

---

## 2.2 `GET /api/v1/assessments/:assessmentId/solutions/:id/translations/:tid`

Get one translation by ID.

**Response `200`** — single solution with nested translation.

---

## 2.3 `POST /api/v1/assessments/:assessmentId/solutions/:id/translations`

Create a translation for the solution.

**Body**

```json
{
  "languageId": 1,
  "title": "Solution Walkthrough Video",
  "description": "Step-by-step video explaining the solution",
  "videoTitle": "REST API Solution Walkthrough",
  "videoDescription": "Complete walkthrough of the solution code",
  "videoThumbnail": "https://cdn.example.com/thumb.jpg",
  "isActive": true
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `languageId` | int | **yes** | Language ID. |
| `title` | string | **yes** | Translation title (1–500 chars). |
| `description` | string | no | Up to 10 000 chars. |
| `videoTitle` | string | no | Translated video title (up to 500 chars). |
| `videoDescription` | string | no | Translated video description (up to 10 000 chars). |
| `videoThumbnail` | string | no | Video thumbnail URL (up to 2000 chars). |
| `isActive` | bool | no | Default `true`. |

**Unique constraint**: one translation per solution per language.

**Response `201`** — created translation.

---

## 2.4 `PATCH /api/v1/assessments/:assessmentId/solutions/:id/translations/:tid`

Update a translation. Pass `""` for `description`, `videoTitle`, `videoDescription`, or `videoThumbnail` to clear.

**Response `200`** — updated translation.

---

## 2.5 `DELETE /api/v1/assessments/:assessmentId/solutions/:id/translations/:tid`

Soft-delete a single translation.

**Response `200`**

```json
{ "success": true, "message": "Assessment solution translation deleted", "data": { "id": 1, "deleted": true } }
```

---

## 2.6 `POST /api/v1/assessments/:assessmentId/solutions/:id/translations/:tid/restore`

Restore a soft-deleted translation. Fails if parent solution is deleted.

**Response `200`** — restored translation.

---

## Error responses

| Status | Code | When |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Body/query validation failure. |
| `401` | `UNAUTHENTICATED` | Missing or invalid token. |
| `403` | `FORBIDDEN` | Insufficient permission. |
| `404` | `NOT_FOUND` | Resource does not exist. |
| `409` | `CONFLICT` | Duplicate translation (solution + language). |
| `500` | `INTERNAL_ERROR` | UDF returned `success: false`. |
