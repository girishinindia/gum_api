# Phase 9 — Courses

A course is a comprehensive learning package that combines instructional content, structured lessons, assessments, and credentials. Courses represent an instructor's curated pathway for students to master a specific skill or domain. Each course may have metadata such as difficulty level, pricing, enrollment caps, ratings, translatable content (title, introductions, descriptions), media assets (trailers, thumbnails, banners), SEO/OG metadata, and course-specific features (certificates, placement assistance, refunds). Courses support soft-delete and admin restore. All routes require authentication.

Permission codes: `course.read`, `course.create`, `course.update`, `course.delete`, `course.restore`.

- **Super-admin**: all 5 permissions.
- **Admin**: `read`, `create`, `update`, `restore` (no `delete`).
- **Instructor & Student**: `read` only.

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](../00%20-%20overview.md#8-postman-environment).

← [back to Phase 9](./00%20-%20overview.md) · [Next →](./02%20-%20lessons.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1courses) | `GET` | `{{baseUrl}}/api/v1/courses` | `course.read` | List all courses with pagination, search, filter, and sort. |
| [§1.2](#12-get-apiv1coursesid) | `GET` | `{{baseUrl}}/api/v1/courses/:id` | `course.read` | Get one course by ID. |
| [§1.3](#13-post-apiv1courses) | `POST` | `{{baseUrl}}/api/v1/courses` | `course.create` | Create a new course. |
| [§1.4](#14-patch-apiv1coursesid) | `PATCH` | `{{baseUrl}}/api/v1/courses/:id` | `course.update` | Update a course by ID. |
| [§1.5](#15-delete-apiv1coursesid) | `DELETE` | `{{baseUrl}}/api/v1/courses/:id` | `course.delete` | Soft-delete a course (SA only). |
| [§1.6](#16-post-apiv1coursesidrestore) | `POST` | `{{baseUrl}}/api/v1/courses/:id/restore` | `course.restore` | Restore a soft-deleted course (admin+ only). |
| [§1.7](#17-get-apiv1coursesidtranslations) | `GET` | `{{baseUrl}}/api/v1/courses/:id/translations` | `course.read` | List translations of a course. |
| [§1.8](#18-get-apiv1coursesidtranslationstid) | `GET` | `{{baseUrl}}/api/v1/courses/:id/translations/:tid` | `course.read` | Get one translation by ID. |
| [§1.9](#19-post-apiv1coursesidtranslations) | `POST` | `{{baseUrl}}/api/v1/courses/:id/translations` | `course.create` | Create a new translation for a course. |
| [§1.10](#110-patch-apiv1coursesidtranslationstid) | `PATCH` | `{{baseUrl}}/api/v1/courses/:id/translations/:tid` | `course.update` | Update a course translation. |
| [§1.11](#111-delete-apiv1coursesidtranslationstid) | `DELETE` | `{{baseUrl}}/api/v1/courses/:id/translations/:tid` | `course.delete` | Soft-delete a translation. |
| [§1.12](#112-post-apiv1coursesidtranslationstidrestore) | `POST` | `{{baseUrl}}/api/v1/courses/:id/translations/:tid/restore` | `course.restore` | Restore a soft-deleted translation. |

---

## 1.1 `GET /api/v1/courses`

List all courses with support for pagination, search, filtering, and sorting.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/courses` |
| Permission | `course.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `searchTerm` | string | — | `ILIKE` across `title`, `short_intro`, `long_intro`, `tagline`, `code`, `slug` (translation & course). |
| `sortColumn` | enum | `id` | `id`, `code`, `slug`, `price`, `rating_average`, `enrollment_count`, `created_at`, `published_at`, `updated_at`. |
| `sortDirection` | enum | `ASC` | `ASC` \| `DESC`. |
| `difficultyLevel` | enum | — | `absolute beginner`, `beginner`, `intermediate`, `advanced`, `expert`, `bootcamp`, `mega`. |
| `courseStatus` | enum | — | `draft`, `under_review`, `published`, `archived`, `suspended`. |
| `isFree` | bool | — | Filter by free/paid status. |
| `currency` | enum | — | `INR`, `USD`, `EUR`, `GBP`, `AUD`, `CAD`, `SGD`, `AED`, `other`. |
| `isInstructorCourse` | bool | — | Filter by instructor-created courses. |
| `isActive` | bool | — | Filter by active flag. |
| `isDeleted` | bool | — | Include/exclude soft-deleted courses. |

**Request body** — none.

### Responses

#### 200 OK — happy path

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 1,
      "translationId": 1,
      "code": "WEB101",
      "slug": "web-development-bootcamp",
      "title": "Web Development Bootcamp",
      "languageCode": "en",
      "instructorFullName": "John Doe",
      "price": 9999,
      "currency": "INR",
      "isFree": false,
      "difficultyLevel": "bootcamp",
      "courseStatus": "published",
      "isActive": true,
      "ratingAverage": 4.8,
      "enrollmentCount": 1250,
      "totalLessons": 48
    },
    {
      "id": 2,
      "translationId": 2,
      "code": "PYTHON101",
      "slug": "python-for-beginners",
      "title": "Python for Beginners",
      "languageCode": "en",
      "instructorFullName": "Jane Smith",
      "price": 0,
      "currency": "INR",
      "isFree": true,
      "difficultyLevel": "beginner",
      "courseStatus": "published",
      "isActive": true,
      "ratingAverage": 4.6,
      "enrollmentCount": 3420,
      "totalLessons": 25
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 47, "totalPages": 3 }
}
```

#### 403 Forbidden — caller lacks `course.read`

```json
{
  "success": false,
  "message": "Missing required permission: course.read",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/courses` — method, headers and auth stay the same as the base request above.

| # | Description | Method | URL |
|---|---|---|---|
| 1 | Page 1 (defaults) | `GET` | `{{baseUrl}}/api/v1/courses?pageIndex=1&pageSize=20` |
| 2 | Page 2, default size | `GET` | `{{baseUrl}}/api/v1/courses?pageIndex=2&pageSize=20` |
| 3 | Page 3, default size | `GET` | `{{baseUrl}}/api/v1/courses?pageIndex=3&pageSize=20` |
| 4 | Page 1, small page (5 rows) | `GET` | `{{baseUrl}}/api/v1/courses?pageIndex=1&pageSize=5` |
| 5 | Page 1, medium page (10 rows) | `GET` | `{{baseUrl}}/api/v1/courses?pageIndex=1&pageSize=10` |
| 6 | Page 1, large page (100 rows) | `GET` | `{{baseUrl}}/api/v1/courses?pageIndex=1&pageSize=100` |
| 7 | Out-of-range page (returns empty `data`) | `GET` | `{{baseUrl}}/api/v1/courses?pageIndex=9999&pageSize=20` |
| 8 | Search — `web` | `GET` | `{{baseUrl}}/api/v1/courses?searchTerm=web` |
| 9 | Search — `python` | `GET` | `{{baseUrl}}/api/v1/courses?searchTerm=python` |
| 10 | Search — `bootcamp` | `GET` | `{{baseUrl}}/api/v1/courses?searchTerm=bootcamp` |
| 11 | Search + pagination | `GET` | `{{baseUrl}}/api/v1/courses?pageIndex=1&pageSize=10&searchTerm=development` |
| 12 | Free courses only | `GET` | `{{baseUrl}}/api/v1/courses?isFree=true` |
| 13 | Paid courses only | `GET` | `{{baseUrl}}/api/v1/courses?isFree=false` |
| 14 | Active only | `GET` | `{{baseUrl}}/api/v1/courses?isActive=true` |
| 15 | Inactive only | `GET` | `{{baseUrl}}/api/v1/courses?isActive=false` |
| 16 | Deleted only | `GET` | `{{baseUrl}}/api/v1/courses?isDeleted=true` |
| 17 | Non-deleted only | `GET` | `{{baseUrl}}/api/v1/courses?isDeleted=false` |
| 18 | Difficulty — absolute beginner | `GET` | `{{baseUrl}}/api/v1/courses?difficultyLevel=absolute%20beginner` |
| 19 | Difficulty — beginner | `GET` | `{{baseUrl}}/api/v1/courses?difficultyLevel=beginner` |
| 20 | Difficulty — intermediate | `GET` | `{{baseUrl}}/api/v1/courses?difficultyLevel=intermediate` |
| 21 | Difficulty — advanced | `GET` | `{{baseUrl}}/api/v1/courses?difficultyLevel=advanced` |
| 22 | Difficulty — expert | `GET` | `{{baseUrl}}/api/v1/courses?difficultyLevel=expert` |
| 23 | Difficulty — bootcamp | `GET` | `{{baseUrl}}/api/v1/courses?difficultyLevel=bootcamp` |
| 24 | Difficulty — mega | `GET` | `{{baseUrl}}/api/v1/courses?difficultyLevel=mega` |
| 25 | Course status — draft | `GET` | `{{baseUrl}}/api/v1/courses?courseStatus=draft` |
| 26 | Course status — under_review | `GET` | `{{baseUrl}}/api/v1/courses?courseStatus=under_review` |
| 27 | Course status — published | `GET` | `{{baseUrl}}/api/v1/courses?courseStatus=published` |
| 28 | Course status — archived | `GET` | `{{baseUrl}}/api/v1/courses?courseStatus=archived` |
| 29 | Course status — suspended | `GET` | `{{baseUrl}}/api/v1/courses?courseStatus=suspended` |
| 30 | Currency — INR | `GET` | `{{baseUrl}}/api/v1/courses?currency=INR` |
| 31 | Currency — USD | `GET` | `{{baseUrl}}/api/v1/courses?currency=USD` |
| 32 | Currency — EUR | `GET` | `{{baseUrl}}/api/v1/courses?currency=EUR` |
| 33 | Currency — GBP | `GET` | `{{baseUrl}}/api/v1/courses?currency=GBP` |
| 34 | Instructor courses only | `GET` | `{{baseUrl}}/api/v1/courses?isInstructorCourse=true` |
| 35 | Sort by `id` ASC (default) | `GET` | `{{baseUrl}}/api/v1/courses?sortColumn=id&sortDirection=ASC` |
| 36 | Sort by `id` DESC | `GET` | `{{baseUrl}}/api/v1/courses?sortColumn=id&sortDirection=DESC` |
| 37 | Sort by `code` ASC | `GET` | `{{baseUrl}}/api/v1/courses?sortColumn=code&sortDirection=ASC` |
| 38 | Sort by `code` DESC | `GET` | `{{baseUrl}}/api/v1/courses?sortColumn=code&sortDirection=DESC` |
| 39 | Sort by `slug` ASC | `GET` | `{{baseUrl}}/api/v1/courses?sortColumn=slug&sortDirection=ASC` |
| 40 | Sort by `slug` DESC | `GET` | `{{baseUrl}}/api/v1/courses?sortColumn=slug&sortDirection=DESC` |
| 41 | Sort by `price` ASC | `GET` | `{{baseUrl}}/api/v1/courses?sortColumn=price&sortDirection=ASC` |
| 42 | Sort by `price` DESC (most expensive) | `GET` | `{{baseUrl}}/api/v1/courses?sortColumn=price&sortDirection=DESC` |
| 43 | Sort by `rating_average` DESC (highest rated) | `GET` | `{{baseUrl}}/api/v1/courses?sortColumn=rating_average&sortDirection=DESC` |
| 44 | Sort by `rating_average` ASC (lowest rated) | `GET` | `{{baseUrl}}/api/v1/courses?sortColumn=rating_average&sortDirection=ASC` |
| 45 | Sort by `enrollment_count` DESC (most popular) | `GET` | `{{baseUrl}}/api/v1/courses?sortColumn=enrollment_count&sortDirection=DESC` |
| 46 | Sort by `enrollment_count` ASC | `GET` | `{{baseUrl}}/api/v1/courses?sortColumn=enrollment_count&sortDirection=ASC` |
| 47 | Sort by `created_at` DESC (newest first) | `GET` | `{{baseUrl}}/api/v1/courses?sortColumn=created_at&sortDirection=DESC` |
| 48 | Sort by `created_at` ASC (oldest first) | `GET` | `{{baseUrl}}/api/v1/courses?sortColumn=created_at&sortDirection=ASC` |
| 49 | Sort by `published_at` DESC (recently published) | `GET` | `{{baseUrl}}/api/v1/courses?sortColumn=published_at&sortDirection=DESC` |
| 50 | Sort by `published_at` ASC | `GET` | `{{baseUrl}}/api/v1/courses?sortColumn=published_at&sortDirection=ASC` |
| 51 | Sort by `updated_at` DESC (recently updated) | `GET` | `{{baseUrl}}/api/v1/courses?sortColumn=updated_at&sortDirection=DESC` |
| 52 | Sort by `updated_at` ASC | `GET` | `{{baseUrl}}/api/v1/courses?sortColumn=updated_at&sortDirection=ASC` |
| 53 | Combo — active beginner courses, sorted by price | `GET` | `{{baseUrl}}/api/v1/courses?pageIndex=1&pageSize=50&isActive=true&difficultyLevel=beginner&sortColumn=price&sortDirection=ASC` |
| 54 | Combo — search "web" in active, published courses | `GET` | `{{baseUrl}}/api/v1/courses?pageIndex=1&pageSize=20&searchTerm=web&isActive=true&courseStatus=published` |
| 55 | Combo — free, published, highest rated first | `GET` | `{{baseUrl}}/api/v1/courses?isFree=true&courseStatus=published&sortColumn=rating_average&sortDirection=DESC` |
| 56 | Combo — paid bootcamp courses, most enrollments | `GET` | `{{baseUrl}}/api/v1/courses?isFree=false&difficultyLevel=bootcamp&sortColumn=enrollment_count&sortDirection=DESC` |
| 57 | Combo — INR currency, advanced level, newest first | `GET` | `{{baseUrl}}/api/v1/courses?currency=INR&difficultyLevel=advanced&sortColumn=created_at&sortDirection=DESC` |
| 58 | Combo — deleted courses, sorted by updated date | `GET` | `{{baseUrl}}/api/v1/courses?isDeleted=true&sortColumn=updated_at&sortDirection=DESC` |
| 59 | Combo — search, filter, sort, paginate | `GET` | `{{baseUrl}}/api/v1/courses?pageIndex=1&pageSize=10&searchTerm=development&isActive=true&courseStatus=published&isFree=false&sortColumn=enrollment_count&sortDirection=DESC` |

---

## 1.2 `GET /api/v1/courses/:id`

Get one course by ID, including all translations.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/courses/:id` |
| Permission | `course.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

Full course object with all translations.

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 1,
    "instructorId": 5,
    "courseLanguageId": 1,
    "isInstructorCourse": true,
    "code": "WEB101",
    "slug": "web-development-bootcamp",
    "difficultyLevel": "bootcamp",
    "courseStatus": "published",
    "durationHours": 120,
    "price": 9999,
    "originalPrice": 14999,
    "discountPercentage": 33.33,
    "currency": "INR",
    "isFree": false,
    "trailerVideoUrl": "https://cdn.example.com/trailers/web101.mp4",
    "trailerThumbnailUrl": "https://cdn.example.com/thumbnails/web101-trailer.webp",
    "videoUrl": "https://cdn.example.com/videos/web101-full.mp4",
    "brochureUrl": "https://cdn.example.com/brochures/web101.pdf",
    "isNew": true,
    "newUntil": "2026-05-12T00:00:00.000Z",
    "isFeatured": true,
    "isBestseller": true,
    "hasPlacementAssistance": true,
    "hasCertificate": true,
    "maxStudents": 500,
    "refundDays": 30,
    "isActive": true,
    "isDeleted": false,
    "publishedAt": "2026-04-01T00:00:00.000Z",
    "contentUpdatedAt": "2026-04-11T10:30:00.000Z",
    "createdBy": 5,
    "updatedBy": 5,
    "createdAt": "2026-03-15T08:00:00.000Z",
    "updatedAt": "2026-04-11T10:30:00.000Z",
    "translations": [
      {
        "id": 1,
        "languageId": 1,
        "languageName": "English",
        "title": "Web Development Bootcamp",
        "shortIntro": "Master full-stack web development",
        "longIntro": "A comprehensive bootcamp covering HTML, CSS, JavaScript, React, Node.js, and more.",
        "tagline": "From zero to job-ready web developer",
        "webThumbnail": "https://cdn.example.com/course/web101-web-thumb.webp",
        "webBanner": "https://cdn.example.com/course/web101-web-banner.webp",
        "appThumbnail": "https://cdn.example.com/course/web101-app-thumb.webp",
        "appBanner": "https://cdn.example.com/course/web101-app-banner.webp",
        "videoTitle": "Welcome to Web Dev Bootcamp",
        "videoDescription": "An overview of what you'll learn in this comprehensive course",
        "videoThumbnail": "https://cdn.example.com/course/web101-video-thumb.webp",
        "videoDurationMinutes": 8,
        "tags": ["web", "development", "bootcamp", "javascript", "react"],
        "isNewTitle": true,
        "prerequisites": ["basic html", "browser basics"],
        "skillsGain": ["HTML5", "CSS3", "JavaScript ES6+", "React", "Node.js", "MongoDB"],
        "whatYouWillLearn": ["Build responsive websites", "Master front-end frameworks", "Backend development", "Database design"],
        "courseIncludes": ["48 video lessons", "24 coding projects", "Lifetime access", "Certificate of completion"],
        "courseIsFor": ["Career changers", "Developers wanting full-stack skills", "Freelancers"],
        "applyForDesignations": ["Full Stack Developer", "Web Developer"],
        "demandInCountries": ["India", "USA", "Canada", "UK"],
        "salaryStandard": ["₹25L - ₹40L (India)", "$80K - $120K (USA)"],
        "futureCourses": ["Advanced React Patterns", "System Design for Web Scale"],
        "metaTitle": "Web Development Bootcamp | Learn Full-Stack Development",
        "metaDescription": "Master full-stack web development with HTML, CSS, JavaScript, React, and Node.js.",
        "metaKeywords": "web development, bootcamp, javascript, react, node.js, full-stack",
        "canonicalUrl": "https://growupmore.com/courses/web-development-bootcamp",
        "ogSiteName": "GrowUpMore",
        "ogTitle": "Web Development Bootcamp",
        "ogDescription": "Learn full-stack web development from scratch",
        "ogType": "educational_content",
        "ogImage": "https://cdn.example.com/og/web101.webp",
        "ogUrl": "https://growupmore.com/courses/web-development-bootcamp",
        "twitterSite": "@growupmore",
        "twitterTitle": "Web Development Bootcamp",
        "twitterDescription": "Master web development in 120 hours",
        "twitterImage": "https://cdn.example.com/twitter/web101.webp",
        "twitterCard": "summary_large_image",
        "robotsDirective": "index, follow",
        "focusKeyword": "web development bootcamp",
        "structuredData": {
          "courseType": "online",
          "duration": "PT120H",
          "provider": "GrowUpMore"
        },
        "isActive": true,
        "isDeleted": false,
        "createdBy": 5,
        "updatedBy": 5,
        "createdAt": "2026-03-15T08:00:00.000Z",
        "updatedAt": "2026-04-11T10:30:00.000Z"
      }
    ]
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course.read",
  "code": "FORBIDDEN"
}
```

---

## 1.3 `POST /api/v1/courses`

Create a new course. The `code` and `slug` must be unique. Optionally embed a translation at creation.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/courses` |
| Permission | `course.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `instructorId` | int | no | Instructor ID (links to users table). |
| `courseLanguageId` | int | no | Primary course language ID. |
| `isInstructorCourse` | bool | no | Defaults to `true`. |
| `code` | string | no | Unique course code (1–100 chars). Case-insensitive. |
| `slug` | string | no | URL-friendly slug (1–100 chars). Case-insensitive. |
| `difficultyLevel` | enum | no | `absolute beginner`, `beginner`, `intermediate`, `advanced`, `expert`, `bootcamp`, `mega`. |
| `courseStatus` | enum | no | `draft`, `under_review`, `published`, `archived`, `suspended`. |
| `durationHours` | number | no | Total course duration in hours. |
| `price` | number | no | Course price (in cents or base units). |
| `originalPrice` | number | no | Original price before discount. |
| `discountPercentage` | number | no | Discount percentage (0-100). |
| `currency` | enum | no | `INR`, `USD`, `EUR`, `GBP`, `AUD`, `CAD`, `SGD`, `AED`, `other`. |
| `isFree` | bool | no | Defaults to `false`. |
| `trailerVideoUrl` | string | no | Trailer video URL (max 2000 chars). |
| `trailerThumbnailUrl` | string | no | Trailer thumbnail URL (max 2000 chars). |
| `videoUrl` | string | no | Full course video URL (max 2000 chars). |
| `brochureUrl` | string | no | Course brochure PDF URL (max 2000 chars). |
| `isNew` | bool | no | Mark as new course. |
| `newUntil` | timestamp | no | Date until which course is marked as new. |
| `isFeatured` | bool | no | Mark as featured. |
| `isBestseller` | bool | no | Mark as bestseller. |
| `hasPlacementAssistance` | bool | no | Defaults to `false`. |
| `hasCertificate` | bool | no | Defaults to `false`. |
| `maxStudents` | int | no | Maximum enrollment capacity. |
| `refundDays` | int | no | Number of days for refund eligibility. |
| `isActive` | bool | no | Defaults to `true`. |
| `publishedAt` | timestamp | no | Publication timestamp. |
| `contentUpdatedAt` | timestamp | no | Last content update timestamp. |
| `translation` | object | no | Optional embedded translation (see table below). |

**Translation sub-object** (optional, all fields optional except noted):

| Field | Type | Required | Notes |
|---|---|---|---|
| `languageId` | int | yes (if translation provided) | Language ID. |
| `title` | string | yes (if translation provided) | Translation title (1–255 chars). |
| `shortIntro` | string | no | Short introduction (max 5000 chars). |
| `longIntro` | string | no | Long introduction (max 5000 chars). |
| `tagline` | string | no | Course tagline (max 500 chars). |
| `webThumbnail` | string | no | Web thumbnail URL (max 2000 chars). |
| `webBanner` | string | no | Web banner URL (max 2000 chars). |
| `appThumbnail` | string | no | App thumbnail URL (max 2000 chars). |
| `appBanner` | string | no | App banner URL (max 2000 chars). |
| `videoTitle` | string | no | Video title (max 500 chars). |
| `videoDescription` | string | no | Video description (max 500 chars). |
| `videoThumbnail` | string | no | Video thumbnail URL (max 2000 chars). |
| `videoDurationMinutes` | number | no | Video duration in minutes. |
| `tags` | array/object | no | JSONB tags. |
| `isNewTitle` | bool | no | Mark title as new. |
| `prerequisites` | array/object | no | JSONB prerequisites. |
| `skillsGain` | array/object | no | JSONB skills gained. |
| `whatYouWillLearn` | array/object | no | JSONB learning outcomes. |
| `courseIncludes` | array/object | no | JSONB course inclusions. |
| `courseIsFor` | array/object | no | JSONB target audience. |
| `applyForDesignations` | array/object | no | JSONB career designations. |
| `demandInCountries` | array/object | no | JSONB countries with demand. |
| `salaryStandard` | array/object | no | JSONB salary information. |
| `futureCourses` | array/object | no | JSONB recommended future courses. |
| `metaTitle` | string | no | SEO meta title (max 255 chars). |
| `metaDescription` | string | no | SEO meta description (max 500 chars). |
| `metaKeywords` | string | no | SEO keywords (max 500 chars). |
| `canonicalUrl` | string | no | Canonical URL (max 2000 chars). |
| `ogSiteName` | string | no | OG site name (max 500 chars). |
| `ogTitle` | string | no | OG title (max 255 chars). |
| `ogDescription` | string | no | OG description (max 500 chars). |
| `ogType` | string | no | OG type (max 100 chars). |
| `ogImage` | string | no | OG image URL (max 2000 chars). |
| `ogUrl` | string | no | OG URL (max 2000 chars). |
| `twitterSite` | string | no | Twitter site handle (max 100 chars). |
| `twitterTitle` | string | no | Twitter title (max 255 chars). |
| `twitterDescription` | string | no | Twitter description (max 500 chars). |
| `twitterImage` | string | no | Twitter image URL (max 2000 chars). |
| `twitterCard` | string | no | Twitter card type (max 50 chars). |
| `robotsDirective` | string | no | Robots meta directive (max 500 chars). |
| `focusKeyword` | string | no | SEO focus keyword (max 255 chars). |
| `structuredData` | object | no | JSONB structured data. |

### Sample request

```json
{
  "instructorId": 5,
  "courseLanguageId": 1,
  "isInstructorCourse": true,
  "code": "WEB101",
  "slug": "web-development-bootcamp",
  "difficultyLevel": "bootcamp",
  "courseStatus": "published",
  "durationHours": 120,
  "price": 9999,
  "originalPrice": 14999,
  "discountPercentage": 33.33,
  "currency": "INR",
  "isFree": false,
  "isNew": true,
  "isFeatured": true,
  "isBestseller": true,
  "hasPlacementAssistance": true,
  "hasCertificate": true,
  "maxStudents": 500,
  "refundDays": 30,
  "isActive": true,
  "publishedAt": "2026-04-01T00:00:00.000Z",
  "translation": {
    "languageId": 1,
    "title": "Web Development Bootcamp",
    "shortIntro": "Master full-stack web development",
    "longIntro": "A comprehensive bootcamp covering HTML, CSS, JavaScript, React, Node.js, and more.",
    "tagline": "From zero to job-ready web developer",
    "videoTitle": "Welcome to Web Dev Bootcamp",
    "metaTitle": "Web Development Bootcamp | Learn Full-Stack Development",
    "metaDescription": "Master full-stack web development with HTML, CSS, JavaScript, React, and Node.js.",
    "tags": ["web", "development", "bootcamp", "javascript", "react"],
    "skillsGain": ["HTML5", "CSS3", "JavaScript ES6+", "React", "Node.js", "MongoDB"]
  }
}
```

### Responses

#### 201 Created — happy path

```json
{
  "success": true,
  "message": "Course created",
  "data": {
    "id": 1,
    "instructorId": 5,
    "courseLanguageId": 1,
    "isInstructorCourse": true,
    "code": "WEB101",
    "slug": "web-development-bootcamp",
    "difficultyLevel": "bootcamp",
    "courseStatus": "published",
    "durationHours": 120,
    "price": 9999,
    "originalPrice": 14999,
    "discountPercentage": 33.33,
    "currency": "INR",
    "isFree": false,
    "trailerVideoUrl": null,
    "trailerThumbnailUrl": null,
    "videoUrl": null,
    "brochureUrl": null,
    "isNew": true,
    "newUntil": "2026-05-12T00:00:00.000Z",
    "isFeatured": true,
    "isBestseller": true,
    "hasPlacementAssistance": true,
    "hasCertificate": true,
    "maxStudents": 500,
    "refundDays": 30,
    "isActive": true,
    "isDeleted": false,
    "publishedAt": "2026-04-01T00:00:00.000Z",
    "contentUpdatedAt": null,
    "createdBy": 5,
    "updatedBy": 5,
    "createdAt": "2026-04-12T09:15:00.000Z",
    "updatedAt": "2026-04-12T09:15:00.000Z",
    "translations": [
      {
        "id": 1,
        "languageId": 1,
        "languageName": "English",
        "title": "Web Development Bootcamp",
        "shortIntro": "Master full-stack web development",
        "longIntro": "A comprehensive bootcamp covering HTML, CSS, JavaScript, React, Node.js, and more.",
        "tagline": "From zero to job-ready web developer",
        "webThumbnail": null,
        "webBanner": null,
        "appThumbnail": null,
        "appBanner": null,
        "videoTitle": "Welcome to Web Dev Bootcamp",
        "videoDescription": null,
        "videoThumbnail": null,
        "videoDurationMinutes": null,
        "tags": ["web", "development", "bootcamp", "javascript", "react"],
        "isNewTitle": false,
        "prerequisites": null,
        "skillsGain": ["HTML5", "CSS3", "JavaScript ES6+", "React", "Node.js", "MongoDB"],
        "whatYouWillLearn": null,
        "courseIncludes": null,
        "courseIsFor": null,
        "applyForDesignations": null,
        "demandInCountries": null,
        "salaryStandard": null,
        "futureCourses": null,
        "metaTitle": null,
        "metaDescription": null,
        "metaKeywords": null,
        "canonicalUrl": null,
        "ogSiteName": null,
        "ogTitle": null,
        "ogDescription": null,
        "ogType": null,
        "ogImage": null,
        "ogUrl": null,
        "twitterSite": null,
        "twitterTitle": null,
        "twitterDescription": null,
        "twitterImage": null,
        "twitterCard": null,
        "robotsDirective": null,
        "focusKeyword": null,
        "structuredData": null,
        "isActive": true,
        "isDeleted": false,
        "createdBy": 5,
        "updatedBy": 5,
        "createdAt": "2026-04-12T09:15:00.000Z",
        "updatedAt": "2026-04-12T09:15:00.000Z"
      }
    ]
  }
}
```

#### 400 Bad Request — validation error

```json
{
  "success": false,
  "message": "code is too short",
  "code": "VALIDATION_ERROR"
}
```

#### 409 Conflict — duplicate code or slug

```json
{
  "success": false,
  "message": "Course with code 'WEB101' already exists",
  "code": "CONFLICT"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course.create",
  "code": "FORBIDDEN"
}
```

---

## 1.4 `PATCH /api/v1/courses/:id`

Update a course. All fields are optional; only provided fields are updated.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/courses/:id` |
| Permission | `course.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

Same as [§1.3 POST /courses](#13-post-apiv1courses), but all fields optional (excluding `translation` which is not supported in PATCH).

### Sample request

```json
{
  "difficultyLevel": "advanced",
  "courseStatus": "archived",
  "price": 7999,
  "isFeatured": false
}
```

### Responses

#### 200 OK

Updated course object.

```json
{
  "success": true,
  "message": "Course updated",
  "data": {
    "id": 1,
    "instructorId": 5,
    "courseLanguageId": 1,
    "isInstructorCourse": true,
    "code": "WEB101",
    "slug": "web-development-bootcamp",
    "difficultyLevel": "advanced",
    "courseStatus": "archived",
    "durationHours": 120,
    "price": 7999,
    "originalPrice": 14999,
    "discountPercentage": 46.67,
    "currency": "INR",
    "isFree": false,
    "trailerVideoUrl": null,
    "trailerThumbnailUrl": null,
    "videoUrl": null,
    "brochureUrl": null,
    "isNew": true,
    "newUntil": "2026-05-12T00:00:00.000Z",
    "isFeatured": false,
    "isBestseller": true,
    "hasPlacementAssistance": true,
    "hasCertificate": true,
    "maxStudents": 500,
    "refundDays": 30,
    "isActive": true,
    "isDeleted": false,
    "publishedAt": "2026-04-01T00:00:00.000Z",
    "contentUpdatedAt": null,
    "createdBy": 5,
    "updatedBy": 5,
    "createdAt": "2026-04-12T09:15:00.000Z",
    "updatedAt": "2026-04-12T10:20:00.000Z",
    "translations": []
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course 999 not found",
  "code": "NOT_FOUND"
}
```

#### 409 Conflict — duplicate slug or code

```json
{
  "success": false,
  "message": "Course with code 'PYTHON101' already exists",
  "code": "CONFLICT"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course.update",
  "code": "FORBIDDEN"
}
```

---

## 1.5 `DELETE /api/v1/courses/:id`

Soft-delete a course. Only super-admins can delete.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/courses/:id` |
| Permission | `course.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Course deleted",
  "data": {
    "id": 1,
    "deleted": true
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course.delete",
  "code": "FORBIDDEN"
}
```

---

## 1.6 `POST /api/v1/courses/:id/restore`

Restore a soft-deleted course (admin+ only).

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/courses/:id/restore` |
| Permission | `course.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Course restored",
  "data": {
    "id": 1,
    "instructorId": 5,
    "courseLanguageId": 1,
    "isInstructorCourse": true,
    "code": "WEB101",
    "slug": "web-development-bootcamp",
    "difficultyLevel": "advanced",
    "courseStatus": "archived",
    "durationHours": 120,
    "price": 7999,
    "originalPrice": 14999,
    "discountPercentage": 46.67,
    "currency": "INR",
    "isFree": false,
    "trailerVideoUrl": null,
    "trailerThumbnailUrl": null,
    "videoUrl": null,
    "brochureUrl": null,
    "isNew": true,
    "newUntil": "2026-05-12T00:00:00.000Z",
    "isFeatured": false,
    "isBestseller": true,
    "hasPlacementAssistance": true,
    "hasCertificate": true,
    "maxStudents": 500,
    "refundDays": 30,
    "isActive": true,
    "isDeleted": false,
    "publishedAt": "2026-04-01T00:00:00.000Z",
    "contentUpdatedAt": null,
    "createdBy": 5,
    "updatedBy": 5,
    "createdAt": "2026-04-12T09:15:00.000Z",
    "updatedAt": "2026-04-12T10:20:00.000Z",
    "translations": []
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course.restore",
  "code": "FORBIDDEN"
}
```

---

## 1.7 `GET /api/v1/courses/:id/translations`

List all translations for a course.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/courses/:id/translations` |
| Permission | `course.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `searchTerm` | string | — | `ILIKE` across `title`, `short_intro`, `long_intro`, `tagline`. |
| `sortColumn` | enum | `id` | `id`, `title`, `created_at`, `updated_at`. |
| `sortDirection` | enum | `ASC` | `ASC` \| `DESC`. |
| `languageId` | int | — | Filter by language. |
| `isActive` | bool | — | Filter by active flag. |
| `isDeleted` | bool | — | Include/exclude soft-deleted translations. |

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": 1,
      "courseId": 1,
      "languageId": 1,
      "languageName": "English",
      "title": "Web Development Bootcamp",
      "shortIntro": "Master full-stack web development",
      "longIntro": "A comprehensive bootcamp covering HTML, CSS, JavaScript, React, Node.js, and more.",
      "tagline": "From zero to job-ready web developer",
      "webThumbnail": "https://cdn.example.com/course/web101-web-thumb.webp",
      "webBanner": "https://cdn.example.com/course/web101-web-banner.webp",
      "appThumbnail": "https://cdn.example.com/course/web101-app-thumb.webp",
      "appBanner": "https://cdn.example.com/course/web101-app-banner.webp",
      "videoTitle": "Welcome to Web Dev Bootcamp",
      "videoDescription": "An overview of what you'll learn in this comprehensive course",
      "videoThumbnail": "https://cdn.example.com/course/web101-video-thumb.webp",
      "videoDurationMinutes": 8,
      "tags": ["web", "development", "bootcamp", "javascript", "react"],
      "isNewTitle": true,
      "prerequisites": ["basic html", "browser basics"],
      "skillsGain": ["HTML5", "CSS3", "JavaScript ES6+", "React", "Node.js", "MongoDB"],
      "whatYouWillLearn": ["Build responsive websites", "Master front-end frameworks", "Backend development", "Database design"],
      "courseIncludes": ["48 video lessons", "24 coding projects", "Lifetime access", "Certificate of completion"],
      "courseIsFor": ["Career changers", "Developers wanting full-stack skills", "Freelancers"],
      "applyForDesignations": ["Full Stack Developer", "Web Developer"],
      "demandInCountries": ["India", "USA", "Canada", "UK"],
      "salaryStandard": ["₹25L - ₹40L (India)", "$80K - $120K (USA)"],
      "futureCourses": ["Advanced React Patterns", "System Design for Web Scale"],
      "metaTitle": "Web Development Bootcamp | Learn Full-Stack Development",
      "metaDescription": "Master full-stack web development with HTML, CSS, JavaScript, React, and Node.js.",
      "metaKeywords": "web development, bootcamp, javascript, react, node.js, full-stack",
      "canonicalUrl": "https://growupmore.com/courses/web-development-bootcamp",
      "ogSiteName": "GrowUpMore",
      "ogTitle": "Web Development Bootcamp",
      "ogDescription": "Learn full-stack web development from scratch",
      "ogType": "educational_content",
      "ogImage": "https://cdn.example.com/og/web101.webp",
      "ogUrl": "https://growupmore.com/courses/web-development-bootcamp",
      "twitterSite": "@growupmore",
      "twitterTitle": "Web Development Bootcamp",
      "twitterDescription": "Master web development in 120 hours",
      "twitterImage": "https://cdn.example.com/twitter/web101.webp",
      "twitterCard": "summary_large_image",
      "robotsDirective": "index, follow",
      "focusKeyword": "web development bootcamp",
      "structuredData": {
        "courseType": "online",
        "duration": "PT120H",
        "provider": "GrowUpMore"
      },
      "isActive": true,
      "isDeleted": false,
      "createdBy": 5,
      "updatedBy": 5,
      "createdAt": "2026-04-12T09:15:00.000Z",
      "updatedAt": "2026-04-12T09:15:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 1, "totalPages": 1 }
}
```

#### 404 Not Found — course not found

```json
{
  "success": false,
  "message": "Course 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 1.8 `GET /api/v1/courses/:id/translations/:tid`

Get one translation by ID.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/courses/:id/translations/:tid` |
| Permission | `course.read` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 1,
    "courseId": 1,
    "languageId": 1,
    "languageName": "English",
    "title": "Web Development Bootcamp",
    "shortIntro": "Master full-stack web development",
    "longIntro": "A comprehensive bootcamp covering HTML, CSS, JavaScript, React, Node.js, and more.",
    "tagline": "From zero to job-ready web developer",
    "webThumbnail": "https://cdn.example.com/course/web101-web-thumb.webp",
    "webBanner": "https://cdn.example.com/course/web101-web-banner.webp",
    "appThumbnail": "https://cdn.example.com/course/web101-app-thumb.webp",
    "appBanner": "https://cdn.example.com/course/web101-app-banner.webp",
    "videoTitle": "Welcome to Web Dev Bootcamp",
    "videoDescription": "An overview of what you'll learn in this comprehensive course",
    "videoThumbnail": "https://cdn.example.com/course/web101-video-thumb.webp",
    "videoDurationMinutes": 8,
    "tags": ["web", "development", "bootcamp", "javascript", "react"],
    "isNewTitle": true,
    "prerequisites": ["basic html", "browser basics"],
    "skillsGain": ["HTML5", "CSS3", "JavaScript ES6+", "React", "Node.js", "MongoDB"],
    "whatYouWillLearn": ["Build responsive websites", "Master front-end frameworks", "Backend development", "Database design"],
    "courseIncludes": ["48 video lessons", "24 coding projects", "Lifetime access", "Certificate of completion"],
    "courseIsFor": ["Career changers", "Developers wanting full-stack skills", "Freelancers"],
    "applyForDesignations": ["Full Stack Developer", "Web Developer"],
    "demandInCountries": ["India", "USA", "Canada", "UK"],
    "salaryStandard": ["₹25L - ₹40L (India)", "$80K - $120K (USA)"],
    "futureCourses": ["Advanced React Patterns", "System Design for Web Scale"],
    "metaTitle": "Web Development Bootcamp | Learn Full-Stack Development",
    "metaDescription": "Master full-stack web development with HTML, CSS, JavaScript, React, and Node.js.",
    "metaKeywords": "web development, bootcamp, javascript, react, node.js, full-stack",
    "canonicalUrl": "https://growupmore.com/courses/web-development-bootcamp",
    "ogSiteName": "GrowUpMore",
    "ogTitle": "Web Development Bootcamp",
    "ogDescription": "Learn full-stack web development from scratch",
    "ogType": "educational_content",
    "ogImage": "https://cdn.example.com/og/web101.webp",
    "ogUrl": "https://growupmore.com/courses/web-development-bootcamp",
    "twitterSite": "@growupmore",
    "twitterTitle": "Web Development Bootcamp",
    "twitterDescription": "Master web development in 120 hours",
    "twitterImage": "https://cdn.example.com/twitter/web101.webp",
    "twitterCard": "summary_large_image",
    "robotsDirective": "index, follow",
    "focusKeyword": "web development bootcamp",
    "structuredData": {
      "courseType": "online",
      "duration": "PT120H",
      "provider": "GrowUpMore"
    },
    "isActive": true,
    "isDeleted": false,
    "createdBy": 5,
    "updatedBy": 5,
    "createdAt": "2026-04-12T09:15:00.000Z",
    "updatedAt": "2026-04-12T09:15:00.000Z"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course translation 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 1.9 `POST /api/v1/courses/:id/translations`

Create a new translation for a course.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/courses/:id/translations` |
| Permission | `course.create` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

See **Translation sub-object** table in [§1.3](#13-post-apiv1courses).

### Sample request

```json
{
  "languageId": 2,
  "title": "वेब डेवलपमेंट बूटकैम्प",
  "shortIntro": "संपूर्ण स्टैक वेब विकास में महारत हासिल करें",
  "longIntro": "HTML, CSS, JavaScript, React, Node.js और अधिक को कवर करने वाला एक व्यापक बूटकैम्प।",
  "tagline": "शून्य से नौकरी के लिए तैयार वेब डेवलपर",
  "videoTitle": "वेब डेव बूटकैम्प में आपका स्वागत है",
  "metaTitle": "वेब डेवलपमेंट बूटकैम्प | संपूर्ण स्टैक विकास सीखें",
  "metaDescription": "HTML, CSS, JavaScript, React, और Node.js के साथ संपूर्ण स्टैक वेब विकास में महारत हासिल करें।"
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Course translation created",
  "data": {
    "id": 2,
    "courseId": 1,
    "languageId": 2,
    "languageName": "Hindi",
    "title": "वेब डेवलपमेंट बूटकैम्प",
    "shortIntro": "संपूर्ण स्टैक वेब विकास में महारत हासिल करें",
    "longIntro": "HTML, CSS, JavaScript, React, Node.js और अधिक को कवर करने वाला एक व्यापक बूटकैम्प।",
    "tagline": "शून्य से नौकरी के लिए तैयार वेब डेवलपर",
    "webThumbnail": null,
    "webBanner": null,
    "appThumbnail": null,
    "appBanner": null,
    "videoTitle": "वेब डेव बूटकैम्प में आपका स्वागत है",
    "videoDescription": null,
    "videoThumbnail": null,
    "videoDurationMinutes": null,
    "tags": null,
    "isNewTitle": false,
    "prerequisites": null,
    "skillsGain": null,
    "whatYouWillLearn": null,
    "courseIncludes": null,
    "courseIsFor": null,
    "applyForDesignations": null,
    "demandInCountries": null,
    "salaryStandard": null,
    "futureCourses": null,
    "metaTitle": "वेब डेवलपमेंट बूटकैम्प | संपूर्ण स्टैक विकास सीखें",
    "metaDescription": "HTML, CSS, JavaScript, React, और Node.js के साथ संपूर्ण स्टैक वेब विकास में महारत हासिल करें।",
    "metaKeywords": null,
    "canonicalUrl": null,
    "ogSiteName": null,
    "ogTitle": null,
    "ogDescription": null,
    "ogType": null,
    "ogImage": null,
    "ogUrl": null,
    "twitterSite": null,
    "twitterTitle": null,
    "twitterDescription": null,
    "twitterImage": null,
    "twitterCard": null,
    "robotsDirective": null,
    "focusKeyword": null,
    "structuredData": null,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 5,
    "updatedBy": 5,
    "createdAt": "2026-04-12T10:30:00.000Z",
    "updatedAt": "2026-04-12T10:30:00.000Z"
  }
}
```

#### 400 Bad Request

```json
{
  "success": false,
  "message": "translation title is too short",
  "code": "VALIDATION_ERROR"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course 999 not found",
  "code": "NOT_FOUND"
}
```

---

## 1.10 `PATCH /api/v1/courses/:id/translations/:tid`

Update a course translation. All fields optional.

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/courses/:id/translations/:tid` |
| Permission | `course.update` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |
| `Content-Type` | `application/json` |

**Request body**

Same as [§1.9 POST /translations](#19-post-apiv1coursesidtranslations), but all fields optional.

### Sample request

```json
{
  "title": "वेब डेवलपमेंट बूटकैम्प (उन्नत)",
  "shortIntro": "संपूर्ण स्टैक और DevOps में महारत हासिल करें",
  "metaDescription": "DevOps के साथ HTML, CSS, JavaScript, React, और Node.js सीखें।"
}
```

### Responses

#### 200 OK

Updated translation object.

```json
{
  "success": true,
  "message": "Course translation updated",
  "data": {
    "id": 2,
    "courseId": 1,
    "languageId": 2,
    "languageName": "Hindi",
    "title": "वेब डेवलपमेंट बूटकैम्प (उन्नत)",
    "shortIntro": "संपूर्ण स्टैक और DevOps में महारत हासिल करें",
    "longIntro": "HTML, CSS, JavaScript, React, Node.js और अधिक को कवर करने वाला एक व्यापक बूटकैम्प।",
    "tagline": "शून्य से नौकरी के लिए तैयार वेब डेवलपर",
    "webThumbnail": null,
    "webBanner": null,
    "appThumbnail": null,
    "appBanner": null,
    "videoTitle": "वेब डेव बूटकैम्प में आपका स्वागत है",
    "videoDescription": null,
    "videoThumbnail": null,
    "videoDurationMinutes": null,
    "tags": null,
    "isNewTitle": false,
    "prerequisites": null,
    "skillsGain": null,
    "whatYouWillLearn": null,
    "courseIncludes": null,
    "courseIsFor": null,
    "applyForDesignations": null,
    "demandInCountries": null,
    "salaryStandard": null,
    "futureCourses": null,
    "metaTitle": "वेब डेवलपमेंट बूटकैम्प | संपूर्ण स्टैक विकास सीखें",
    "metaDescription": "DevOps के साथ HTML, CSS, JavaScript, React, और Node.js सीखें।",
    "metaKeywords": null,
    "canonicalUrl": null,
    "ogSiteName": null,
    "ogTitle": null,
    "ogDescription": null,
    "ogType": null,
    "ogImage": null,
    "ogUrl": null,
    "twitterSite": null,
    "twitterTitle": null,
    "twitterDescription": null,
    "twitterImage": null,
    "twitterCard": null,
    "robotsDirective": null,
    "focusKeyword": null,
    "structuredData": null,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 5,
    "updatedBy": 5,
    "createdAt": "2026-04-12T10:30:00.000Z",
    "updatedAt": "2026-04-12T11:15:00.000Z"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course.update",
  "code": "FORBIDDEN"
}
```

---

## 1.11 `DELETE /api/v1/courses/:id/translations/:tid`

Soft-delete a course translation.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/courses/:id/translations/:tid` |
| Permission | `course.delete` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Course translation deleted",
  "data": {
    "id": 2,
    "deleted": true
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course.delete",
  "code": "FORBIDDEN"
}
```

---

## 1.12 `POST /api/v1/courses/:id/translations/:tid/restore`

Restore a soft-deleted course translation (admin+ only).

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/courses/:id/translations/:tid/restore` |
| Permission | `course.restore` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Course translation restored",
  "data": {
    "id": 2,
    "courseId": 1,
    "languageId": 2,
    "languageName": "Hindi",
    "title": "वेब डेवलपमेंट बूटकैम्प (उन्नत)",
    "shortIntro": "संपूर्ण स्टैक और DevOps में महारत हासिल करें",
    "longIntro": "HTML, CSS, JavaScript, React, Node.js और अधिक को कवर करने वाला एक व्यापक बूटकैम्प।",
    "tagline": "शून्य से नौकरी के लिए तैयार वेब डेवलपर",
    "webThumbnail": null,
    "webBanner": null,
    "appThumbnail": null,
    "appBanner": null,
    "videoTitle": "वेब डेव बूटकैम्प में आपका स्वागत है",
    "videoDescription": null,
    "videoThumbnail": null,
    "videoDurationMinutes": null,
    "tags": null,
    "isNewTitle": false,
    "prerequisites": null,
    "skillsGain": null,
    "whatYouWillLearn": null,
    "courseIncludes": null,
    "courseIsFor": null,
    "applyForDesignations": null,
    "demandInCountries": null,
    "salaryStandard": null,
    "futureCourses": null,
    "metaTitle": "वेब डेवलपमेंट बूटकैम्प | संपूर्ण स्टैक विकास सीखें",
    "metaDescription": "DevOps के साथ HTML, CSS, JavaScript, React, और Node.js सीखें।",
    "metaKeywords": null,
    "canonicalUrl": null,
    "ogSiteName": null,
    "ogTitle": null,
    "ogDescription": null,
    "ogType": null,
    "ogImage": null,
    "ogUrl": null,
    "twitterSite": null,
    "twitterTitle": null,
    "twitterDescription": null,
    "twitterImage": null,
    "twitterCard": null,
    "robotsDirective": null,
    "focusKeyword": null,
    "structuredData": null,
    "isActive": true,
    "isDeleted": false,
    "createdBy": 5,
    "updatedBy": 5,
    "createdAt": "2026-04-12T10:30:00.000Z",
    "updatedAt": "2026-04-12T11:15:00.000Z"
  }
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Course translation 999 not found",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden

```json
{
  "success": false,
  "message": "Missing required permission: course.restore",
  "code": "FORBIDDEN"
}
```
