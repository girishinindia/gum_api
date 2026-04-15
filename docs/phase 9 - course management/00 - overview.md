# Phase 9 — Course Management (overview)

Phase 9 wraps the **course catalog** layer that sits on top of the phase-8 material hierarchy and assembles browsable, sellable courseware:

1. **Course** — the top-level catalog entity (price, status, level, hierarchy roots).
2. **Course Sub-Category** — many-to-many tagging under a sub-category for catalog navigation.
3. **Course Module** — ordered curriculum unit inside a course; carries its own translations (title, description, intro/outro media URLs).
4. **Course Subject / Course Chapter / Course Module Topic** — three pure junction tables that bind a module (or its parent course) back to phase-8 subjects → chapters → topics. They expose CRUD only — no translations.
5. **Course Instructor** — junction binding a course to one or more `instructor_profiles` rows, with an `is_lead` flag and `display_order`.
6. **Bundle** — a bundle catalog row (price, status, level) that groups multiple courses; carries its own per-language translation rows.
7. **Bundle Course** — junction binding a bundle to its constituent courses with `display_order`.

Every level follows the same architectural shape:

* One parent row table (language-agnostic catalog metadata: `code`, `slug`, `course_status`, `pricing`, ordering, `is_active`, `is_deleted`).
* For the three translation-bearing parents (`courses`, `course_modules`, `bundles`) a sibling translations table keyed by `(parent_id, language_id)` with `name`, `short_intro`, `long_intro`, video metadata, and full SEO/OG/Twitter block.
* For the six junction parents (`course_sub_categories`, `course_subjects`, `course_chapters`, `course_module_topics`, `course_instructors`, `bundle_courses`) a flat row carrying foreign keys + `display_order` + soft-delete flags. **No translations, no media.**
* View (`uv_<resource>` / `uv_<resource>_translations`) for joined reads.
* UDFs for create/update/delete/restore on both the parent and its translations.
* CRUD routes under `/api/v1/{courses|course-sub-categories|course-modules|course-subjects|course-chapters|course-instructors|course-module-topics|bundles|bundle-courses}`. The three translation-bearing parents also expose a nested translation sub-resource at `/api/v1/{resource}/:id/translations`.

All routes require authentication. Per-row permissions follow the `{resource}.{read|create|update|delete|restore}` naming convention (e.g. `course.read`, `course_module.create`, `bundle.delete`, `bundle_course.restore`).

---

## Media in Phase 9 — mixed contract (Bunny-managed images + text URLs for video/PDF)

Phase 9 follows the same Bunny CDN pipeline as Phase 8 for **image slots only**. Video URLs and PDF URLs continue to be stored as **plain text columns** that callers populate from their own video/PDF host. Concretely:

* **Image columns** (re-encoded to WebP, ≤ 100 KB cap, 512 × 512 box, deterministic CDN path) — accepted as multipart file parts on `POST` and `PATCH`:
  * `courses` parent — `trailerThumbnail` (1 slot).
  * `course_translations` — `webThumbnail`, `webBanner`, `appThumbnail`, `appBanner`, `videoThumbnail`, `ogImage`, `twitterImage` (7 slots).
  * `course_module_translations` — `icon` (256 × 256 box), `image`, `ogImage`, `twitterImage` (4 slots).
  * `bundle_translations` — `thumbnail`, `banner`, `ogImage`, `twitterImage` (4 slots).
* **Video / PDF / external URL columns** (`intro_video_url`, `outro_video_url`, `trailer_video_url`, `attachment_pdf_url`, etc.) — always remain free-form text fields in the JSON / form-text body. The API never receives the binary; callers upload these to their own host first and pass the URL string.

That gives every translation-bearing route the **5-variant body matrix** familiar from Phase 8:

| | Phase 8 | Phase 9 (translation-bearing routes) |
|---|---|---|
| Body content-type | `application/json` *or* `multipart/form-data` | `application/json` *or* `multipart/form-data` |
| Image slots managed by Bunny | 4 per translation | 1–7 depending on resource (see list above) |
| Video / PDF URLs | text columns | text columns (unchanged) |
| Body variants on POST / PATCH | 5 (text-only / text+image / all-image / single-image / empty-400) | 5 (same matrix) |

