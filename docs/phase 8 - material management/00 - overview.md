# Phase 8 — Material Management (overview)

Phase 8 wraps the four-level learning-content hierarchy used by Grow Up More courseware:

1. **Subject** — top-level knowledge domain (e.g. *Mathematics*, *Data Science*).
2. **Chapter** — a major unit inside a subject (e.g. *Linear Algebra*).
3. **Topic** — a focused lesson inside a chapter (e.g. *Vector Spaces*).
4. **Sub-topic** — the atomic teaching unit inside a topic (e.g. *Basis and Dimension*).

Every level follows the same architectural shape:

* One parent row table (language-agnostic metadata: `code`, `slug`, `difficulty_level`, ordering, `is_active`, `is_deleted`).
* One translations table per language (`name`, `short_intro`, `long_intro`, video metadata, full SEO/OG/Twitter block, and **four image slots** — `icon`, `image`, `ogImage`, `twitterImage`).
* View (`uv_<resource>_translations`) for joined reads.
* UDFs for create/update/delete/restore on both the parent and its translations.
* CRUD routes under `/api/v1/{subjects|chapters|topics|sub-topics}` plus a nested translation sub-resource at `/api/v1/{resource}/:id/translations`.

All routes require authentication. Per-row permissions follow the `{resource}.{read|create|update|delete|restore}` naming convention (e.g. `subject.read`, `chapter.create`, `topic.delete`, `sub_topic.restore`).

---

## Image-upload contract (common to all four resources)

Translation image uploads use **multipart/form-data**. The four slots share a single contract — supply one or more slots on the same request:

| Slot field name | Purpose | Image box | Storage path |
|---|---|---|---|
| `icon` | Small square icon | 256 × 256 | `{resource}/translations/{tid}/icon.webp` |
| `image` | Hero / cover image | 512 × 512 | `{resource}/translations/{tid}/image.webp` |
| `ogImage` | Open Graph share card | 512 × 512 | `{resource}/translations/{tid}/og-image.webp` |
| `twitterImage` | Twitter share card | 512 × 512 | `{resource}/translations/{tid}/twitter-image.webp` |

Rules:

* Accepted raw formats: `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`.
* **Raw cap: 200 KB** per slot (413 if exceeded).
* Server re-encodes every slot with Sharp quality-loop (80 → 40) until ≤ 100 KB and writes a **WebP** back to Bunny CDN.
* If an existing URL is already stored, the pipeline deletes the prior Bunny object before PUTting the new one. Log-and-continue on stale cleanup failures.
* Text fields may be sent on the **same** multipart request; the `coerceMultipartBody` middleware re-hydrates strings back to numbers / booleans / JSON before validation.

### PATCH translation — the 5 body variants

For every nested translation PATCH (`PATCH /api/v1/{resource}/:id/translations/:tid`) the handler accepts any of the following:

| # | Scenario | Content-Type | Body |
|---|---|---|---|
| 1 | Text only — no image change | `application/json` *or* `multipart/form-data` | `{ "name": "Updated" }` |
| 2 | Text + image | `multipart/form-data` | `name`=`Updated`, `icon`=*(file)* |
| 3 | All-slot image replacement, no text | `multipart/form-data` | `icon`=*(file)*, `image`=*(file)*, `ogImage`=*(file)*, `twitterImage`=*(file)* |
| 4 | Single-slot image swap, no text | `multipart/form-data` | `icon`=*(file)* |
| 5 | Empty (both body and slots missing) → `400 BAD_REQUEST` | either | — |

At least one of `hasTextChange || hasFile` must be true; else the handler throws `400 BAD_REQUEST — Provide at least one field to update`.

POST `/api/v1/{resource}/:id/translations` accepts the same slots, so the parallel create variants are:

| # | Scenario | Content-Type | Body |
|---|---|---|---|
| A | Create — text only | `application/json` | `{ "languageId": 1, "name": "..." }` |
| B | Create — text + one or more image slots | `multipart/form-data` | `languageId`=`1`, `name`=`…`, `icon`=*(file)*, … |

The handler runs the text-first UDF to create the translation row, then, when files are present, pipes each supplied slot through `processXxxTranslationImageUploads` which re-encodes, uploads, and back-writes the CDN URL into the matching column via the setter UDF.

---

## Permissions seeded by phase 8

| Permission code | Granted to super_admin by default | Purpose |
|---|---|---|
| `subject.read` / `chapter.read` / `topic.read` / `sub_topic.read` | yes | List & get-by-id, translation list & get-by-id. |
| `subject.create` / `chapter.create` / `topic.create` / `sub_topic.create` | yes | Create parent row; create translation. |
| `subject.update` / `chapter.update` / `topic.update` / `sub_topic.update` | yes | Patch parent row; patch translation text & images. |
| `subject.delete` / `chapter.delete` / `topic.delete` / `sub_topic.delete` | yes | Soft-delete parent row or translation. |
| `subject.restore` / `chapter.restore` / `topic.restore` / `sub_topic.restore` | yes | Undo a soft-delete. |

Super admin role owns all the above. Lower-tier roles (admin, employee, student, instructor) are not granted material-management permissions by default — the UI surfaces are read-only for them.

---

## Sub-pages in this phase

| File | Resource | Base path |
|---|---|---|
| [01 - subjects.md](01%20-%20subjects.md) | Subject + Subject Translations | `/api/v1/subjects` |
| [02 - chapters.md](02%20-%20chapters.md) | Chapter + Chapter Translations | `/api/v1/chapters` |
| [03 - topics.md](03%20-%20topics.md) | Topic + Topic Translations | `/api/v1/topics` |
| [04 - sub-topics.md](04%20-%20sub-topics.md) | Sub-topic + Sub-topic Translations | `/api/v1/sub-topics` |

← [Phase 7 — Instructor Management](../phase%207%20-%20instructor%20management/01%20-%20instructor-profiles.md) · **Next →** [01 - subjects](01%20-%20subjects.md)
