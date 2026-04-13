# Phase 11 — Assessment Attachments

Assessment attachments are files and links associated with an assessment (e.g. starter code, GitHub repos, PDFs, images). Each assessment can have many attachments. Each attachment supports multilingual translations (title + description). Attachments support soft-delete with cascade to translations and admin restore.

Permission codes: `assessment_attachment.read`, `assessment_attachment.create`, `assessment_attachment.update`, `assessment_attachment.delete`, `assessment_attachment.restore`, `assessment_attachment_translation.read`, `assessment_attachment_translation.create`, `assessment_attachment_translation.update`, `assessment_attachment_translation.delete`, `assessment_attachment_translation.restore`.

- **Super-admin**: all 10 permissions.
- **Admin**: all except `assessment_attachment.delete` and `assessment_attachment_translation.delete`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`**.

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1assessmentsassessmentidattachments) | `GET` | `/api/v1/assessments/:assessmentId/attachments` | `assessment_attachment.read` | List attachments for an assessment. |
| [§1.2](#12-get-apiv1assessmentsassessmentidattachmentsid) | `GET` | `/api/v1/assessments/:assessmentId/attachments/:id` | `assessment_attachment.read` | Get one attachment by ID (includes deleted — phase-02 contract). |
| [§1.3](#13-post-apiv1assessmentsassessmentidattachments) | `POST` | `/api/v1/assessments/:assessmentId/attachments` | `assessment_attachment.create` | Create a new attachment. |
| [§1.4](#14-patch-apiv1assessmentsassessmentidattachmentsid) | `PATCH` | `/api/v1/assessments/:assessmentId/attachments/:id` | `assessment_attachment.update` | Update an attachment. |
| [§1.5](#15-delete-apiv1assessmentsassessmentidattachmentsid) | `DELETE` | `/api/v1/assessments/:assessmentId/attachments/:id` | `assessment_attachment.delete` | Soft-delete (cascades to translations). |
| [§1.6](#16-post-apiv1assessmentsassessmentidattachmentsidrestore) | `POST` | `/api/v1/assessments/:assessmentId/attachments/:id/restore` | `assessment_attachment.restore` | Restore a soft-deleted attachment (cascades). |
| [§2.1](#21-get-apiv1assessmentsassessmentidattachmentsidtranslations) | `GET` | `/api/v1/assessments/:assessmentId/attachments/:id/translations` | `assessment_attachment_translation.read` | List translations of an attachment. |
| [§2.2](#22-get-apiv1assessmentsassessmentidattachmentsidtranslationstid) | `GET` | `/api/v1/assessments/:assessmentId/attachments/:id/translations/:tid` | `assessment_attachment_translation.read` | Get one translation by ID. |
| [§2.3](#23-post-apiv1assessmentsassessmentidattachmentsidtranslations) | `POST` | `/api/v1/assessments/:assessmentId/attachments/:id/translations` | `assessment_attachment_translation.create` | Create a translation. |
| [§2.4](#24-patch-apiv1assessmentsassessmentidattachmentsidtranslationstid) | `PATCH` | `/api/v1/assessments/:assessmentId/attachments/:id/translations/:tid` | `assessment_attachment_translation.update` | Update a translation. |
| [§2.5](#25-delete-apiv1assessmentsassessmentidattachmentsidtranslationstid) | `DELETE` | `/api/v1/assessments/:assessmentId/attachments/:id/translations/:tid` | `assessment_attachment_translation.delete` | Soft-delete a translation. |
| [§2.6](#26-post-apiv1assessmentsassessmentidattachmentsidtranslationstidrestore) | `POST` | `/api/v1/assessments/:assessmentId/attachments/:id/translations/:tid/restore` | `assessment_attachment_translation.restore` | Restore a soft-deleted translation. |

---

## Attachment types

| attachment_type | Description |
|---|---|
| `coding_file` | Source code files (e.g. main.py, utils.js) |
| `github_link` | GitHub repository or file URL |
| `pdf` | PDF documents (briefs, requirements) |
| `image` | Images (wireframes, mockups, diagrams) |
| `other` | Any other file type |

**URL constraint**: At least one of `fileUrl` or `githubUrl` must be provided. Both may be present.

---

## 1.1 `GET /api/v1/assessments/:assessmentId/attachments`

List all attachments for an assessment with their translation context.

**Headers**

```
Authorization: Bearer {{accessToken}}
```

**Query parameters**

| Param | Type | Default | Description |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `50` | Rows per page (1–200). |
| `languageId` | int | — | Filter by language for translation. |
| `attachmentType` | string | — | Filter: `coding_file`, `github_link`, `pdf`, `image`, `other`. |
| `isActive` | bool | — | Filter by active status. |
| `isDeleted` | bool | `false` | Include soft-deleted rows. |
| `searchTerm` | string | — | ILIKE search over title, description, file_name. |
| `sortColumn` | string | `display_order` | One of: `display_order`, `attachment_type`, `file_name`, `file_size_bytes`, `created_at`, `updated_at`, `title`. |
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
      "attachmentType": "coding_file",
      "fileUrl": "https://cdn.example.com/files/main.py",
      "githubUrl": null,
      "fileName": "main.py",
      "fileSizeBytes": 2048,
      "mimeType": "text/x-python",
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
        "assessmentAttachmentId": 1,
        "languageId": 1,
        "title": "Main Application File",
        "description": "Starter code for the REST API project",
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
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/assessments/1/attachments?pageIndex=1&pageSize=50` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/assessments/1/attachments?pageIndex=2&pageSize=50` |
| 3 | Custom page size (10) | `{{baseUrl}}/api/v1/assessments/1/attachments?pageIndex=1&pageSize=10` |
| 4 | Filter by languageId=1 | `{{baseUrl}}/api/v1/assessments/1/attachments?languageId=1` |
| 5 | Filter by attachmentType=coding_file | `{{baseUrl}}/api/v1/assessments/1/attachments?attachmentType=coding_file` |
| 6 | Filter by attachmentType=github_link | `{{baseUrl}}/api/v1/assessments/1/attachments?attachmentType=github_link` |
| 7 | Filter by attachmentType=pdf | `{{baseUrl}}/api/v1/assessments/1/attachments?attachmentType=pdf` |
| 8 | Filter by attachmentType=image | `{{baseUrl}}/api/v1/assessments/1/attachments?attachmentType=image` |
| 9 | Filter by attachmentType=other | `{{baseUrl}}/api/v1/assessments/1/attachments?attachmentType=other` |
| 10 | Filter by isActive=true | `{{baseUrl}}/api/v1/assessments/1/attachments?isActive=true` |
| 11 | Filter by isDeleted=true | `{{baseUrl}}/api/v1/assessments/1/attachments?isDeleted=true` |
| 12 | Search — "main.py" | `{{baseUrl}}/api/v1/assessments/1/attachments?searchTerm=main.py` |
| 13 | Search — "starter" | `{{baseUrl}}/api/v1/assessments/1/attachments?searchTerm=starter` |
| 14 | Filter type + search | `{{baseUrl}}/api/v1/assessments/1/attachments?attachmentType=coding_file&searchTerm=main` |
| 15 | Sort by display_order ASC | `{{baseUrl}}/api/v1/assessments/1/attachments?sortColumn=display_order&sortDirection=ASC` |
| 16 | Sort by display_order DESC | `{{baseUrl}}/api/v1/assessments/1/attachments?sortColumn=display_order&sortDirection=DESC` |
| 17 | Sort by attachment_type ASC | `{{baseUrl}}/api/v1/assessments/1/attachments?sortColumn=attachment_type&sortDirection=ASC` |
| 18 | Sort by file_name ASC | `{{baseUrl}}/api/v1/assessments/1/attachments?sortColumn=file_name&sortDirection=ASC` |
| 19 | Sort by file_size_bytes DESC | `{{baseUrl}}/api/v1/assessments/1/attachments?sortColumn=file_size_bytes&sortDirection=DESC` |
| 20 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/assessments/1/attachments?sortColumn=created_at&sortDirection=DESC` |
| 21 | Sort by updated_at DESC | `{{baseUrl}}/api/v1/assessments/1/attachments?sortColumn=updated_at&sortDirection=DESC` |
| 22 | Sort by title ASC | `{{baseUrl}}/api/v1/assessments/1/attachments?sortColumn=title&sortDirection=ASC` |
| 23 | Combo — coding files sorted by size | `{{baseUrl}}/api/v1/assessments/1/attachments?attachmentType=coding_file&sortColumn=file_size_bytes&sortDirection=DESC` |
| 24 | Combo — search + filter + paginate | `{{baseUrl}}/api/v1/assessments/1/attachments?pageIndex=1&pageSize=10&attachmentType=pdf&searchTerm=guide` |
| 25 | Combo — active items sorted by display order | `{{baseUrl}}/api/v1/assessments/1/attachments?isActive=true&sortColumn=display_order&sortDirection=ASC` |

