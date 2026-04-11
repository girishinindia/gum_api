# Phase 2 — Document types

Top-level catalogue of the **kinds of documents** the product understands — "Identity Proof", "Residence Proof", "Academic Document", and so on. This table is the parent of [`documents`](08%20-%20documents.md), which hangs concrete named artefacts (Aadhar Card, PAN Card, 10th Marksheet…) off a specific `document_type`.

All routes require auth. Permission codes: `document_type.read`, `document_type.create`, `document_type.update`, `document_type.delete`, `document_type.restore`.

← [06 walkthrough](06%20-%20walkthrough%20and%20index.md) · **Next →** [08 documents](08%20-%20documents.md)

---

## 7.1 `GET /api/v1/document-types`

List document types. Backed by `udf_get_document_types`.

**Query params**

| Param | Type | Notes |
|---|---|---|
| `pageIndex`, `pageSize` | int | Standard pagination. |
| `searchTerm` | string | `ILIKE` against `name` and `description`. |
| `isActive`, `isDeleted` | bool | |
| `sortColumn` | enum | `id`, `name`, `is_active`, `is_deleted`, `created_at`, `updated_at`. Default `id`. |
| `sortDirection` | enum | `ASC` / `DESC`. |

**Sample row**

```json
{
  "id": 1,
  "name": "Identity Proof",
  "description": "Government-issued documents that verify a person's identity.",
  "isActive": true,
  "isDeleted": false,
  "createdAt": "2026-01-10T00:00:00.000Z",
  "updatedAt": "2026-01-10T00:00:00.000Z",
  "deletedAt": null
}
```

### Defaults

```
pageIndex=1  pageSize=20  sortColumn=id  sortDirection=ASC
```

### Sample queries

**1. All active document types**

```bash
curl "http://localhost:3000/api/v1/document-types?isActive=true" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**2. Search for "proof"**

```bash
curl "http://localhost:3000/api/v1/document-types?searchTerm=proof" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**3. Sorted alphabetically**

```bash
curl "http://localhost:3000/api/v1/document-types?sortColumn=name&sortDirection=ASC" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 7.2 `GET /api/v1/document-types/:id`

Read a single document type by id. **404** with `"DocumentType 9999 not found"` if unknown.

```bash
curl "http://localhost:3000/api/v1/document-types/1" -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 7.3 `POST /api/v1/document-types`

Create a document type. Permission: `document_type.create`.

```bash
curl -X POST "http://localhost:3000/api/v1/document-types" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Medical Document",
    "description": "Doctor-issued reports, prescriptions, test results.",
    "isActive": true
  }'
```

`name` is required. **Response 201** — the full new row.

**Possible errors**

- **400 VALIDATION_ERROR** — missing `name`, name too long (> 128), description too long (> 2000).
- **403** — caller lacks `document_type.create`.
- **409** — a document type with the same `name` already exists (CITEXT, case-insensitive).

---

## 7.4 `PATCH /api/v1/document-types/:id`

Partial update. Any subset of `name`, `description`, `isActive`. **400** on empty body.

```bash
curl -X PATCH "http://localhost:3000/api/v1/document-types/1" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "description": "Updated description." }'
```

---

## 7.5 `DELETE /api/v1/document-types/:id`

Soft delete. Permission: `document_type.delete`.

```bash
curl -X DELETE "http://localhost:3000/api/v1/document-types/1" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Response: `{ "success": true, "message": "Document type deleted", "data": { "id": 1, "deleted": true } }`.

> **FK guard.** `documents` rows reference `document_types(id)`, so while the soft-delete only flips `is_deleted`, any **hard** delete will fail if children exist. The verify script exercises this guard.

---

## 7.6 `POST /api/v1/document-types/:id/restore`

Reverse a soft delete. Permission: `document_type.restore`. **400 BAD_REQUEST** if the row isn't deleted.

```bash
curl -X POST "http://localhost:3000/api/v1/document-types/1/restore" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

**Common errors across all document-type routes**

| HTTP | code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing / expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No document type with that id. |
| 409 | `DUPLICATE_ENTRY` | A document type with the same `name` already exists. |
