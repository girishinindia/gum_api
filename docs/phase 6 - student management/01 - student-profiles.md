# Phase 6 — Student Profiles

A student profile is the 1:1 detail record for a `users` row (when that user is a student). It stores learning data (enrollment type, enrollment number, enrollment date), learning preferences (preferred learning mode, content type, difficulty), subscription and payment info (subscription plan, total amount paid, active subscription flag), course progress (courses enrolled, completed, average score, current streak), engagement metrics (daily learning hours, XP points, level, total learning hours), and relational data (education level, learning goal, specialization, preferred learning language).

This resource enforces role-based access patterns: **super-admins** and **admins** have full CRUD read and update; **students** can read/update their own profile via `/me` endpoints; **students** cannot access other profiles (403). The `/me` endpoint pattern from Phase 4 is used here since students self-serve their own data. Hard-delete only (no soft-delete).

All routes require auth. Permission codes: `student_profile.create`, `student_profile.read`, `student_profile.update`, `student_profile.delete`, `student_profile.read.own`, `student_profile.update.own`.

- Super-admin: all 6 permissions.
- Admin: `create`, `read`, `update`, `read.own`, `update.own` (no `delete`).
- Student: `read.own`, `update.own` (no admin-wide read, create, update, or delete).
- Instructor: none (endpoint returns 403 for this role).
- Employee: none (endpoint returns 403 for this role).

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](00%20-%20overview.md#8-postman-environment).

← [00 overview](00%20-%20overview.md) · **Next →** [02 walkthrough and index](02%20-%20walkthrough%20and%20index.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1student-profiles) | `GET` | `{{baseUrl}}/api/v1/student-profiles` | `student_profile.read` | List all profiles (admin+ only). |
| [§1.2](#12-get-apiv1student-profilesid) | `GET` | `{{baseUrl}}/api/v1/student-profiles/:id` | `student_profile.read` *or* `student_profile.read.own` (+ self match) | Get one profile by ID. |
| [§1.3](#13-post-apiv1student-profiles) | `POST` | `{{baseUrl}}/api/v1/student-profiles` | `student_profile.create` | Admin create — full body. |
| [§1.4](#14-patch-apiv1student-profilesid) | `PATCH` | `{{baseUrl}}/api/v1/student-profiles/:id` | `student_profile.update` *or* `student_profile.update.own` (+ self match) | Update one profile by ID. |
| [§1.5](#15-delete-apiv1student-profilesid) | `DELETE` | `{{baseUrl}}/api/v1/student-profiles/:id` | `student_profile.delete` + super-admin role | Hard-delete one profile (SA only). |
| [§1.6](#16-get-apiv1student-profilesme) | `GET` | `{{baseUrl}}/api/v1/student-profiles/me` | `student_profile.read.own` | Get own student profile. |
| [§1.7](#17-patch-apiv1student-profilesme) | `PATCH` | `{{baseUrl}}/api/v1/student-profiles/me` | `student_profile.update.own` | Update own student profile (subscription + payment fields restricted to admins). |

> `/me` endpoints must be declared before `/:id` in the router so Express does not treat `me` as an id segment.

---

## 1.1 `GET /api/v1/student-profiles`

List student profiles. Backed by `udf_get_student_profiles`, which joins `student_profiles` → `uv_users` → `education_levels`, `learning_goals`, `specializations`, `preferred_learning_languages`. Supports full pagination, multi-table sorting, filtering by 18+ fields, and full-text search.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/student-profiles` |
| Permission | `student_profile.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `searchTerm` | string | — | `ILIKE` across enrollment number, first name, last name, email, education level name, specialization name. |
| `sortTable` | enum | `stu` | `stu` \| `education_level` \| `specialization` \| `user`. Determines which table's column sorting applies. |
| `sortColumn` | enum | `id` | See [sort columns per table](#sort-columns-per-table) below. |
| `sortDirection` | enum | `ASC` | `ASC` \| `DESC`. |
| `filterEnrollmentType` | enum | — | `self`, `corporate`, `scholarship`, `referral`, `trial`, `other`. |
| `filterPreferredLearningMode` | enum | — | `self_paced`, `instructor_led`, `hybrid`, `cohort_based`, `mentored`. |
| `filterPreferredContentType` | enum | — | `video`, `text`, `interactive`, `audio`, `mixed`. |
| `filterDifficultyPreference` | enum | — | `beginner`, `intermediate`, `advanced`, `mixed`. |
| `filterSubscriptionPlan` | enum | — | `free`, `basic`, `standard`, `premium`, `enterprise`, `lifetime`. |
| `filterHasActiveSubscription` | bool | — | Filter by `hasActiveSubscription` flag. |
| `filterIsCurrentlyStudying` | bool | — | Filter by `isCurrentlyStudying` flag. |
| `filterIsSeekingJob` | bool | — | Filter by `isSeekingJob` flag. |
| `filterIsOpenToInternship` | bool | — | Filter by `isOpenToInternship` flag. |
| `filterIsOpenToFreelance` | bool | — | Filter by `isOpenToFreelance` flag. |
| `filterIsActive` | bool | — | Filter by student activity status (inherited from parent user). |
| `filterIsDeleted` | bool | — | Include/exclude hard-deleted profiles. |
| `filterEducationLevelId` | int | — | Filter by education level. |
| `filterLearningGoalId` | int | — | Filter by learning goal. |
| `filterSpecializationId` | int | — | Filter by specialization. |
| `filterPreferredLearningLanguageId` | int | — | Filter by preferred learning language. |
| `filterUserRole` | string | — | Filter by parent user's role code, e.g. `student`. |
| `filterUserIsActive` | bool | — | Filter by inherited user active flag. |

### Sort columns per table

- **`stu`** (student_profiles): `id`, `enrollment_number`, `enrollment_date`, `enrollment_type`, `daily_learning_hours`, `courses_enrolled`, `courses_completed`, `average_score`, `current_streak_days`, `xp_points`, `level`, `total_learning_hours`, `total_amount_paid`, `is_active`, `created_at`, `updated_at`.
- **`education_level`**: `name`, `category`, `order`.
- **`specialization`**: `name`, `category`.
- **`user`**: `first_name`, `last_name`, `email`, `role`.

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
      "userId": 3,
      "enrollmentNumber": "STU001",
      "enrollmentDate": "2023-06-15",
      "enrollmentType": "self",
      "educationLevelId": 2,
      "educationLevelName": "Bachelor's Degree",
      "educationLevelCategory": "higher_education",
      "learningGoalId": 1,
      "learningGoalName": "Career Advancement",
      "specializationId": 1,
      "specializationName": "Full Stack Development",
      "specializationCategory": "technology",
      "preferredLearningLanguageId": 1,
      "preferredLearningLanguageName": "English",
      "preferredLearningMode": "self_paced",
      "preferredContentType": "video",
      "difficultyPreference": "intermediate",
      "dailyLearningHours": 2,
      "coursesEnrolled": 8,
      "coursesCompleted": 5,
      "averageScore": 82.5,
      "currentStreakDays": 12,
      "xpPoints": 4500,
      "level": 5,
      "totalLearningHours": 120,
      "subscriptionPlan": "premium",
      "hasActiveSubscription": true,
      "totalAmountPaid": 9999.00,
      "isCurrentlyStudying": true,
      "isSeekingJob": true,
      "isOpenToInternship": true,
      "isOpenToFreelance": false,
      "isActive": true,
      "createdBy": 1,
      "updatedBy": 1,
      "createdAt": "2023-06-15T10:30:00.000Z",
      "updatedAt": "2026-04-11T14:22:00.000Z",
      "isDeleted": false,
      "userIsActive": true,
      "user": {
        "firstName": "Jane",
        "lastName": "Smith",
        "email": "jane.smith@example.com",
        "mobile": "+91-9876543211",
        "roleId": 3,
        "roleName": "Student",
        "isActive": true,
        "isDeleted": false,
        "isEmailVerified": true,
        "isMobileVerified": true
      }
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 342, "totalPages": 18 }
}
```

#### 403 Forbidden — caller lacks `student_profile.read`

```json
{
  "success": false,
  "message": "Missing required permission: student_profile.read",
  "code": "FORBIDDEN"
}
```

#### 403 Forbidden — student/instructor/employee role

```json
{
  "success": false,
  "message": "Only admins and super-admins may access all student profiles",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/student-profiles` — method, headers and auth stay the same as the base request above.

| Example name | Query string |
|---|---|
| Page 1 (defaults) | `?pageIndex=1&pageSize=20` |
| Page 2, default size | `?pageIndex=2&pageSize=20` |
| Page 1, small page (5 rows) | `?pageIndex=1&pageSize=5` |
| Page 1, large page (100 rows) | `?pageIndex=1&pageSize=100` |
| Out-of-range page (returns empty `data`) | `?pageIndex=9999&pageSize=20` |
| Search across enrollment/name/email | `?searchTerm=STU001` |
| Search student by name | `?searchTerm=jane` |
| Search + pagination | `?pageIndex=1&pageSize=50&searchTerm=smith` |
| Enrollment type — self | `?filterEnrollmentType=self` |
| Enrollment type — corporate | `?filterEnrollmentType=corporate` |
| Enrollment type — scholarship | `?filterEnrollmentType=scholarship` |
| Enrollment type — referral | `?filterEnrollmentType=referral` |
| Enrollment type — trial | `?filterEnrollmentType=trial` |
| Preferred learning mode — self_paced | `?filterPreferredLearningMode=self_paced` |
| Preferred learning mode — instructor_led | `?filterPreferredLearningMode=instructor_led` |
| Preferred learning mode — hybrid | `?filterPreferredLearningMode=hybrid` |
| Preferred learning mode — cohort_based | `?filterPreferredLearningMode=cohort_based` |
| Preferred learning mode — mentored | `?filterPreferredLearningMode=mentored` |
| Content type — video | `?filterPreferredContentType=video` |
| Content type — text | `?filterPreferredContentType=text` |
| Content type — interactive | `?filterPreferredContentType=interactive` |
| Content type — audio | `?filterPreferredContentType=audio` |
| Content type — mixed | `?filterPreferredContentType=mixed` |
| Difficulty — beginner | `?filterDifficultyPreference=beginner` |
| Difficulty — intermediate | `?filterDifficultyPreference=intermediate` |
| Difficulty — advanced | `?filterDifficultyPreference=advanced` |
| Difficulty — mixed | `?filterDifficultyPreference=mixed` |
| Subscription plan — free | `?filterSubscriptionPlan=free` |
| Subscription plan — basic | `?filterSubscriptionPlan=basic` |
| Subscription plan — standard | `?filterSubscriptionPlan=standard` |
| Subscription plan — premium | `?filterSubscriptionPlan=premium` |
| Subscription plan — enterprise | `?filterSubscriptionPlan=enterprise` |
| Subscription plan — lifetime | `?filterSubscriptionPlan=lifetime` |
| Has active subscription | `?filterHasActiveSubscription=true` |
| No active subscription | `?filterHasActiveSubscription=false` |
| Currently studying | `?filterIsCurrentlyStudying=true` |
| Not currently studying | `?filterIsCurrentlyStudying=false` |
| Seeking job | `?filterIsSeekingJob=true` |
| Not seeking job | `?filterIsSeekingJob=false` |
| Open to internship | `?filterIsOpenToInternship=true` |
| Not open to internship | `?filterIsOpenToInternship=false` |
| Open to freelance | `?filterIsOpenToFreelance=true` |
| Not open to freelance | `?filterIsOpenToFreelance=false` |
| Active students only | `?filterIsActive=true` |
| Inactive students only | `?filterIsActive=false` |
| Exclude hard-deleted | `?filterIsDeleted=false` |
| Include hard-deleted (admin audit) | `?filterIsDeleted=true` |
| Filter by education level | `?filterEducationLevelId=2` |
| Filter by learning goal | `?filterLearningGoalId=1` |
| Filter by specialization | `?filterSpecializationId=1` |
| Filter by preferred language | `?filterPreferredLearningLanguageId=1` |
| Filter by user role | `?filterUserRole=student` |
| Active user only | `?filterUserIsActive=true` |
| Sort by `id` ASC (default) | `?sortTable=stu&sortColumn=id&sortDirection=ASC` |
| Sort by `id` DESC | `?sortTable=stu&sortColumn=id&sortDirection=DESC` |
| Sort by enrollment number ASC | `?sortTable=stu&sortColumn=enrollment_number&sortDirection=ASC` |
| Sort by enrollment date DESC (newest first) | `?sortTable=stu&sortColumn=enrollment_date&sortDirection=DESC` |
| Sort by courses completed DESC | `?sortTable=stu&sortColumn=courses_completed&sortDirection=DESC` |
| Sort by average score DESC (highest first) | `?sortTable=stu&sortColumn=average_score&sortDirection=DESC` |
| Sort by XP points DESC (most engaged) | `?sortTable=stu&sortColumn=xp_points&sortDirection=DESC` |
| Sort by current streak DESC | `?sortTable=stu&sortColumn=current_streak_days&sortDirection=DESC` |
| Sort by level DESC | `?sortTable=stu&sortColumn=level&sortDirection=DESC` |
| Sort by daily learning hours DESC | `?sortTable=stu&sortColumn=daily_learning_hours&sortDirection=DESC` |
| Sort by total amount paid DESC (top payers) | `?sortTable=stu&sortColumn=total_amount_paid&sortDirection=DESC` |
| Sort by is_active DESC | `?sortTable=stu&sortColumn=is_active&sortDirection=DESC` |
| Sort by created_at DESC (newest first) | `?sortTable=stu&sortColumn=created_at&sortDirection=DESC` |
| Sort by education level name ASC | `?sortTable=education_level&sortColumn=name&sortDirection=ASC` |
| Sort by education level order ASC | `?sortTable=education_level&sortColumn=order&sortDirection=ASC` |
| Sort by specialization name ASC | `?sortTable=specialization&sortColumn=name&sortDirection=ASC` |
| Sort by specialization category ASC | `?sortTable=specialization&sortColumn=category&sortDirection=ASC` |
| Sort by user first_name ASC | `?sortTable=user&sortColumn=first_name&sortDirection=ASC` |
| Sort by user email ASC | `?sortTable=user&sortColumn=email&sortDirection=ASC` |
| Combo — self-paced, intermediate, sorted by score DESC | `?pageIndex=1&pageSize=20&filterPreferredLearningMode=self_paced&filterDifficultyPreference=intermediate&sortTable=stu&sortColumn=average_score&sortDirection=DESC` |
| Combo — premium plan, active subscription, sorted by XP DESC | `?pageIndex=1&pageSize=20&filterSubscriptionPlan=premium&filterHasActiveSubscription=true&sortTable=stu&sortColumn=xp_points&sortDirection=DESC` |
| Combo — seeking job, education level filter, sorted by streak | `?pageIndex=1&pageSize=50&filterIsSeekingJob=true&filterEducationLevelId=2&sortTable=stu&sortColumn=current_streak_days&sortDirection=DESC` |
| Combo — inactive + trial enrollment | `?pageIndex=1&pageSize=20&filterIsActive=false&filterEnrollmentType=trial` |
| Combo — specialization filter, search, sorted by name | `?pageIndex=1&pageSize=20&filterSpecializationId=1&searchTerm=developer&sortTable=user&sortColumn=first_name&sortDirection=ASC` |

---

## 1.2 `GET /api/v1/student-profiles/:id`

Get one profile by ID. Uses `authorizeSelfOr` — if the caller holds `student_profile.read` they pass unconditionally; otherwise the middleware resolves the owner of `:id` and allows the call only when the owner is the caller.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/student-profiles/:id` |
| Permission | `student_profile.read` *or* `student_profile.read.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

Full `StudentProfileDto` in `data`.

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 1,
    "userId": 3,
    "enrollmentNumber": "STU001",
    "enrollmentDate": "2023-06-15",
    "enrollmentType": "self",
    "educationLevelId": 2,
    "educationLevelName": "Bachelor's Degree",
    "educationLevelCategory": "higher_education",
    "learningGoalId": 1,
    "learningGoalName": "Career Advancement",
    "specializationId": 1,
    "specializationName": "Full Stack Development",
    "specializationCategory": "technology",
    "preferredLearningLanguageId": 1,
    "preferredLearningLanguageName": "English",
    "preferredLearningMode": "self_paced",
    "preferredContentType": "video",
    "difficultyPreference": "intermediate",
    "dailyLearningHours": 2,
    "coursesEnrolled": 8,
    "coursesCompleted": 5,
    "averageScore": 82.5,
    "currentStreakDays": 12,
    "xpPoints": 4500,
    "level": 5,
    "totalLearningHours": 120,
    "subscriptionPlan": "premium",
    "hasActiveSubscription": true,
    "totalAmountPaid": 9999.00,
    "isCurrentlyStudying": true,
    "isSeekingJob": true,
    "isOpenToInternship": true,
    "isOpenToFreelance": false,
    "isActive": true,
    "createdBy": 1,
    "updatedBy": 1,
    "createdAt": "2023-06-15T10:30:00.000Z",
    "updatedAt": "2026-04-11T14:22:00.000Z",
    "isDeleted": false,
    "userIsActive": true,
    "user": {
      "firstName": "Jane",
      "lastName": "Smith",
      "email": "jane.smith@example.com",
      "mobile": "+91-9876543211",
      "roleId": 3,
      "roleName": "Student",
      "isActive": true,
      "isDeleted": false,
      "isEmailVerified": true,
      "isMobileVerified": true
    }
  }
}
```

#### 403 Forbidden — own-scope caller, someone else's profile

```json
{
  "success": false,
  "message": "Forbidden: student_profile.read.own only grants access to your own record",
  "code": "FORBIDDEN"
}
```

#### 403 Forbidden — student/instructor/employee role attempting broader read

```json
{
  "success": false,
  "message": "Only admins and super-admins may access all student profiles",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Student profile 42 not found",
  "code": "NOT_FOUND"
}
```

---

## 1.3 `POST /api/v1/student-profiles`

Admin create — full field access. Requires `student_profile.create`, which is held by super-admin and admin. Parent user must exist and be active.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/student-profiles` |
| Permission | `student_profile.create` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Content-Type** — `application/json` or `multipart/form-data`.

### JSON (`application/json`)

**Required fields:**
- `userId` (int) — Must exist in `users` table.
- `enrollmentNumber` (string) — Unique identifier across all students.
- `enrollmentDate` (date, ISO 8601) — Enrollment date.

**Optional fields:**

```json
{
  "userId": 4,
  "enrollmentNumber": "STU042",
  "enrollmentDate": "2024-03-01",
  "enrollmentType": "corporate",
  "educationLevelId": 2,
  "learningGoalId": 2,
  "specializationId": 2,
  "preferredLearningLanguageId": 1,
  "preferredLearningMode": "hybrid",
  "preferredContentType": "mixed",
  "difficultyPreference": "beginner",
  "dailyLearningHours": 1,
  "coursesEnrolled": 2,
  "coursesCompleted": 1,
  "averageScore": 75.0,
  "currentStreakDays": 5,
  "xpPoints": 1200,
  "level": 2,
  "totalLearningHours": 20,
  "subscriptionPlan": "basic",
  "hasActiveSubscription": true,
  "totalAmountPaid": 2999.00,
  "isCurrentlyStudying": true,
  "isSeekingJob": false,
  "isOpenToInternship": true,
  "isOpenToFreelance": false,
  "isActive": true
}
```

### Form-data (`multipart/form-data`)

| Field | Type | Required | Notes |
|---|---|---|---|
| `userId` | text | yes | The owning user id. |
| `enrollmentNumber` | text | yes | Unique enrollment identifier. |
| `enrollmentDate` | text | yes | ISO date (e.g., `2024-03-01`). |
| `enrollmentType`, `preferredLearningMode`, etc. | text | no | Optional profile fields. |
| `resume` (aliases: `resumeFile`, `file`) | file | no | PDF / PNG / JPEG / WebP, **≤ 5 MB**. Stored at `student-resumes/<id>.<ext>`. Returns `resumeUrl` in response. |

**Postman examples**

| # | Example name | Content-Type | Body |
|---|---|---|---|
| 1 | Create — form-data (no resume) | `multipart/form-data` | `userId` = `4`, `enrollmentNumber` = `STU042`, `enrollmentDate` = `2024-03-01` |
| 2 | Create — form-data + resume | `multipart/form-data` | `userId` = `4`, `enrollmentNumber` = `STU042`, `enrollmentDate` = `2024-03-01`, `resume` = `alex-resume.pdf` (file) |

### Responses

#### 201 Created — without resume

```json
{
  "success": true,
  "message": "Student profile created",
  "data": {
    "id": 42,
    "userId": 4,
    "enrollmentNumber": "STU042",
    "enrollmentDate": "2024-03-01",
    "enrollmentType": "corporate",
    "educationLevelName": "Bachelor's Degree",
    "learningGoalName": "Skill Development",
    "specializationName": "Data Science",
    "preferredLearningMode": "hybrid",
    "preferredContentType": "mixed",
    "difficultyPreference": "beginner",
    "resumeUrl": null,
    "createdAt": "2024-03-01T09:15:00.000Z",
    "updatedAt": "2024-03-01T09:15:00.000Z"
  }
}
```

#### 201 Created — with resume

```json
{
  "success": true,
  "message": "Student profile created",
  "data": {
    "id": 42,
    "userId": 4,
    "enrollmentNumber": "STU042",
    "enrollmentDate": "2024-03-01",
    "enrollmentType": "corporate",
    "educationLevelName": "Bachelor's Degree",
    "learningGoalName": "Skill Development",
    "specializationName": "Data Science",
    "preferredLearningMode": "hybrid",
    "preferredContentType": "mixed",
    "difficultyPreference": "beginner",
    "resumeUrl": "https://cdn.growupmore.com/student-resumes/42.pdf",
    "resumeFileName": "alex-resume.pdf",
    "resumeFileFormat": "pdf",
    "resumeFileSizeKb": 150,
    "createdAt": "2024-03-01T09:15:00.000Z",
    "updatedAt": "2024-03-01T09:15:00.000Z"
  }
}
```

#### 400 Bad request — parent user does not exist or is deleted

```json
{
  "success": false,
  "message": "Error inserting student profile: User id 99999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — invalid education level/learning goal/specialization

```json
{
  "success": false,
  "message": "Error inserting student profile: Education level id 999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — file too large

```json
{
  "success": false,
  "message": "File too large: resume must be ≤ 5 MB",
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

#### 409 Conflict — enrollment number already exists

```json
{
  "success": false,
  "message": "Error inserting student profile: Enrollment number STU042 already exists.",
  "code": "CONFLICT"
}
```

#### 403 Forbidden — caller lacks create permission

```json
{
  "success": false,
  "message": "Missing required permission: student_profile.create",
  "code": "FORBIDDEN"
}
```

---

## 1.4 `PATCH /api/v1/student-profiles/:id`

Partial update. `authorizeSelfOr` lets admins use this on any row and lets students use it on their own row (with field restrictions). Provide at least one field (empty body → `400 VALIDATION_ERROR`).

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/student-profiles/:id` |
| Permission | `student_profile.update` *or* `student_profile.update.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Content-Type** — `application/json` or `multipart/form-data`.

**Admin-only fields** (403 if student attempts): `subscriptionPlan`, `hasActiveSubscription`, `totalAmountPaid`.

### JSON (`application/json`)

Student update of learning preferences:
```json
{
  "preferredLearningMode": "cohort_based",
  "preferredContentType": "interactive",
  "difficultyPreference": "advanced",
  "dailyLearningHours": 3
}
```

Admin update of enrollment and subscription:
```json
{
  "enrollmentType": "scholarship",
  "isCurrentlyStudying": false,
  "subscriptionPlan": "enterprise",
  "hasActiveSubscription": true,
  "totalAmountPaid": 15999.00
}
```

### Form-data (`multipart/form-data`)

| Field | Type | Notes |
|---|---|---|
| `preferredLearningMode`, `preferredContentType`, etc. | text | Optional profile fields. Admin-only fields will be rejected for students. |
| `resume` (aliases: `resumeFile`, `file`) | file | PDF / PNG / JPEG / WebP, **≤ 5 MB**. Optional. |

**Postman examples**

| # | Example name | Content-Type | Body |
|---|---|---|---|
| 1 | Update — form-data (text only) | `multipart/form-data` | `preferredLearningMode` = `cohort_based`, `dailyLearningHours` = `3` |
| 2 | Update — form-data + text + resume | `multipart/form-data` | `preferredLearningMode` = `cohort_based`, `resume` = `alex-resume-v2.pdf` (file) |
| 3 | Update — resume only | `multipart/form-data` | `resume` = `alex-updated-resume.pdf` (file) |

### Responses

#### 200 OK — text-only update

```json
{
  "success": true,
  "message": "Student profile updated",
  "data": {
    "id": 42,
    "userId": 4,
    "enrollmentNumber": "STU042",
    "preferredLearningMode": "cohort_based",
    "preferredContentType": "interactive",
    "difficultyPreference": "advanced",
    "dailyLearningHours": 3,
    "resumeUrl": null,
    "updatedAt": "2026-04-14T11:00:00.000Z"
  }
}
```

#### 200 OK — text + resume update

```json
{
  "success": true,
  "message": "Student profile updated",
  "data": {
    "id": 42,
    "userId": 4,
    "enrollmentNumber": "STU042",
    "preferredLearningMode": "cohort_based",
    "resumeUrl": "https://cdn.growupmore.com/student-resumes/42.pdf",
    "resumeFileName": "alex-resume-v2.pdf",
    "resumeFileFormat": "pdf",
    "resumeFileSizeKb": 155,
    "updatedAt": "2026-04-14T11:01:00.000Z"
  }
}
```

#### 200 OK — resume-only update

```json
{
  "success": true,
  "message": "Student profile updated",
  "data": {
    "id": 42,
    "userId": 4,
    "enrollmentNumber": "STU042",
    "resumeUrl": "https://cdn.growupmore.com/student-resumes/42.pdf",
    "resumeFileName": "alex-updated-resume.pdf",
    "resumeFileFormat": "pdf",
    "resumeFileSizeKb": 160,
    "updatedAt": "2026-04-14T11:02:00.000Z"
  }
}
```

#### 400 Bad request — empty body

```json
{
  "success": false,
  "message": "Validation error: At least one field is required",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad request — file too large

```json
{
  "success": false,
  "message": "File too large: resume must be ≤ 5 MB",
  "code": "BAD_REQUEST"
}
```

#### 403 Forbidden — own-scope caller on a foreign row

```json
{
  "success": false,
  "message": "Forbidden: student_profile.update.own only grants access to your own record",
  "code": "FORBIDDEN"
}
```

#### 403 Forbidden — student attempting admin-only field

```json
{
  "success": false,
  "message": "Forbidden: Field 'subscriptionPlan' is admin-only",
  "code": "FORBIDDEN"
}
```

#### 400 Bad request — foreign key validation

```json
{
  "success": false,
  "message": "Error updating student profile: Specialization id 999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — foreign key validation

```json
{
  "success": false,
  "message": "Error updating student profile: Specialization id 999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

---

## 1.5 `DELETE /api/v1/student-profiles/:id`

Hard-delete a profile row. Does **not** touch the parent `users` row.

This endpoint is super-admin-only. Admins have `student_profile.update` and can clear individual fields with `PATCH /:id`, but they cannot hard-delete the row. To additionally enforce this even if a future seed accidentally granted `student_profile.delete` to admin, the router layers a `requireSuperAdmin` role check on top of the permission check.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/student-profiles/:id` |
| Permission | `student_profile.delete` + role `super_admin` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Student profile deleted",
  "data": { "id": 42, "deleted": true }
}
```

#### 403 Forbidden — admin caller

```json
{
  "success": false,
  "message": "Only super admins may hard-delete student profiles",
  "code": "FORBIDDEN"
}
```

#### 403 Forbidden — student/instructor/employee

```json
{
  "success": false,
  "message": "Only admins and super-admins may access student profiles",
  "code": "FORBIDDEN"
}
```

#### 400 Bad request — unknown id

```json
{
  "success": false,
  "message": "Error deleting student profile: No student profile found with id 99999.",
  "code": "BAD_REQUEST"
}
```

---

## 1.6 `GET /api/v1/student-profiles/me`

Return the caller's own student profile. This is the self-service read path for students; admins can use it too but typically hit `/:id` instead.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/student-profiles/me` |
| Permission | `student_profile.read.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

Full `StudentProfileDto` in `data`.

```json
{
  "success": true,
  "message": "OK",
  "data": { /* full StudentProfileDto */ }
}
```

#### 404 Not Found — caller has no student profile yet

```json
{
  "success": false,
  "message": "You do not have a student profile yet. Contact your administrator.",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden — instructor/employee role

```json
{
  "success": false,
  "message": "Only students may access their own profile",
  "code": "FORBIDDEN"
}
```

---

## 1.7 `PATCH /api/v1/student-profiles/me`

Self-service partial update. Students can only update their own non-sensitive fields; subscription and payment fields are admin-only. Provide at least one field (empty body → `400 VALIDATION_ERROR`).

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/student-profiles/me` |
| Permission | `student_profile.update.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Content-Type** — `application/json` or `multipart/form-data`.

**Allowed fields for self-service:**
`enrollmentType`, `educationLevelId`, `learningGoalId`, `specializationId`, `preferredLearningLanguageId`, `preferredLearningMode`, `preferredContentType`, `difficultyPreference`, `dailyLearningHours`, `isCurrentlyStudying`, `isSeekingJob`, `isOpenToInternship`, `isOpenToFreelance`.

**Forbidden fields** (attempt triggers 403): `subscriptionPlan`, `hasActiveSubscription`, `totalAmountPaid`.

### JSON (`application/json`)

```json
{
  "preferredLearningMode": "instructor_led",
  "preferredContentType": "text",
  "dailyLearningHours": 4,
  "isSeekingJob": true,
  "isOpenToInternship": true
}
```

### Form-data (`multipart/form-data`)

| Field | Type | Notes |
|---|---|---|
| `preferredLearningMode`, `preferredContentType`, etc. | text | Optional allowed profile fields (admin-only fields rejected). |
| `resume` (aliases: `resumeFile`, `file`) | file | PDF / PNG / JPEG / WebP, **≤ 5 MB**. Optional. |

**Postman examples**

| # | Example name | Content-Type | Body |
|---|---|---|---|
| 1 | Update — form-data (text only) | `multipart/form-data` | `preferredLearningMode` = `instructor_led`, `dailyLearningHours` = `4` |
| 2 | Update — form-data + text + resume | `multipart/form-data` | `preferredLearningMode` = `instructor_led`, `resume` = `jane-resume.pdf` (file) |
| 3 | Update — resume only | `multipart/form-data` | `resume` = `jane-updated-resume.pdf` (file) |

### Responses

#### 200 OK — text-only update

```json
{
  "success": true,
  "message": "Student profile updated",
  "data": {
    "id": 1,
    "userId": 3,
    "enrollmentNumber": "STU001",
    "preferredLearningMode": "instructor_led",
    "preferredContentType": "text",
    "dailyLearningHours": 4,
    "isSeekingJob": true,
    "isOpenToInternship": true,
    "resumeUrl": null,
    "updatedAt": "2026-04-14T11:00:00.000Z"
  }
}
```

#### 200 OK — text + resume update

```json
{
  "success": true,
  "message": "Student profile updated",
  "data": {
    "id": 1,
    "userId": 3,
    "enrollmentNumber": "STU001",
    "preferredLearningMode": "instructor_led",
    "preferredContentType": "text",
    "dailyLearningHours": 4,
    "resumeUrl": "https://cdn.growupmore.com/student-resumes/1.pdf",
    "resumeFileName": "jane-resume.pdf",
    "resumeFileFormat": "pdf",
    "resumeFileSizeKb": 180,
    "updatedAt": "2026-04-14T11:01:00.000Z"
  }
}
```

#### 200 OK — resume-only update

```json
{
  "success": true,
  "message": "Student profile updated",
  "data": {
    "id": 1,
    "userId": 3,
    "enrollmentNumber": "STU001",
    "resumeUrl": "https://cdn.growupmore.com/student-resumes/1.pdf",
    "resumeFileName": "jane-updated-resume.pdf",
    "resumeFileFormat": "pdf",
    "resumeFileSizeKb": 185,
    "updatedAt": "2026-04-14T11:02:00.000Z"
  }
}
```

#### 400 Validation error — empty body

```json
{
  "success": false,
  "message": "Validation error: At least one field is required",
  "code": "VALIDATION_ERROR"
}
```

#### 400 Bad request — file too large

```json
{
  "success": false,
  "message": "File too large: resume must be ≤ 5 MB",
  "code": "BAD_REQUEST"
}
```

#### 403 Forbidden — attempt to update admin-only field

```json
{
  "success": false,
  "message": "Forbidden: Field 'subscriptionPlan' is admin-only",
  "code": "FORBIDDEN"
}
```

#### 403 Forbidden — instructor/employee role

```json
{
  "success": false,
  "message": "Only students may update their own profile",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found — caller has no student profile

```json
{
  "success": false,
  "message": "You do not have a student profile yet. Contact your administrator.",
  "code": "NOT_FOUND"
}
```

---

## Enums (CHECK constraints)

### enrollmentType
- `self` — Self-funded learner.
- `corporate` — Corporate training program participant.
- `scholarship` — Scholarship recipient.
- `referral` — Enrolled via referral.
- `trial` — Trial or free tier access.
- `other` — Other enrollment method.

### preferredLearningMode
- `self_paced` — Self-paced learning.
- `instructor_led` — Instructor-led classroom or live sessions.
- `hybrid` — Combination of self-paced and instructor-led.
- `cohort_based` — Cohort-based learning with peers.
- `mentored` — One-on-one mentoring or coaching.

### preferredContentType
- `video` — Video lectures and tutorials.
- `text` — Text-based content (articles, PDFs, docs).
- `interactive` — Interactive exercises, quizzes, labs.
- `audio` — Audio content (podcasts, lectures).
- `mixed` — Mix of multiple content types.

### difficultyPreference
- `beginner` — Beginner level content.
- `intermediate` — Intermediate level content.
- `advanced` — Advanced level content.
- `mixed` — Mix of difficulty levels.

### subscriptionPlan
- `free` — Free tier with limited access.
- `basic` — Basic subscription plan.
- `standard` — Standard subscription plan.
- `premium` — Premium subscription plan with full access.
- `enterprise` — Enterprise/organizational plan.
- `lifetime` — Lifetime access (one-time purchase).

---

## DTO reference

`StudentProfileDto` is the standard response envelope for student profiles. The full TypeScript definition lives in [`api/src/modules/student-profiles/student-profiles.service.ts`](../../../api/src/modules/student-profiles/student-profiles.service.ts). Top-level keys:

| Key | Purpose |
|---|---|
| `id`, `userId` | Primary keys — profile id and owning user id (1:1). |
| `enrollmentNumber` | Unique student identifier string. |
| `enrollmentDate` | Date of enrollment. |
| `enrollmentType` | Enum: `self`, `corporate`, `scholarship`, `referral`, `trial`, `other`. |
| `educationLevelId`, `educationLevelName`, `educationLevelCategory` | Education level reference and resolved info. |
| `learningGoalId`, `learningGoalName` | Learning goal reference and resolved name. |
| `specializationId`, `specializationName`, `specializationCategory` | Specialization reference and resolved info. |
| `preferredLearningLanguageId`, `preferredLearningLanguageName` | Preferred learning language reference and name. |
| `preferredLearningMode` | Enum: `self_paced`, `instructor_led`, `hybrid`, `cohort_based`, `mentored`. |
| `preferredContentType` | Enum: `video`, `text`, `interactive`, `audio`, `mixed`. |
| `difficultyPreference` | Enum: `beginner`, `intermediate`, `advanced`, `mixed`. |
| `dailyLearningHours` | Average daily learning hours commitment. |
| `coursesEnrolled` | Total courses enrolled. |
| `coursesCompleted` | Total courses completed. |
| `averageScore` | Average score across completed courses (0-100). |
| `currentStreakDays` | Current learning streak in days. |
| `xpPoints` | Total experience points earned. |
| `level` | Current learning level/tier. |
| `totalLearningHours` | Cumulative learning hours. |
| `subscriptionPlan` | Enum: `free`, `basic`, `standard`, `premium`, `enterprise`, `lifetime`. |
| `hasActiveSubscription` | Boolean flag for active subscription status. |
| `totalAmountPaid` | Cumulative amount paid (decimal). |
| `isCurrentlyStudying` | Boolean flag for active study status. |
| `isSeekingJob` | Boolean flag for job-seeking status. |
| `isOpenToInternship` | Boolean flag for internship openness. |
| `isOpenToFreelance` | Boolean flag for freelance openness. |
| `resumeUrl`, `resumeFileName`, `resumeFileFormat`, `resumeFileSizeKb` | CDN resume URL and metadata — **response-only**, server-set by multipart file uploads. `resumeUrl` is not accepted as JSON input. |
| `isActive` | Activity status flag (inherited from parent users row). |
| `createdBy`, `updatedBy`, `createdAt`, `updatedAt` | Audit trail. |
| `isDeleted` | Hard-delete flag. |
| `userIsActive` | Inherited active status from parent users row. |
| `user` | Nested owner summary (name, email, role, mobile, verification flags). |

### File upload field aliases and constraints

When uploading files via `multipart/form-data`, the `resume` field accepts these interchangeable names:

- `resume` (canonical) = `resumeFile` = `file`

**File constraints:**
- Accepted MIME types: `application/pdf`, `image/png`, `image/jpeg`, `image/webp`
- Maximum size: **5 MB** raw

← [00 overview](00%20-%20overview.md) · **Next →** [02 walkthrough and index](02%20-%20walkthrough%20and%20index.md)
