# Phase 4 — User Documents

`user_documents` is a **1:M child of `users`** that stores the actual document records each user has uploaded — national IDs, academic transcripts, professional certifications, and anything else gated behind a review workflow. Every row references two master-data lookups: `document_types` (the category of document — "National ID", "Academic Transcript", …) and `documents` (the specific document within that type — "Aadhaar Card", "PAN Card", …). The unique key is `(user_id, document_id)`: a user can have at most one record per specific document.

The big thing that sets `user_documents` apart from every other phase-04 child table is its **verification workflow**. Rows go through `pending → under_review → verified | rejected | reupload | expired`, and the workflow fields (`verificationStatus`, `verifiedBy`, `verifiedAt`, `rejectionReason`, `adminNotes`) are **admin-only** — the `/me` schemas use `.strict()` to reject those keys with a clean 400 rather than silently dropping them. Students can submit any document they want, but only an admin or super-admin can mark it verified.

Same **soft-delete + admin restore** model as `user_languages` / `user_skills`, same `/me` + `/:id` split. If you've read [§6](06%20-%20user-languages.md) the shape will feel identical; the differences are the field set and the admin/self lane split.

All routes require auth. Permission codes use the **singular** resource name `user_document`: `user_document.create`, `user_document.read`, `user_document.read.own`, `user_document.update`, `user_document.update.own`, `user_document.delete`, `user_document.delete.own`, `user_document.restore`.