---

## 1.2 `GET /api/v1/assessments/:assessmentId/attachments/:id`

Get one attachment by ID. **Phase-02 contract**: returns the row even if soft-deleted.

**Headers**

```
Authorization: Bearer {{accessToken}}
```

**Response `200`** — same shape as a single element from §1.1 data array.

**Response `404`** — attachment not found.

---

## 1.3 `POST /api/v1/assessments/:assessmentId/attachments`

Create a new attachment for the assessment.

**Headers**

```
Authorization: Bearer {{accessToken}}
Content-Type: application/json
```

**Body**

```json
{
  "attachmentType": "coding_file",
  "fileUrl": "https://cdn.example.com/files/main.py",
  "fileName": "main.py",
  "fileSizeBytes": 2048,
  "mimeType": "text/x-python",
  "displayOrder": 1,
  "isActive": true
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `attachmentType` | string | **yes** | One of: `coding_file`, `github_link`, `pdf`, `image`, `other`. |
| `fileUrl` | string | conditional | Required if `githubUrl` not provided. |
| `githubUrl` | string | conditional | Required if `fileUrl` not provided. |
| `fileName` | string | no | Original file name. |
| `fileSizeBytes` | int | no | File size in bytes. |
| `mimeType` | string | no | MIME type. |
| `displayOrder` | int | no | Sort order (default 0). |
| `isActive` | bool | no | Default `true`. |

**Response `201`** — created attachment (same shape as §1.2).

---

## 1.4 `PATCH /api/v1/assessments/:assessmentId/attachments/:id`

Update an existing attachment. COALESCE pattern — omit fields to keep current value.

**Headers**

```
Authorization: Bearer {{accessToken}}
Content-Type: application/json
```

**Body** — same fields as §1.3 but all optional. At least one field required.

**URL clearing**: pass empty string `""` for `fileUrl`, `githubUrl`, `fileName`, or `mimeType` to set them to NULL. At least one URL must remain non-null after update.

**Response `200`** — updated attachment.

---

## 1.5 `DELETE /api/v1/assessments/:assessmentId/attachments/:id`

Soft-delete an attachment and cascade to all its translations.

**Headers**

```
Authorization: Bearer {{accessToken}}
```

**Response `200`**

```json
{ "success": true, "message": "Assessment attachment deleted", "data": { "id": 1, "deleted": true } }
```

---

## 1.6 `POST /api/v1/assessments/:assessmentId/attachments/:id/restore`

Restore a soft-deleted attachment and cascade-restore its translations. Fails if parent assessment is deleted.

**Headers**

```
Authorization: Bearer {{accessToken}}
```

**Response `200`** — restored attachment (same shape as §1.2).

---

## 2.1 `GET /api/v1/assessments/:assessmentId/attachments/:id/translations`

List translations for an attachment.

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
| `isActive` | bool | — | Filter by active status. |
| `isDeleted` | bool | `false` | Include soft-deleted. |
| `searchTerm` | string | — | ILIKE search over title, description. |
| `sortColumn` | string | `created_at` | One of: `id`, `title`, `created_at`, `updated_at`. |
| `sortDirection` | string | `DESC` | `ASC` or `DESC`. |

**Response `200`** — paginated list (same shape as §1.1).

### Saved examples to add in Postman

| # | Description | URL |
|---|---|---|
| 1 | Page 1 (defaults) | `{{baseUrl}}/api/v1/assessments/1/attachments/1/translations?pageIndex=1&pageSize=50` |
| 2 | Page 2, default size | `{{baseUrl}}/api/v1/assessments/1/attachments/1/translations?pageIndex=2&pageSize=50` |
| 3 | Filter by languageId=1 | `{{baseUrl}}/api/v1/assessments/1/attachments/1/translations?languageId=1` |
| 4 | Filter by isActive=true | `{{baseUrl}}/api/v1/assessments/1/attachments/1/translations?isActive=true` |
| 5 | Filter by isDeleted=true | `{{baseUrl}}/api/v1/assessments/1/attachments/1/translations?isDeleted=true` |
| 6 | Search — "starter" | `{{baseUrl}}/api/v1/assessments/1/attachments/1/translations?searchTerm=starter` |
| 7 | Sort by id ASC | `{{baseUrl}}/api/v1/assessments/1/attachments/1/translations?sortColumn=id&sortDirection=ASC` |
| 8 | Sort by title ASC | `{{baseUrl}}/api/v1/assessments/1/attachments/1/translations?sortColumn=title&sortDirection=ASC` |
| 9 | Sort by created_at DESC (newest) | `{{baseUrl}}/api/v1/assessments/1/attachments/1/translations?sortColumn=created_at&sortDirection=DESC` |
| 10 | Sort by updated_at DESC | `{{baseUrl}}/api/v1/assessments/1/attachments/1/translations?sortColumn=updated_at&sortDirection=DESC` |
| 11 | Combo — language + search | `{{baseUrl}}/api/v1/assessments/1/attachments/1/translations?languageId=1&searchTerm=code` |
| 12 | Combo — filter + sort + paginate | `{{baseUrl}}/api/v1/assessments/1/attachments/1/translations?pageIndex=1&pageSize=10&isActive=true&sortColumn=title&sortDirection=ASC` |

---

## 2.2 `GET /api/v1/assessments/:assessmentId/attachments/:id/translations/:tid`

Get one translation by ID.

**Response `200`** — single attachment with nested translation.

**Response `404`** — translation not found.

---

## 2.3 `POST /api/v1/assessments/:assessmentId/attachments/:id/translations`

Create a translation for the attachment.

**Headers**

```
Authorization: Bearer {{accessToken}}
Content-Type: application/json
```

**Body**

```json
{
  "languageId": 1,
  "title": "Main Application File",
  "description": "Starter code for the REST API project",
  "isActive": true
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `languageId` | int | **yes** | Language ID. |
| `title` | string | **yes** | Translation title (1–500 chars). |
| `description` | string | no | Up to 10 000 chars. |
| `isActive` | bool | no | Default `true`. |

**Unique constraint**: one translation per attachment per language.

**Response `201`** — created translation.

---

## 2.4 `PATCH /api/v1/assessments/:assessmentId/attachments/:id/translations/:tid`

Update a translation. COALESCE pattern. Pass `""` for `description` to clear it.

**Body** — same fields as §2.3 except `languageId` (immutable). At least one field required.

**Response `200`** — updated translation.

---

## 2.5 `DELETE /api/v1/assessments/:assessmentId/attachments/:id/translations/:tid`

Soft-delete a single translation.

**Response `200`**

```json
{ "success": true, "message": "Assessment attachment translation deleted", "data": { "id": 1, "deleted": true } }
```

---

## 2.6 `POST /api/v1/assessments/:assessmentId/attachments/:id/translations/:tid/restore`

Restore a soft-deleted translation. Fails if parent attachment is deleted.

**Response `200`** — restored translation.

---

## Error responses

| Status | Code | When |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Body/query validation failure. |
| `401` | `UNAUTHENTICATED` | Missing or invalid token. |
| `403` | `FORBIDDEN` | Insufficient permission. |
| `404` | `NOT_FOUND` | Resource does not exist. |
| `409` | `CONFLICT` | Duplicate translation (attachment + language). |
| `500` | `INTERNAL_ERROR` | UDF returned `success: false`. |
