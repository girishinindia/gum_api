# Phase 2 — Documents

Concrete, named documents belonging to a [`document_type`](07%20-%20document-types.md). "Aadhar Card" belongs to "Identity Proof", "10th Marksheet" belongs to "Academic Document", and so on. Every list response carries a nested `documentType` block, so a single GET renders "Aadhar Card — Identity Proof" without a second request.

All routes require auth. Permission codes: `document.read`, `document.create`, `document.update`, `document.delete`, `document.restore`.

← [07 document-types](07%20-%20document-types.md) · **Next →** [09 designations](09%20-%20designations.md)

---

## 8.1 `GET /api/v1/documents`

List documents with their parent document type. Backed by `udf_get_documents` (which joins `documents` → `document_types` via `uv_documents`).

**Query params**

| Param | Type | Notes |
|---|---|---|
| `pageIndex`, `pageSize` | int | Standard pagination. |
| `searchTerm` | string | `ILIKE` across `document_name`, `document_description`, and `document_type_name`. |
| `isActive`, `isDeleted` | bool | Map to the **document** layer. |
| `documentTypeId` | int | Filter to documents of a specific type. |
| `documentTypeIsActive`, `documentTypeIsDeleted` | bool | Target the **parent** layer independently. |
| `sortTable` | enum | `document` (default) or `document_type`. |
| `sortColumn` | enum | `id`, `name`, `is_active`, `is_deleted`, `created_at`, `updated_at`. Default `id`. |
| `sortDirection` | enum | `ASC` / `DESC`. |

**Sample row**

```json
{
  "id": 1,
  "documentTypeId": 1,
  "name": "Aadhar Card",
  "description": "Unique 12-digit identity issued by UIDAI.",
  "isActive": true,
  "isDeleted": false,
  "createdAt": "2026-01-10T00:00:00.000Z",
  "updatedAt": "2026-01-10T00:00:00.000Z",
  "deletedAt": null,
  "documentType": {
    "id": 1,
    "name": "Identity Proof",
    "description": "Government-issued documents that verify a person's identity.",
    "isActive": true,
    "isDeleted": false
  }
}
```

### Defaults

```
pageIndex=1  pageSize=20  sortTable=document  sortColumn=id  sortDirection=ASC
```

### Sample queries

**1. All documents for "Identity Proof"**

```bash
curl "http://localhost:3000/api/v1/documents?documentTypeId=1&sortColumn=name" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**2. Search across both layers**

```bash
curl "http://localhost:3000/api/v1/documents?searchTerm=marksheet" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**3. Sort by parent type name**

```bash
curl "http://localhost:3000/api/v1/documents?sortTable=document_type&sortColumn=name&sortDirection=ASC" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**4. Only documents whose parent is active**

```bash
curl "http://localhost:3000/api/v1/documents?documentTypeIsActive=true" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 8.2 `GET /api/v1/documents/:id`

Read a single document by id. **404** with `"Document 9999 not found"` if unknown.

```bash
curl "http://localhost:3000/api/v1/documents/1" -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 8.3 `POST /api/v1/documents`

Create a document. Permission: `document.create`.

```bash
curl -X POST "http://localhost:3000/api/v1/documents" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "documentTypeId": 1,
    "name": "Voter ID",
    "description": "Electoral Photo Identity Card issued by the ECI.",
    "isActive": true
  }'
```

`documentTypeId` and `name` are required. **Response 201** — the full new row with the nested `documentType` block.

**Possible errors**

- **400 VALIDATION_ERROR** — missing required field.
- **403** — caller lacks `document.create`.
- **404** — `documentTypeId` refers to a row that doesn't exist or is soft-deleted.
- **409** — a document with the same `(documentTypeId, name)` already exists (CITEXT, case-insensitive).

---

## 8.4 `PATCH /api/v1/documents/:id`

Partial update. Any subset of `documentTypeId`, `name`, `description`, `isActive`. **400** on empty body.

```bash
curl -X PATCH "http://localhost:3000/api/v1/documents/1" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "description": "Updated description." }'
```

> Moving a document between types by PATCHing `documentTypeId` is supported — the uniqueness guard runs against the **new** parent.

---

## 8.5 `DELETE /api/v1/documents/:id`

Soft delete. Permission: `document.delete`.

```bash
curl -X DELETE "http://localhost:3000/api/v1/documents/1" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

## 8.6 `POST /api/v1/documents/:id/restore`

Reverse a soft delete. Permission: `document.restore`. **400 BAD_REQUEST** if the row isn't deleted.

```bash
curl -X POST "http://localhost:3000/api/v1/documents/1/restore" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

---

**Common errors across all document routes**

| HTTP | code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing / expired bearer token. |
| 403 | `FORBIDDEN` | Missing the required permission. |
| 404 | `NOT_FOUND` | No document, or bad `documentTypeId`. |
| 409 | `DUPLICATE_ENTRY` | A document with the same `(documentTypeId, name)` already exists. |