> The table name is plural (`user_documents`) but the permission resource is singular (`user_document`). The API path mirrors the table name: `/api/v1/user-documents`.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](00%20-%20overview.md#8-postman-environment).

← [06 user-languages](06%20-%20user-languages.md) · **Next →** [08 user-projects](08%20-%20user-projects.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§7.1](#71-get-apiv1user-documents) | `GET` | `{{baseUrl}}/api/v1/user-documents` | `user_document.read` | List all user-document rows (admin+). |
| [§7.2](#72-get-apiv1user-documentsme) | `GET` | `{{baseUrl}}/api/v1/user-documents/me` | `user_document.read.own` | List caller's own document rows. |
| [§7.3](#73-post-apiv1user-documentsme) | `POST` | `{{baseUrl}}/api/v1/user-documents/me` | `user_document.update.own` | Self-service create — `userId` derived from token. Workflow fields blocked. |
| [§7.4](#74-patch-apiv1user-documentsmeid) | `PATCH` | `{{baseUrl}}/api/v1/user-documents/me/:id` | `user_document.update.own` (self match enforced) | Self-service partial update. Workflow fields blocked. |
| [§7.5](#75-delete-apiv1user-documentsmeid) | `DELETE` | `{{baseUrl}}/api/v1/user-documents/me/:id` | `user_document.delete.own` (self match enforced) | Self-service soft-delete. |
| [§7.6](#76-get-apiv1user-documentsid) | `GET` | `{{baseUrl}}/api/v1/user-documents/:id` | `user_document.read` *or* `user_document.read.own` (+ self match) | Get one row by id. |
| [§7.7](#77-post-apiv1user-documents) | `POST` | `{{baseUrl}}/api/v1/user-documents` | `user_document.create` | Admin create — targets any `userId`. May set workflow fields. |
| [§7.8](#78-patch-apiv1user-documentsid) | `PATCH` | `{{baseUrl}}/api/v1/user-documents/:id` | `user_document.update` *or* `user_document.update.own` (+ self match) | Admin or self partial update. |
| [§7.9](#79-delete-apiv1user-documentsid) | `DELETE` | `{{baseUrl}}/api/v1/user-documents/:id` | `user_document.delete` *or* `user_document.delete.own` (+ self match) | Admin or self soft-delete. |
| [§7.10](#710-post-apiv1user-documentsidrestore) | `POST` | `{{baseUrl}}/api/v1/user-documents/:id/restore` | `user_document.restore` (admin+) | Un-soft-delete a hidden row. |
| [§7.11](#711-verification-workflow) | — | — | — | How the admin review workflow works end-to-end. |

### Role authority summary

| Role | What it can do |
|---|---|
| Super Admin | Everything — including global delete, restore, and setting every workflow field. |
| Admin | Everything **except** the global `user_document.delete` (admin still has `delete.own` and `restore`). May set all workflow fields. |
| Instructor / Student | Self only — `read.own`, `update.own`, `delete.own`. Workflow fields rejected at the schema layer. No restore. |

### Verification status reference

The `verificationStatus` column is constrained to the values below — both the DB CHECK constraint and the zod `verificationStatusSchema` reject anything else. Default is `pending` when omitted on create.

| Value | Intended meaning |
|---|---|
| `pending` | Newly submitted; queue for review. Default on student `/me` create. |
| `under_review` | An admin has picked it up. |
| `verified` | Document accepted. `verifiedBy` + `verifiedAt` are set by the admin move. |
| `rejected` | Document refused. `rejectionReason` should accompany the move. |
| `expired` | `expiryDate` passed — can be surfaced by a periodic sweep. |
| `reupload` | Reviewer asked for a fresh scan / page; user should re-upload and the workflow restarts. |

> Updating a row's file fields on the self lane does **not** auto-reset the status back to `pending`. If the user replaces a PDF after verification, the admin UI should explicitly PATCH `verificationStatus: "under_review"` as part of the same change.

### Document + document-type reference

Both `document_types` and `documents` are phase-02 master data. The nested `documentType` object exposes `id` + `name` + active/deleted flags; the nested `document` object exposes `id`, `name`, `description` + active/deleted flags. The unique `(user_id, document_id)` constraint means the specific document (e.g. "Aadhaar Card") is the uniqueness axis — you can't add two Aadhaar rows for the same user, but you can have one Aadhaar + one PAN.

---

## 7.1 `GET /api/v1/user-documents`

List user-document rows. Backed by `udf_get_user_documents`, which joins `user_documents` → `users` → `documents` → `document_types`. Hides soft-deleted rows by default.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-documents` |
| Permission | `user_document.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `userId` | bigint | — | Filter to one user's rows. |
| `documentId` | bigint | — | Filter by document (FK to `documents`). |
| `documentTypeId` | bigint | — | Filter by document type (FK to `document_types`). |
| `verificationStatus` | enum | — | `pending` / `under_review` / `verified` / `rejected` / `expired` / `reupload`. |
| `fileFormat` | string | — | Case-sensitive match — e.g. `pdf`, `jpg`. |
| `isActive` | bool | — | Row-level active flag. |
| `isDeleted` | bool | `false` | Include soft-deleted rows (admin audit view). |
| `userRole` | string | — | Parent user's role code. |
| `userIsActive` | bool | — | Inherited from parent users row. |
| `searchTerm` | string | — | `ILIKE` across `document_number`, `issuing_authority`, file name, document + document-type name, first/last name, email. |
| `sortTable` | enum | `udoc` | `udoc` / `document` / `document_type` / `user`. |
| `sortColumn` | enum | `id` | See `user-documents.schemas.ts` for the full allowlist. |
| `sortDirection` | enum | `DESC` | `ASC` / `DESC`. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 12,
      "userId": 42,
      "documentTypeId": 1,
      "documentId": 3,
      "documentNumber": "AADHAAR-1234-5678-9012",
      "fileUrl": "https://cdn.example.com/aadhaar.pdf",
      "fileName": "aadhaar.pdf",
      "fileSizeKb": 420,
      "fileFormat": "pdf",
      "issueDate": "2020-01-15",
      "expiryDate": "2030-01-15",
      "issuingAuthority": "UIDAI",
      "verificationStatus": "verified",
      "verifiedBy": 9,
      "verifiedAt": "2026-04-12T01:30:00.000Z",
      "rejectionReason": null,
      "adminNotes": "Scan is clear, identity confirmed.",
      "createdBy": 42,
      "updatedBy": 9,
      "isActive": true,
      "isDeleted": false,
      "createdAt": "2026-04-10T09:00:00.000Z",
      "updatedAt": "2026-04-12T01:30:00.000Z",
      "deletedAt": null,
      "user": {
        "firstName": "Priya",
        "lastName": "Sharma",
        "email": "priya.sharma@example.com",
        "role": "student",
        "isActive": true,
        "isDeleted": false
      },
      "document": {
        "id": 3,
        "name": "Aadhaar Card",
        "description": "12-digit identity number issued by UIDAI",
        "isActive": true,
        "isDeleted": false
      },
      "documentType": {
        "id": 1,
        "name": "National ID",
        "isActive": true,
        "isDeleted": false
      }
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 1, "totalPages": 1 }
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: user_document.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/user-documents` — method, headers and auth stay the same as the base request above.

| Example name | Query string |
|---|---|
| Page 1 (defaults) | `?pageIndex=1&pageSize=20` |
| Page 2, default size | `?pageIndex=2&pageSize=20` |
| Page 1, small page (5 rows) | `?pageIndex=1&pageSize=5` |
| Page 1, large page (100 rows) | `?pageIndex=1&pageSize=100` |
| Out-of-range page (returns empty `data`) | `?pageIndex=9999&pageSize=20` |
| Search across document_number / issuing_authority / file_name / doc name / type name / user name / email | `?searchTerm=aadhaar` |
| Search + pagination | `?pageIndex=1&pageSize=50&searchTerm=passport` |
| Single user — all rows | `?userId=42` |
| Single user — pending review | `?userId=42&verificationStatus=pending` |
| Filter by document id (FK to documents) | `?documentId=3` |
| Filter by document_type id (FK to document_types) | `?documentTypeId=1` |
| Verification status — pending | `?verificationStatus=pending` |
| Verification status — under_review | `?verificationStatus=under_review` |
| Verification status — verified | `?verificationStatus=verified` |
| Verification status — rejected | `?verificationStatus=rejected` |
| Verification status — expired | `?verificationStatus=expired` |
| Verification status — reupload | `?verificationStatus=reupload` |
| File format — pdf | `?fileFormat=pdf` |
| File format — jpg | `?fileFormat=jpg` |
| File format — png | `?fileFormat=png` |
| Active rows only | `?isActive=true` |
| Inactive rows only | `?isActive=false` |
| Non-deleted (default) | `?isDeleted=false` |
| Deleted only (admin audit) | `?isDeleted=true` |
| Filter by parent user role — student | `?userRole=student` |
| Filter by parent user role — instructor | `?userRole=instructor` |
| Active parent users | `?userIsActive=true` |
| Inactive parent users | `?userIsActive=false` |
| Sort — udoc table — `id` DESC (default) | `?sortTable=udoc&sortColumn=id&sortDirection=DESC` |
| Sort — udoc table — `document_number` ASC | `?sortTable=udoc&sortColumn=document_number&sortDirection=ASC` |
| Sort — udoc table — `file_format` ASC | `?sortTable=udoc&sortColumn=file_format&sortDirection=ASC` |
| Sort — udoc table — `file_size_kb` DESC | `?sortTable=udoc&sortColumn=file_size_kb&sortDirection=DESC` |
| Sort — udoc table — `issue_date` DESC | `?sortTable=udoc&sortColumn=issue_date&sortDirection=DESC` |
| Sort — udoc table — `expiry_date` ASC | `?sortTable=udoc&sortColumn=expiry_date&sortDirection=ASC` |
| Sort — udoc table — `verification_status` ASC | `?sortTable=udoc&sortColumn=verification_status&sortDirection=ASC` |
| Sort — udoc table — `is_active` DESC | `?sortTable=udoc&sortColumn=is_active&sortDirection=DESC` |
| Sort — udoc table — `created_at` DESC | `?sortTable=udoc&sortColumn=created_at&sortDirection=DESC` |
| Sort — udoc table — `updated_at` DESC | `?sortTable=udoc&sortColumn=updated_at&sortDirection=DESC` |
| Sort — document — `name` ASC | `?sortTable=document&sortColumn=name&sortDirection=ASC` |
| Sort — document_type — `name` ASC | `?sortTable=document_type&sortColumn=name&sortDirection=ASC` |
| Sort — user — `first_name` ASC | `?sortTable=user&sortColumn=first_name&sortDirection=ASC` |
| Sort — user — `last_name` ASC | `?sortTable=user&sortColumn=last_name&sortDirection=ASC` |
| Sort — user — `email` ASC | `?sortTable=user&sortColumn=email&sortDirection=ASC` |
| Sort — user — `role` ASC | `?sortTable=user&sortColumn=role&sortDirection=ASC` |
| Combo — pending review queue, newest first | `?pageIndex=1&pageSize=50&verificationStatus=pending&sortTable=udoc&sortColumn=created_at&sortDirection=DESC` |
| Combo — verified PDFs, sorted by expiry | `?pageIndex=1&pageSize=20&verificationStatus=verified&fileFormat=pdf&sortTable=udoc&sortColumn=expiry_date&sortDirection=ASC` |
| Combo — search `aadhaar`, doc type filter, active students | `?pageIndex=1&pageSize=20&searchTerm=aadhaar&documentTypeId=1&userRole=student&userIsActive=true&sortTable=udoc&sortColumn=created_at&sortDirection=DESC` |

> The `sortTable` param defaults to `udoc`. When sorting by a column that belongs to `documents` or `document_types` (both have `name`), set `sortTable` to `document` or `document_type`. For `users` columns (`first_name` / `last_name` / `email` / `role`), set `sortTable` to `user`.

---

## 7.2 `GET /api/v1/user-documents/me`

List the caller's own document rows. `userId` filter is forced server-side — any `userId` query param is ignored.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-documents/me` |
| Permission | `user_document.read.own` |

### Responses

#### 200 OK

Same shape as §7.1. Empty `data` array when the caller has no rows yet.

---

## 7.3 `POST /api/v1/user-documents/me`

Self-service create. `userId` is derived from the token. **Workflow fields are blocked** by a `.strict()` schema — the request is rejected with 400 if any of `verificationStatus`, `verifiedBy`, `verifiedAt`, `rejectionReason`, or `adminNotes` are present. New rows always start at `verificationStatus='pending'`.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-documents/me` |
| Permission | `user_document.update.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Content-Type** — `application/json` or `multipart/form-data`.

### JSON (`application/json`)

```json
{
  "documentTypeId": 1,
  "documentId": 3,
  "documentNumber": "AADHAAR-1234-5678-9012",
  "issueDate": "2020-01-15",
  "expiryDate": "2030-01-15",
  "issuingAuthority": "UIDAI"
}
```

**Required:** `documentTypeId`, `documentId`. File is omitted in JSON mode.

### Form-data (`multipart/form-data`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `documentTypeId` | text | yes | FK to `document_types`. |
| `documentId` | text | yes | FK to `documents`. Unique per `(userId, documentId)` pair. |
| `documentNumber` | text | no | Document ID number (e.g., Aadhaar, passport). |
| `issueDate` | text | no | ISO date (e.g., `2020-01-15`). |
| `expiryDate` | text | no | ISO date. Must be on or after `issueDate` if both provided. |
| `issuingAuthority` | text | no | Issuing authority name. |
| `file` (aliases: `document`, `attachment`) | file | no | PDF / PNG / JPEG / WebP, **≤ 5 MB**. Stored at `user-documents/<id>.<ext>`. Returns `fileUrl` in response. |

**Postman examples**

| # | Example name | Content-Type | Body |
|---|---|---|---|
| 1 | Create — form-data (no file) | `multipart/form-data` | `documentTypeId` = `1`, `documentId` = `3`, `documentNumber` = `AADHAAR-1234-5678-9012`, `issueDate` = `2020-01-15` |
| 2 | Create — form-data + file | `multipart/form-data` | `documentTypeId` = `1`, `documentId` = `3`, `documentNumber` = `AADHAAR-1234-5678-9012`, `file` = `aadhaar.pdf` (file) |

### Responses

#### 201 Created — without file

```json
{
  "success": true,
  "message": "User document created",
  "data": {
    "id": 12,
    "userId": 42,
    "documentTypeId": 1,
    "documentId": 3,
    "documentNumber": "AADHAAR-1234-5678-9012",
    "issueDate": "2020-01-15",
    "expiryDate": "2030-01-15",
    "issuingAuthority": "UIDAI",
    "fileUrl": null,
    "fileName": null,
    "fileFormat": null,
    "fileSizeKb": null,
    "verificationStatus": "pending",
    "createdAt": "2026-04-14T10:00:00.000Z",
    "updatedAt": "2026-04-14T10:00:00.000Z"
  }
}
```

#### 201 Created — with file

```json
{
  "success": true,
  "message": "User document created",
  "data": {
    "id": 12,
    "userId": 42,
    "documentTypeId": 1,
    "documentId": 3,
    "documentNumber": "AADHAAR-1234-5678-9012",
    "issueDate": "2020-01-15",
    "expiryDate": "2030-01-15",
    "issuingAuthority": "UIDAI",
    "fileUrl": "https://cdn.growupmore.com/user-documents/12.pdf",
    "fileName": "aadhaar.pdf",
    "fileFormat": "pdf",
    "fileSizeKb": 420,
    "verificationStatus": "pending",
    "createdAt": "2026-04-14T10:00:00.000Z",
    "updatedAt": "2026-04-14T10:00:00.000Z"
  }
}
```

#### 400 Validation error — workflow field smuggled in

```json
{
  "success": false,
  "message": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": ["verificationStatus"], "message": "Unrecognized key(s) in object: 'verificationStatus'" }
  ]
}
```

> The self schema is `.strict()`: `verificationStatus`, `verifiedBy`, `verifiedAt`, `rejectionReason`, and `adminNotes` all trigger this error if present on the `/me` lane. Use [§7.8 admin PATCH](#78-patch-apiv1user-documentsid) from an admin token to set them.

#### 400 Validation error — `expiryDate` before `issueDate`

```json
{
  "success": false,
  "message": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": ["expiryDate"], "message": "expiryDate cannot be before issueDate" }
  ]
}
```

#### 400 Bad request — file too large

```json
{
  "success": false,
  "message": "File too large: file must be ≤ 5 MB",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — unsupported file type

```json
{
  "success": false,
  "message": "Unsupported media type: expected application/pdf, image/png, image/jpeg, or image/webp",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — non-existent document / document_type

```json
{
  "success": false,
  "message": "Error inserting user document: Document id 9999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

#### 409 DUPLICATE_ENTRY — document already submitted

```json
{
  "success": false,
  "message": "User already has a document entry for this document type; update the existing row instead.",
  "code": "DUPLICATE_ENTRY"
}
```

---

## 7.4 `PATCH /api/v1/user-documents/me/:id`

Self-service partial update. Same `.strict()` block on workflow fields as §7.3 — a student trying to slip `verificationStatus: "verified"` into an update gets a 400 before anything touches the DB.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/user-documents/me/:id` |
| Permission | `user_document.update.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Content-Type** — `application/json` or `multipart/form-data`.

### JSON (`application/json`)

```json
{
  "documentNumber": "AADHAAR-1234-5678-9012",
  "issuingAuthority": "UIDAI — Regional Office Bengaluru"
}
```

### Form-data (`multipart/form-data`)

| Field | Type | Notes |
|---|---|---|
| `documentNumber`, `issueDate`, `expiryDate`, `issuingAuthority` | text | Optional text fields to update. |
| `file` (aliases: `document`, `attachment`) | file | PDF / PNG / JPEG / WebP, **≤ 5 MB**. Optional. |

**Postman examples**

| # | Example name | Content-Type | Body |
|---|---|---|---|
| 1 | Update — form-data (text only) | `multipart/form-data` | `issuingAuthority` = `UIDAI — Regional Office Bengaluru` |
| 2 | Update — form-data + text + file | `multipart/form-data` | `issuingAuthority` = `UIDAI — Bengaluru`, `file` = `aadhaar-v2.pdf` (file) |
| 3 | Update — file only | `multipart/form-data` | `file` = `aadhaar-updated.pdf` (file) |

### Responses

#### 200 OK — text-only update

```json
{
  "success": true,
  "message": "User document updated",
  "data": {
    "id": 12,
    "userId": 42,
    "documentNumber": "AADHAAR-1234-5678-9012",
    "issuingAuthority": "UIDAI — Regional Office Bengaluru",
    "fileUrl": "https://cdn.growupmore.com/user-documents/12.pdf",
    "verificationStatus": "pending",
    "updatedAt": "2026-04-14T11:00:00.000Z"
  }
}
```

#### 200 OK — text + file update

```json
{
  "success": true,
  "message": "User document updated",
  "data": {
    "id": 12,
    "userId": 42,
    "issuingAuthority": "UIDAI — Regional Office Bengaluru",
    "fileUrl": "https://cdn.growupmore.com/user-documents/12.pdf",
    "fileName": "aadhaar-v2.pdf",
    "fileFormat": "pdf",
    "fileSizeKb": 425,
    "verificationStatus": "pending",
    "updatedAt": "2026-04-14T11:01:00.000Z"
  }
}
```

#### 200 OK — file-only update

```json
{
  "success": true,
  "message": "User document updated",
  "data": {
    "id": 12,
    "userId": 42,
    "fileUrl": "https://cdn.growupmore.com/user-documents/12.pdf",
    "fileName": "aadhaar-updated.pdf",
    "fileFormat": "pdf",
    "fileSizeKb": 430,
    "verificationStatus": "pending",
    "updatedAt": "2026-04-14T11:02:00.000Z"
  }
}
```

#### 400 Validation error — empty body

```json
{
  "success": false,
  "message": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": [], "message": "Provide at least one field to update" }
  ]
}
```

#### 400 Validation error — workflow field smuggled in

Same shape as §7.3.

#### 400 Bad request — file too large

```json
{
  "success": false,
  "message": "File too large: file must be ≤ 5 MB",
  "code": "BAD_REQUEST"
}
```

#### 403 Forbidden — another user's row

```json
{
  "success": false,
  "message": "You can only edit your own documents.",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "User document 42 not found",
  "code": "NOT_FOUND"
}
```

> Replacing a file after verification does NOT automatically reset `verificationStatus` back to `pending`. If the admin UI needs re-verification, it should explicitly PATCH `verificationStatus: "under_review"` from the admin lane as part of the same change.

---

## 7.5 `DELETE /api/v1/user-documents/me/:id`

Self-service soft-delete. The row is marked `is_deleted=TRUE, is_active=FALSE` and hidden from the default GET. Hard-delete is not exposed.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/user-documents/me/:id` |
| Permission | `user_document.delete.own` |

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "User document deleted",
  "data": { "id": 42, "deleted": true }
}
```

#### 403 Forbidden — another user's row

```json
{
  "success": false,
  "message": "You can only delete your own documents.",
  "code": "FORBIDDEN"
}
```

> No self-restore — see §7.10 for the admin restore path.

---

## 7.6 `GET /api/v1/user-documents/:id`

Get one row by id. `authorizeSelfOr` pattern — admins read any row, self reads own row.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/user-documents/:id` |
| Permission | `user_document.read` *or* `user_document.read.own` |

### Responses

#### 200 OK

Single `UserDocumentDto` in `data`.

#### 403 Forbidden — own-scope caller, another user's row

```json
{
  "success": false,
  "message": "Forbidden: user_document.read.own only grants access to your own record",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

Row does not exist, or is soft-deleted.

---

## 7.7 `POST /api/v1/user-documents`

Admin create — body requires `userId` explicitly, and workflow fields are allowed. Useful when onboarding a new instructor whose documents were already vetted out-of-band, or when backfilling verified records from a spreadsheet.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-documents` |
| Permission | `user_document.create` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Content-Type** — `application/json` or `multipart/form-data`.

### JSON (`application/json`)

```json
{
  "userId": 42,
  "documentTypeId": 1,
  "documentId": 3,
  "documentNumber": "AADHAAR-1234-5678-9012",
  "issueDate": "2020-01-15",
  "expiryDate": "2030-01-15",
  "issuingAuthority": "UIDAI",
  "verificationStatus": "under_review"
}
```

### Form-data (`multipart/form-data`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `userId` | text | yes | The owning user id. |
| `documentTypeId` | text | yes | FK to `document_types`. |
| `documentId` | text | yes | FK to `documents`. |
| `documentNumber`, `issueDate`, `expiryDate`, `issuingAuthority` | text | no | Optional metadata. |
| `verificationStatus` | text | no | `pending`, `under_review`, `verified`, `rejected`, `expired`, `reupload` (default: `pending`). |
| `adminNotes` | text | no | Admin notes on this document. |
| `file` (aliases: `document`, `attachment`) | file | no | PDF / PNG / JPEG / WebP, **≤ 5 MB**. |

> Only `verificationStatus` is accepted on create — the other workflow fields (`verifiedBy`, `verifiedAt`, `rejectionReason`) are move-only. Use [§7.8 PATCH](#78-patch-apiv1user-documentsid) to record the verification move itself.

**Postman examples**

| # | Example name | Content-Type | Body |
|---|---|---|---|
| 1 | Create — form-data (no file) | `multipart/form-data` | `userId` = `42`, `documentTypeId` = `1`, `documentId` = `3`, `verificationStatus` = `under_review` |
| 2 | Create — form-data + file | `multipart/form-data` | `userId` = `42`, `documentTypeId` = `1`, `documentId` = `3`, `verificationStatus` = `under_review`, `file` = `aadhaar.pdf` (file) |

### Responses

#### 201 Created — without file

```json
{
  "success": true,
  "message": "User document created",
  "data": {
    "id": 13,
    "userId": 42,
    "documentTypeId": 1,
    "documentId": 3,
    "documentNumber": "AADHAAR-1234-5678-9012",
    "issueDate": "2020-01-15",
    "expiryDate": "2030-01-15",
    "issuingAuthority": "UIDAI",
    "fileUrl": null,
    "verificationStatus": "under_review",
    "adminNotes": null,
    "createdAt": "2026-04-14T10:00:00.000Z"
  }
}
```

#### 201 Created — with file

```json
{
  "success": true,
  "message": "User document created",
  "data": {
    "id": 13,
    "userId": 42,
    "documentTypeId": 1,
    "documentId": 3,
    "documentNumber": "AADHAAR-1234-5678-9012",
    "issueDate": "2020-01-15",
    "expiryDate": "2030-01-15",
    "issuingAuthority": "UIDAI",
    "fileUrl": "https://cdn.growupmore.com/user-documents/13.pdf",
    "fileName": "aadhaar.pdf",
    "fileFormat": "pdf",
    "fileSizeKb": 420,
    "verificationStatus": "under_review",
    "adminNotes": "Pre-vetted during onboarding",
    "createdAt": "2026-04-14T10:00:00.000Z"
  }
}
```

#### 400 Bad request — parent user missing / deleted

```json
{
  "success": false,
  "message": "Error inserting user document: User id 9999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — parent user inactive

```json
{
  "success": false,
  "message": "Error inserting user document: Cannot create active user document: user id 42 is inactive.",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — file too large

```json
{
  "success": false,
  "message": "File too large: file must be ≤ 5 MB",
  "code": "BAD_REQUEST"
}
```

---

## 7.8 `PATCH /api/v1/user-documents/:id`

`authorizeSelfOr` — admins edit any row (including workflow fields), self edits own row (workflow fields rejected). This is the endpoint the admin UI calls to move a row through the verification workflow.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/user-documents/:id` |
| Permission | `user_document.update` *or* `user_document.update.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Content-Type** — `application/json` or `multipart/form-data`.

### JSON (`application/json`)

Admin verifying a document:
```json
{
  "verificationStatus": "verified",
  "verifiedBy": 9,
  "verifiedAt": "2026-04-12T01:30:00.000Z",
  "adminNotes": "Scan is clear, identity confirmed."
}
```

Admin rejecting a document:
```json
{
  "verificationStatus": "rejected",
  "rejectionReason": "Document is blurry — please re-upload a sharper scan.",
  "adminNotes": "Second attempt; first scan also marked blurry."
}
```

### Form-data (`multipart/form-data`)

| Field | Type | Notes |
|---|---|---|
| `documentNumber`, `issueDate`, `expiryDate`, `issuingAuthority`, `verificationStatus`, `adminNotes` | text | Optional fields. Workflow fields allowed for admin, rejected for self. |
| `file` (aliases: `document`, `attachment`) | file | PDF / PNG / JPEG / WebP, **≤ 5 MB**. Optional. |

**Postman examples**

| # | Example name | Content-Type | Body |
|---|---|---|---|
| 1 | Update — JSON (verify document) | `application/json` | `{ "verificationStatus": "verified", "verifiedBy": 9, "adminNotes": "Scan is clear" }` |
| 2 | Update — form-data + text + file | `multipart/form-data` | `verificationStatus` = `under_review`, `adminNotes` = `Sent for second review`, `file` = `doc-v2.pdf` (file) |
| 3 | Update — file only | `multipart/form-data` | `file` = `document-updated.pdf` (file) |

### Responses

#### 200 OK — admin verifying

```json
{
  "success": true,
  "message": "User document updated",
  "data": {
    "id": 12,
    "userId": 42,
    "verificationStatus": "verified",
    "verifiedBy": 9,
    "verifiedAt": "2026-04-12T01:30:00.000Z",
    "adminNotes": "Scan is clear, identity confirmed.",
    "updatedAt": "2026-04-12T01:30:00.000Z"
  }
}
```

#### 200 OK — admin rejecting

```json
{
  "success": true,
  "message": "User document updated",
  "data": {
    "id": 12,
    "userId": 42,
    "verificationStatus": "rejected",
    "rejectionReason": "Document is blurry — please re-upload a sharper scan.",
    "adminNotes": "Second attempt; first scan also marked blurry.",
    "updatedAt": "2026-04-12T01:30:00.000Z"
  }
}
```

#### 200 OK — text + file update

```json
{
  "success": true,
  "message": "User document updated",
  "data": {
    "id": 12,
    "userId": 42,
    "fileUrl": "https://cdn.growupmore.com/user-documents/12.pdf",
    "fileName": "doc-v2.pdf",
    "fileFormat": "pdf",
    "fileSizeKb": 425,
    "verificationStatus": "under_review",
    "adminNotes": "Sent for second review",
    "updatedAt": "2026-04-12T02:00:00.000Z"
  }
}
```

#### 200 OK — file-only update

```json
{
  "success": true,
  "message": "User document updated",
  "data": {
    "id": 12,
    "userId": 42,
    "fileUrl": "https://cdn.growupmore.com/user-documents/12.pdf",
    "fileName": "document-updated.pdf",
    "fileFormat": "pdf",
    "fileSizeKb": 430,
    "verificationStatus": "pending",
    "updatedAt": "2026-04-12T02:01:00.000Z"
  }
}
```

#### 400 Validation error — empty body

```json
{
  "success": false,
  "message": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": [], "message": "Provide at least one field to update" }
  ]
}
```

#### 400 Bad request — soft-deleted row

```json
{
  "success": false,
  "message": "Error updating user document: No active user document found with id 42.",
  "code": "BAD_REQUEST"
}
```

> The update UDF refuses to touch a soft-deleted row — restore it first via §7.10.

#### 400 Bad request — file too large

```json
{
  "success": false,
  "message": "File too large: file must be ≤ 5 MB",
  "code": "BAD_REQUEST"
}
```

#### 403 Forbidden — own-scope caller, foreign row

```json
{
  "success": false,
  "message": "You can only edit your own documents.",
  "code": "FORBIDDEN"
}
```

#### 403 Forbidden — own-scope caller, workflow field attempted

```json
{
  "success": false,
  "message": "Validation error",
  "code": "VALIDATION_ERROR",
  "details": [
    { "path": ["verificationStatus"], "message": "Unrecognized key(s) in object: 'verificationStatus'" }
  ]
}
```

---

## 7.9 `DELETE /api/v1/user-documents/:id`

Admin or self soft-delete.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/user-documents/:id` |
| Permission | `user_document.delete` *or* `user_document.delete.own` |

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "User document deleted",
  "data": { "id": 42, "deleted": true }
}
```

#### 400 Bad request — already deleted / unknown id

```json
{
  "success": false,
  "message": "Error deleting user document: No active user document found to delete with id 9999.",
  "code": "BAD_REQUEST"
}
```

---

## 7.10 `POST /api/v1/user-documents/:id/restore`

Un-soft-delete a hidden row. Admin + super-admin only. The route uses `getByIdIncludingDeleted` to surface a clean `404` / `400` before the UDF runs.

The UDF validates both parents: the owning `users` row AND the referenced `documents` + `document_types` master rows must still be active / not deleted. If the master `documents` row has been retired, update the row to reference a live document first.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/user-documents/:id/restore` |
| Permission | `user_document.restore` |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "User document restored",
  "data": { /* full UserDocumentDto, now visible again */ }
}
```

#### 400 Bad request — not currently deleted

```json
{
  "success": false,
  "message": "User document 42 is not deleted; nothing to restore",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — owning user is deleted

```json
{
  "success": false,
  "message": "Error restoring user document: Cannot restore user document 42: owning user 9 is inactive or deleted.",
  "code": "BAD_REQUEST"
}
```

#### 403 Forbidden — caller lacks `user_document.restore`

```json
{
  "success": false,
  "message": "Missing required permission: user_document.restore",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "User document 42 not found",
  "code": "NOT_FOUND"
}
```

---

## 7.11 Verification workflow

The verification flow is the one place `user_documents` departs from the "just another 1:M child" template. Here's the whole thing end-to-end.

**1. Student submits.** `POST /api/v1/user-documents/me` from a student token. The schema is `.strict()`, so the only fields that reach the UDF are file metadata + identifiers. The row is inserted with `verificationStatus='pending'`, `verifiedBy=NULL`, `verifiedAt=NULL`.

**2. Admin picks it up.** Admin lists `GET /api/v1/user-documents?verificationStatus=pending&pageSize=50` and clicks into a row. The UI PATCHes `{ "verificationStatus": "under_review" }` via §7.8 to claim it — pure advisory, no locks, but it's the signal to other reviewers that someone's looking at it.

**3. Reviewer decides.** Two outcomes:
- **Verified:** PATCH `{ "verificationStatus": "verified", "verifiedBy": <admin userId>, "verifiedAt": "<ISO timestamp>", "adminNotes": "<optional>" }`. The student's record is now trusted downstream.
- **Rejected:** PATCH `{ "verificationStatus": "rejected", "rejectionReason": "<required>", "adminNotes": "<optional>" }`. The student sees the reason in `/me` and decides how to respond.

**4. Student reacts.** If rejected with a recoverable reason (blurry scan, cropped page), the admin UI can move the row to `reupload` — same PATCH but `verificationStatus: "reupload"`. The student PATCHes a new `fileUrl` via `/me/:id`. Note that the file update does **not** auto-reset `verificationStatus` — the student's PATCH leaves the status as-is. The admin UI should explicitly move it back to `under_review` in the same round-trip when processing a re-upload.

**5. Expiry sweep.** A periodic job can issue `GET /api/v1/user-documents?verificationStatus=verified` and inspect `expiryDate`. When a document's `expiryDate` has passed, PATCH `{ "verificationStatus": "expired" }` to surface it in the admin queue again.

**Key invariants:**

- **Self lane can't self-verify.** `.strict()` on `createMyUserDocumentBodySchema` and `updateMyUserDocumentBodySchema` rejects every workflow field with a 400. A student cannot set `verificationStatus`, `verifiedBy`, `verifiedAt`, `rejectionReason`, or `adminNotes` under any circumstances.
- **Insert takes only one workflow field.** `udf_insert_user_document` accepts `p_verification_status` but NOT `verified_by` / `verified_at` / `rejection_reason` / `admin_notes`. Those are move-only: you finalize verification via PATCH, not at creation time.
- **The file URL is not scanned.** The server does not download the file, validate its contents, or check that the URL is live. Reviewers are responsible for opening the file out-of-band and deciding whether it's legitimate.
- **Restoring a rejected row preserves its verdict.** `udf_restore_user_document` does not touch `verificationStatus` — a previously rejected row comes back out of soft-delete still rejected. An admin re-reviewing the row has to explicitly PATCH the status again.

---

## DTO reference

The full `UserDocumentDto` definition lives in [`api/src/modules/user-documents/user-documents.service.ts`](../../../api/src/modules/user-documents/user-documents.service.ts). Top-level keys:

| Key | Purpose |
|---|---|
| `id`, `userId`, `documentTypeId`, `documentId` | Primary key + FKs (all NOT NULL). `(userId, documentId)` is unique. |
| `documentNumber` | The identifier shown on the document itself (e.g. the Aadhaar number). Optional, free-form text. |
| `fileUrl`, `fileName`, `fileSizeKb`, `fileFormat` | File metadata — the server does not open the file, it just stores the URL. |
| `issueDate`, `expiryDate`, `issuingAuthority` | Document-level metadata. `expiryDate` must be on or after `issueDate`. |
| `verificationStatus` | `pending` / `under_review` / `verified` / `rejected` / `expired` / `reupload`. See §7.11. |
| `verifiedBy`, `verifiedAt` | Admin-only. Set when transitioning to `verified`. |
| `rejectionReason`, `adminNotes` | Admin-only. Free-form text. |
| `isActive`, `isDeleted`, `deletedAt` | Soft-delete flags. Hidden by default GET unless `isDeleted=true`. |
| `createdBy`, `updatedBy`, `createdAt`, `updatedAt` | Audit trail. |
| `user` | Nested owner summary (first/last name, email, role, active/deleted). |
| `document` | Nested `documents` lookup — `id`, `name`, `description`, plus master-data active/deleted flags. |
| `documentType` | Nested `document_types` lookup — `id`, `name`, plus master-data active/deleted flags. |

### File upload field aliases and constraints

When uploading files via `multipart/form-data`, the `file` field accepts these interchangeable names:

- `file` (canonical) = `document` = `attachment`

**File constraints:**
- Accepted MIME types: `application/pdf`, `image/png`, `image/jpeg`, `image/webp`
- Maximum size: **5 MB** raw

← [06 user-languages](06%20-%20user-languages.md) · **Next →** [08 user-projects](08%20-%20user-projects.md)