Junction tables (`course_sub_categories`, `course_subjects`, `course_chapters`, `course_module_topics`, `course_instructors`, `bundle_courses`) carry no media of any kind and stay JSON-only.

If new image columns are added to any of these tables in the future, the wiring is identical: declare the slot in `core/middlewares/upload.ts`, add a single-slot setter in the resource service that calls the existing update UDF with all params null except the slot column, and extend the `processXxxImageUploads` slot map.

---

## Permissions seeded by phase 9

47 permissions span 10 logical resources. The seed file at `db_schema/phase-09-course-management/02_seed_permissions.sql` declares them with `display_order` 901–947.

| Resource | Permission codes | Purpose |
|---|---|---|
| `course` | `course.{create,read,update,delete,restore}` | Course parent row + translations. |
| `course_sub_category` | `course_sub_category.{create,read,update,delete,restore}` | Course ↔ sub-category junction. |
| `course_module` | `course_module.{create,read,update,delete,restore}` | Module parent row + translations. |
| `course_subject` | `course_subject.{create,read,update,delete,restore}` | Course ↔ phase-8 subject junction. |
| `course_chapter` | `course_chapter.{create,read,update,delete,restore}` | Module ↔ phase-8 chapter junction. |
| `course_instructor` | `course_instructor.{create,read,update,delete,restore}` | Course ↔ instructor junction. |
| `course_module_topic` | `course_module_topic.{create,read,update,delete,restore}` | Module ↔ phase-8 topic junction. |
| `bundle` | `bundle.{create,read,update,delete,restore}` | Bundle parent row + translations. |
| `bundle_course` | `bundle_course.{create,read,update,delete,restore}` | Bundle ↔ course junction. |
| `bundle_translation` | `bundle_translation.{create,update}` | Granular translation gates (read/delete/restore inherit from `bundle.*`). |

Default role grants:

* **Super-admin** (role 1) — all 47 permissions.
* **Admin** (role 2) — every permission **except** `*.delete` and `*.restore` (29 of 47 — create / read / update only). Stale grants in either direction are pruned on every re-run of the seed.
* All other tiers (employee, student, instructor) are not granted course-management write permissions by default; the catalog surfaces are read-only for them.

---

## Sub-pages in this phase

| File | Resource | Base path | Translations? |
|---|---|---|---|
| [01 - courses.md](01%20-%20courses.md) | Course + Course Translations | `/api/v1/courses` | yes |
| [02 - course-sub-categories.md](02%20-%20course-sub-categories.md) | Course ↔ Sub-Category junction | `/api/v1/course-sub-categories` | no |
| [03 - course-modules.md](03%20-%20course-modules.md) | Course Module + Module Translations | `/api/v1/course-modules` | yes |
| [04 - course-subjects.md](04%20-%20course-subjects.md) | Course ↔ Subject junction | `/api/v1/course-subjects` | no |
| [05 - course-chapters.md](05%20-%20course-chapters.md) | Module ↔ Chapter junction | `/api/v1/course-chapters` | no |
| [06 - course-instructors.md](06%20-%20course-instructors.md) | Course ↔ Instructor junction | `/api/v1/course-instructors` | no |
| [07 - course-module-topics.md](07%20-%20course-module-topics.md) | Module ↔ Topic junction | `/api/v1/course-module-topics` | no |
| [08 - bundles.md](08%20-%20bundles.md) | Bundle + Bundle Translations | `/api/v1/bundles` | yes |
| [09 - bundle-courses.md](09%20-%20bundle-courses.md) | Bundle ↔ Course junction | `/api/v1/bundle-courses` | no |

← [Phase 8 — Material Management](../phase%208%20-%20material%20management/00%20-%20overview.md) · **Next →** [01 - courses](01%20-%20courses.md)
