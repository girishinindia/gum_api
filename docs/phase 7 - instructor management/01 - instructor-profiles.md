# Phase 7 — Instructor Profiles

An instructor profile is the 1:1 detail record for a `users` row (when that user is an instructor). It stores instructor metadata (instructor code, type, designation, teaching experience), instructional preferences (teaching mode, preferred language, preferred time slots), compensation data (payment model, rates, revenue share), course and engagement metrics (courses created, students taught, reviews, ratings, teaching hours), content data (demo video, intro video, bio, tagline, qualifications, certifications, awards), availability info (available hours, available date range, max concurrent courses), and admin fields (approval status, verification flag, featured flag, badge). This resource enforces role-based access patterns: **super-admins** have full CRUD (including hard-delete); **admins** have read, create, and update (no delete); **instructors** can read/update their own profile via `/me` endpoints; **other users** cannot access instructor profiles (403). Hard-delete only (no soft-delete).

All routes require auth. Permission codes: `instructor_profile.create`, `instructor_profile.read`, `instructor_profile.update`, `instructor_profile.delete`, `instructor_profile.read.own`, `instructor_profile.update.own`.

- Super-admin: all 6 permissions.
- Admin: `create`, `read`, `update`, `read.own`, `update.own` (no `delete`).
- Instructor: `read.own`, `update.own` (no admin-wide read, create, update, or delete).
- Student: none (endpoint returns 403 for this role).
- Employee: none (endpoint returns 403 for this role).

All examples below use the Postman environment variables **`{{baseUrl}}`** and **`{{accessToken}}`** — see [§8 in 00 - overview](00%20-%20overview.md#8-postman-environment).

← [00 overview](00%20-%20overview.md) · **Next →** [02 walkthrough and index](02%20-%20walkthrough%20and%20index.md)

---

## Endpoint summary

| § | Method | Path | Auth / Permission | Purpose |
|---|---|---|---|---|
| [§1.1](#11-get-apiv1instructor-profiles) | `GET` | `{{baseUrl}}/api/v1/instructor-profiles` | `instructor_profile.read` | List all profiles (admin+ only). |
| [§1.2](#12-get-apiv1instructor-profilesid) | `GET` | `{{baseUrl}}/api/v1/instructor-profiles/:id` | `instructor_profile.read` *or* `instructor_profile.read.own` (+ self match) | Get one profile by ID. |
| [§1.3](#13-post-apiv1instructor-profiles) | `POST` | `{{baseUrl}}/api/v1/instructor-profiles` | `instructor_profile.create` | Admin create — required fields only. |
| [§1.4](#14-patch-apiv1instructor-profilesid) | `PATCH` | `{{baseUrl}}/api/v1/instructor-profiles/:id` | `instructor_profile.update` *or* `instructor_profile.update.own` (+ self match) | Update one profile by ID. |
| [§1.5](#15-delete-apiv1instructor-profilesid) | `DELETE` | `{{baseUrl}}/api/v1/instructor-profiles/:id` | `instructor_profile.delete` + super-admin role | Hard-delete one profile (SA only). |
| [§1.6](#16-get-apiv1instructor-profilesme) | `GET` | `{{baseUrl}}/api/v1/instructor-profiles/me` | `instructor_profile.read.own` | Get own instructor profile. |
| [§1.7](#17-patch-apiv1instructor-profilesme) | `PATCH` | `{{baseUrl}}/api/v1/instructor-profiles/me` | `instructor_profile.update.own` | Update own instructor profile (approval and admin-only fields restricted). |

> `/me` endpoints must be declared before `/:id` in the router so Express does not treat `me` as an id segment.

---

## 1.1 `GET /api/v1/instructor-profiles`

List instructor profiles. Backed by `udf_get_instructor_profiles`, which joins `instructor_profiles` → `uv_users` → `specializations`, `designations`, `departments`, `branches`, `preferred_teaching_languages`. Supports full pagination, multi-table sorting, filtering by 20+ fields, and full-text search.

**Postman request**

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/instructor-profiles` |
| Permission | `instructor_profile.read` |

**Headers**

| Key | Value |
|---|---|
| `Authorization` | `Bearer {{accessToken}}` |

**Query params**

| Name | Type | Default | Notes |
|---|---|---|---|
| `pageIndex` | int | `1` | 1-based page number. |
| `pageSize` | int | `20` | 1..100. |
| `searchTerm` | string | — | `ILIKE` across instructor code, first name, last name, email, designation name, department name, specialization name. |
| `sortTable` | enum | `inst` | `inst` \| `specialization` \| `designation` \| `department` \| `user`. Determines which table's column sorting applies. |
| `sortColumn` | enum | `id` | See [sort columns per table](#sort-columns-per-table) below. |
| `sortDirection` | enum | `ASC` | `ASC` \| `DESC`. |
| `filterInstructorType` | enum | — | `internal`, `external`, `guest`, `visiting`, `corporate`, `community`, `other`. |
| `filterTeachingMode` | enum | — | `online`, `offline`, `hybrid`, `recorded_only`. |
| `filterApprovalStatus` | enum | — | `pending`, `under_review`, `approved`, `rejected`, `suspended`, `blacklisted`. |
| `filterPaymentModel` | enum | — | `revenue_share`, `fixed_per_course`, `hourly`, `monthly_salary`, `per_student`, `hybrid`, `volunteer`, `other`. |
| `filterBadge` | enum | — | `new`, `rising`, `popular`, `top_rated`, `expert`, `elite`. |
| `filterIsAvailable` | bool | — | Filter by `isAvailable` flag. |
| `filterIsVerified` | bool | — | Filter by `isVerified` flag. |
| `filterIsFeatured` | bool | — | Filter by `isFeatured` flag. |
| `filterIsActive` | bool | — | Filter by instructor activity status (inherited from parent user). |
| `filterIsDeleted` | bool | — | Include/exclude hard-deleted profiles. |
| `filterSpecializationId` | int | — | Filter by primary specialization. |
| `filterSecondarySpecializationId` | int | — | Filter by secondary specialization. |
| `filterDesignationId` | int | — | Filter by designation. |
| `filterDepartmentId` | int | — | Filter by department. |
| `filterBranchId` | int | — | Filter by branch. |
| `filterUserRole` | string | — | Filter by parent user's role code, e.g. `instructor`. |
| `filterUserIsActive` | bool | — | Filter by inherited user active flag. |

### Sort columns per table

- **`inst`** (instructor_profiles): `id`, `instructor_code`, `instructor_type`, `teaching_mode`, `is_available`, `available_hours_per_week`, `total_experience_years`, `teaching_experience_years`, `industry_experience_years`, `total_courses_created`, `total_courses_published`, `total_students_taught`, `total_reviews_received`, `average_rating`, `total_teaching_hours`, `total_content_minutes`, `approval_status`, `is_verified`, `is_featured`, `is_active`, `created_at`, `updated_at`.
- **`specialization`**: `name`, `category`.
- **`designation`**: `name`, `order`.
- **`department`**: `name`.
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
      "userId": 5,
      "instructorCode": "INST001",
      "instructorType": "internal",
      "designationId": 1,
      "designationName": "Senior Instructor",
      "departmentId": 1,
      "departmentName": "Engineering",
      "branchId": 1,
      "branchName": "Main Campus",
      "joiningDate": "2020-06-15",
      "specializationId": 1,
      "specializationName": "Full Stack Development",
      "specializationCategory": "technology",
      "secondarySpecializationId": 2,
      "secondarySpecializationName": "Cloud Computing",
      "secondarySpecializationCategory": "technology",
      "teachingExperienceYears": 8,
      "industryExperienceYears": 5,
      "totalExperienceYears": 13,
      "preferredTeachingLanguageId": 1,
      "preferredTeachingLanguageName": "English",
      "teachingMode": "hybrid",
      "instructorBio": "Passionate about full-stack web development with 8 years of teaching experience.",
      "tagline": "Building experts in web technologies",
      "demoVideoUrl": "https://example.com/demo.mp4",
      "introVideoDurationSec": 180,
      "highestQualification": "M.Tech in Computer Science",
      "certificationsSummary": "AWS Certified Solutions Architect, GCP Professional Cloud Architect",
      "awardsAndRecognition": "Best Instructor Award 2022, Innovation in Teaching 2023",
      "isAvailable": true,
      "availableHoursPerWeek": 20,
      "availableFrom": "2026-05-01",
      "availableUntil": "2026-12-31",
      "preferredTimeSlots": "weekday_mornings, weekend_evenings",
      "maxConcurrentCourses": 5,
      "paymentModel": "revenue_share",
      "revenueSharePercentage": 35,
      "fixedRatePerCourse": null,
      "hourlyRate": null,
      "paymentCurrency": "INR",
      "publicationsCount": 3,
      "patentsCount": 1,
      "totalCoursesCreated": 12,
      "totalCoursesPublished": 10,
      "totalStudentsTaught": 450,
      "totalReviewsReceived": 380,
      "averageRating": 4.7,
      "totalTeachingHours": 1200,
      "totalContentMinutes": 8400,
      "completionRate": 0.82,
      "approvalStatus": "approved",
      "approvedBy": 1,
      "approvedAt": "2020-06-20T10:30:00.000Z",
      "rejectionReason": null,
      "isVerified": true,
      "isFeatured": true,
      "badge": "top_rated",
      "isActive": true,
      "createdBy": 1,
      "updatedBy": 1,
      "createdAt": "2020-06-15T08:00:00.000Z",
      "updatedAt": "2026-04-11T14:22:00.000Z",
      "isDeleted": false,
      "userIsActive": true,
      "user": {
        "firstName": "John",
        "lastName": "Doe",
        "email": "john.doe@example.com",
        "mobile": "+91-9876543220",
        "roleId": 4,
        "roleName": "Instructor",
        "isActive": true,
        "isDeleted": false,
        "isEmailVerified": true,
        "isMobileVerified": true
      },
      "specialization": {
        "id": 1,
        "name": "Full Stack Development",
        "category": "technology"
      },
      "secondarySpecialization": {
        "id": 2,
        "name": "Cloud Computing",
        "category": "technology"
      },
      "designation": {
        "id": 1,
        "name": "Senior Instructor"
      },
      "department": {
        "id": 1,
        "name": "Engineering"
      },
      "branch": {
        "id": 1,
        "name": "Main Campus"
      },
      "preferredTeachingLanguage": {
        "id": 1,
        "name": "English"
      },
      "approver": {
        "firstName": "Admin",
        "lastName": "User",
        "email": "admin@example.com"
      }
    }
  ],
  "meta": { "page": 1, "limit": 20, "totalCount": 87, "totalPages": 5 }
}
```

#### 403 Forbidden — caller lacks `instructor_profile.read`

```json
{
  "success": false,
  "message": "Missing required permission: instructor_profile.read",
  "code": "FORBIDDEN"
}
```

#### 403 Forbidden — student/employee role

```json
{
  "success": false,
  "message": "Only admins and super-admins may access all instructor profiles",
  "code": "FORBIDDEN"
}
```

### Saved examples to add in Postman

The following recipes cover every supported combination of **pagination**, **searching**, **filtering**, and **sorting** exposed by this endpoint. Copy the query string after `{{baseUrl}}/api/v1/instructor-profiles` — method, headers and auth stay the same as the base request above.

| Example name | Query string |
|---|---|
| Page 1 (defaults) | `?pageIndex=1&pageSize=20` |
| Page 2, default size | `?pageIndex=2&pageSize=20` |
| Page 1, small page (5 rows) | `?pageIndex=1&pageSize=5` |
| Page 1, large page (100 rows) | `?pageIndex=1&pageSize=100` |
| Out-of-range page (returns empty `data`) | `?pageIndex=9999&pageSize=20` |
| Search across code/name/email | `?searchTerm=INST001` |
| Search instructor by name | `?searchTerm=john` |
| Search + pagination | `?pageIndex=1&pageSize=50&searchTerm=doe` |
| Instructor type — internal | `?filterInstructorType=internal` |
| Instructor type — external | `?filterInstructorType=external` |
| Instructor type — guest | `?filterInstructorType=guest` |
| Instructor type — visiting | `?filterInstructorType=visiting` |
| Instructor type — corporate | `?filterInstructorType=corporate` |
| Instructor type — community | `?filterInstructorType=community` |
| Teaching mode — online | `?filterTeachingMode=online` |
| Teaching mode — offline | `?filterTeachingMode=offline` |
| Teaching mode — hybrid | `?filterTeachingMode=hybrid` |
| Teaching mode — recorded_only | `?filterTeachingMode=recorded_only` |
| Approval status — pending | `?filterApprovalStatus=pending` |
| Approval status — under_review | `?filterApprovalStatus=under_review` |
| Approval status — approved | `?filterApprovalStatus=approved` |
| Approval status — rejected | `?filterApprovalStatus=rejected` |
| Approval status — suspended | `?filterApprovalStatus=suspended` |
| Approval status — blacklisted | `?filterApprovalStatus=blacklisted` |
| Payment model — revenue_share | `?filterPaymentModel=revenue_share` |
| Payment model — fixed_per_course | `?filterPaymentModel=fixed_per_course` |
| Payment model — hourly | `?filterPaymentModel=hourly` |
| Payment model — monthly_salary | `?filterPaymentModel=monthly_salary` |
| Payment model — per_student | `?filterPaymentModel=per_student` |
| Payment model — hybrid | `?filterPaymentModel=hybrid` |
| Payment model — volunteer | `?filterPaymentModel=volunteer` |
| Badge — new | `?filterBadge=new` |
| Badge — rising | `?filterBadge=rising` |
| Badge — popular | `?filterBadge=popular` |
| Badge — top_rated | `?filterBadge=top_rated` |
| Badge — expert | `?filterBadge=expert` |
| Badge — elite | `?filterBadge=elite` |
| Is available | `?filterIsAvailable=true` |
| Not available | `?filterIsAvailable=false` |
| Verified instructors | `?filterIsVerified=true` |
| Not verified | `?filterIsVerified=false` |
| Featured instructors | `?filterIsFeatured=true` |
| Not featured | `?filterIsFeatured=false` |
| Active instructors only | `?filterIsActive=true` |
| Inactive instructors only | `?filterIsActive=false` |
| Exclude hard-deleted | `?filterIsDeleted=false` |
| Include hard-deleted (admin audit) | `?filterIsDeleted=true` |
| Filter by specialization | `?filterSpecializationId=1` |
| Filter by secondary specialization | `?filterSecondarySpecializationId=2` |
| Filter by designation | `?filterDesignationId=1` |
| Filter by department | `?filterDepartmentId=1` |
| Filter by branch | `?filterBranchId=1` |
| Filter by user role | `?filterUserRole=instructor` |
| Active user only | `?filterUserIsActive=true` |
| Sort by `id` ASC (default) | `?sortTable=inst&sortColumn=id&sortDirection=ASC` |
| Sort by `id` DESC | `?sortTable=inst&sortColumn=id&sortDirection=DESC` |
| Sort by instructor code ASC | `?sortTable=inst&sortColumn=instructor_code&sortDirection=ASC` |
| Sort by teaching experience DESC | `?sortTable=inst&sortColumn=teaching_experience_years&sortDirection=DESC` |
| Sort by total experience DESC | `?sortTable=inst&sortColumn=total_experience_years&sortDirection=DESC` |
| Sort by courses created DESC | `?sortTable=inst&sortColumn=total_courses_created&sortDirection=DESC` |
| Sort by courses published DESC | `?sortTable=inst&sortColumn=total_courses_published&sortDirection=DESC` |
| Sort by students taught DESC | `?sortTable=inst&sortColumn=total_students_taught&sortDirection=DESC` |
| Sort by average rating DESC | `?sortTable=inst&sortColumn=average_rating&sortDirection=DESC` |
| Sort by total teaching hours DESC | `?sortTable=inst&sortColumn=total_teaching_hours&sortDirection=DESC` |
| Sort by is_available DESC | `?sortTable=inst&sortColumn=is_available&sortDirection=DESC` |
| Sort by created_at DESC (newest first) | `?sortTable=inst&sortColumn=created_at&sortDirection=DESC` |
| Sort by specialization name ASC | `?sortTable=specialization&sortColumn=name&sortDirection=ASC` |
| Sort by specialization category ASC | `?sortTable=specialization&sortColumn=category&sortDirection=ASC` |
| Sort by designation name ASC | `?sortTable=designation&sortColumn=name&sortDirection=ASC` |
| Sort by department name ASC | `?sortTable=department&sortColumn=name&sortDirection=ASC` |
| Sort by user first_name ASC | `?sortTable=user&sortColumn=first_name&sortDirection=ASC` |
| Sort by user email ASC | `?sortTable=user&sortColumn=email&sortDirection=ASC` |
| Combo — internal, approved, sorted by rating DESC | `?pageIndex=1&pageSize=20&filterInstructorType=internal&filterApprovalStatus=approved&sortTable=inst&sortColumn=average_rating&sortDirection=DESC` |
| Combo — available, verified, featured | `?pageIndex=1&pageSize=20&filterIsAvailable=true&filterIsVerified=true&filterIsFeatured=true` |
| Combo — high rating, hybrid teaching | `?pageIndex=1&pageSize=20&filterTeachingMode=hybrid&sortTable=inst&sortColumn=average_rating&sortDirection=DESC` |
| Combo — specialization filter, search, sorted by experience | `?pageIndex=1&pageSize=20&filterSpecializationId=1&searchTerm=developer&sortTable=inst&sortColumn=teaching_experience_years&sortDirection=DESC` |

---

## 1.2 `GET /api/v1/instructor-profiles/:id`

Get one profile by ID. Uses `authorizeSelfOr` — if the caller holds `instructor_profile.read` they pass unconditionally; otherwise the middleware resolves the owner of `:id` and allows the call only when the owner is the caller.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/instructor-profiles/:id` |
| Permission | `instructor_profile.read` *or* `instructor_profile.read.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

Full `InstructorProfileDto` in `data`.

```json
{
  "success": true,
  "message": "OK",
  "data": {
    "id": 1,
    "userId": 5,
    "instructorCode": "INST001",
    "instructorType": "internal",
    "designationId": 1,
    "designationName": "Senior Instructor",
    "departmentId": 1,
    "departmentName": "Engineering",
    "branchId": 1,
    "branchName": "Main Campus",
    "joiningDate": "2020-06-15",
    "specializationId": 1,
    "specializationName": "Full Stack Development",
    "specializationCategory": "technology",
    "secondarySpecializationId": 2,
    "secondarySpecializationName": "Cloud Computing",
    "secondarySpecializationCategory": "technology",
    "teachingExperienceYears": 8,
    "industryExperienceYears": 5,
    "totalExperienceYears": 13,
    "preferredTeachingLanguageId": 1,
    "preferredTeachingLanguageName": "English",
    "teachingMode": "hybrid",
    "instructorBio": "Passionate about full-stack web development with 8 years of teaching experience.",
    "tagline": "Building experts in web technologies",
    "demoVideoUrl": "https://example.com/demo.mp4",
    "introVideoDurationSec": 180,
    "highestQualification": "M.Tech in Computer Science",
    "certificationsSummary": "AWS Certified Solutions Architect, GCP Professional Cloud Architect",
    "awardsAndRecognition": "Best Instructor Award 2022, Innovation in Teaching 2023",
    "isAvailable": true,
    "availableHoursPerWeek": 20,
    "availableFrom": "2026-05-01",
    "availableUntil": "2026-12-31",
    "preferredTimeSlots": "weekday_mornings, weekend_evenings",
    "maxConcurrentCourses": 5,
    "paymentModel": "revenue_share",
    "revenueSharePercentage": 35,
    "fixedRatePerCourse": null,
    "hourlyRate": null,
    "paymentCurrency": "INR",
    "publicationsCount": 3,
    "patentsCount": 1,
    "totalCoursesCreated": 12,
    "totalCoursesPublished": 10,
    "totalStudentsTaught": 450,
    "totalReviewsReceived": 380,
    "averageRating": 4.7,
    "totalTeachingHours": 1200,
    "totalContentMinutes": 8400,
    "completionRate": 0.82,
    "approvalStatus": "approved",
    "approvedBy": 1,
    "approvedAt": "2020-06-20T10:30:00.000Z",
    "rejectionReason": null,
    "isVerified": true,
    "isFeatured": true,
    "badge": "top_rated",
    "isActive": true,
    "createdBy": 1,
    "updatedBy": 1,
    "createdAt": "2020-06-15T08:00:00.000Z",
    "updatedAt": "2026-04-11T14:22:00.000Z",
    "isDeleted": false,
    "userIsActive": true,
    "user": {
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@example.com",
      "mobile": "+91-9876543220",
      "roleId": 4,
      "roleName": "Instructor",
      "isActive": true,
      "isDeleted": false,
      "isEmailVerified": true,
      "isMobileVerified": true
    },
    "specialization": {
      "id": 1,
      "name": "Full Stack Development",
      "category": "technology"
    },
    "secondarySpecialization": {
      "id": 2,
      "name": "Cloud Computing",
      "category": "technology"
    },
    "designation": {
      "id": 1,
      "name": "Senior Instructor"
    },
    "department": {
      "id": 1,
      "name": "Engineering"
    },
    "branch": {
      "id": 1,
      "name": "Main Campus"
    },
    "preferredTeachingLanguage": {
      "id": 1,
      "name": "English"
    },
    "approver": {
      "firstName": "Admin",
      "lastName": "User",
      "email": "admin@example.com"
    }
  }
}
```

#### 403 Forbidden — own-scope caller, someone else's profile

```json
{
  "success": false,
  "message": "Forbidden: instructor_profile.read.own only grants access to your own record",
  "code": "FORBIDDEN"
}
```

#### 403 Forbidden — student/employee role attempting read

```json
{
  "success": false,
  "message": "Only admins and super-admins may access all instructor profiles",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found

```json
{
  "success": false,
  "message": "Instructor profile 42 not found",
  "code": "NOT_FOUND"
}
```

---

## 1.3 `POST /api/v1/instructor-profiles`

Admin create — full field access with form validation. Requires `instructor_profile.create`, which is held by super-admin and admin. Parent user must exist, be active, and have the instructor role.

| Field | Value |
|---|---|
| Method | `POST` |
| URL | `{{baseUrl}}/api/v1/instructor-profiles` |
| Permission | `instructor_profile.create` |

**Headers** — `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json`.

**Required fields in request body:**
- `userId` (int) — Must exist in `users` table with instructor role.
- `instructorCode` (string) — Unique identifier across all instructors.

**Optional fields** (all others):

```json
{
  "userId": 6,
  "instructorCode": "INST042",
  "instructorType": "external",
  "designationId": 2,
  "departmentId": 1,
  "branchId": 1,
  "joiningDate": "2024-03-01",
  "specializationId": 2,
  "secondarySpecializationId": 3,
  "teachingExperienceYears": 5,
  "industryExperienceYears": 3,
  "totalExperienceYears": 8,
  "preferredTeachingLanguageId": 1,
  "teachingMode": "online",
  "instructorBio": "Experienced instructor in data science and machine learning.",
  "tagline": "Making data science accessible",
  "demoVideoUrl": "https://example.com/demo2.mp4",
  "introVideoDurationSec": 120,
  "highestQualification": "M.Sc in Data Science",
  "certificationsSummary": "TensorFlow Certified Developer, Kaggle Expert",
  "awardsAndRecognition": "Best Course Design 2023",
  "isAvailable": true,
  "availableHoursPerWeek": 15,
  "availableFrom": "2026-05-01",
  "availableUntil": "2026-12-31",
  "preferredTimeSlots": "weekday_evenings, weekends",
  "maxConcurrentCourses": 3,
  "paymentModel": "fixed_per_course",
  "revenueSharePercentage": null,
  "fixedRatePerCourse": 5000,
  "hourlyRate": null,
  "paymentCurrency": "INR",
  "isActive": true
}
```

### Responses

#### 201 Created

```json
{
  "success": true,
  "message": "Instructor profile created",
  "data": {
    "id": 42,
    "userId": 6,
    "instructorCode": "INST042",
    "instructorType": "external",
    "designationId": 2,
    "designationName": "Instructor",
    "departmentId": 1,
    "departmentName": "Engineering",
    "branchId": 1,
    "branchName": "Main Campus",
    "joiningDate": "2024-03-01",
    "specializationId": 2,
    "specializationName": "Data Science",
    "specializationCategory": "technology",
    "secondarySpecializationId": 3,
    "secondarySpecializationName": "Machine Learning",
    "secondarySpecializationCategory": "technology",
    "teachingExperienceYears": 5,
    "industryExperienceYears": 3,
    "totalExperienceYears": 8,
    "preferredTeachingLanguageId": 1,
    "preferredTeachingLanguageName": "English",
    "teachingMode": "online",
    "instructorBio": "Experienced instructor in data science and machine learning.",
    "tagline": "Making data science accessible",
    "demoVideoUrl": "https://example.com/demo2.mp4",
    "introVideoDurationSec": 120,
    "highestQualification": "M.Sc in Data Science",
    "certificationsSummary": "TensorFlow Certified Developer, Kaggle Expert",
    "awardsAndRecognition": "Best Course Design 2023",
    "isAvailable": true,
    "availableHoursPerWeek": 15,
    "availableFrom": "2026-05-01",
    "availableUntil": "2026-12-31",
    "preferredTimeSlots": "weekday_evenings, weekends",
    "maxConcurrentCourses": 3,
    "paymentModel": "fixed_per_course",
    "revenueSharePercentage": null,
    "fixedRatePerCourse": 5000,
    "hourlyRate": null,
    "paymentCurrency": "INR",
    "publicationsCount": 0,
    "patentsCount": 0,
    "totalCoursesCreated": 0,
    "totalCoursesPublished": 0,
    "totalStudentsTaught": 0,
    "totalReviewsReceived": 0,
    "averageRating": 0,
    "totalTeachingHours": 0,
    "totalContentMinutes": 0,
    "completionRate": 0,
    "approvalStatus": "pending",
    "approvedBy": null,
    "approvedAt": null,
    "rejectionReason": null,
    "isVerified": false,
    "isFeatured": false,
    "badge": null,
    "isActive": true,
    "createdBy": 1,
    "updatedBy": 1,
    "createdAt": "2024-03-01T10:15:00.000Z",
    "updatedAt": "2024-03-01T10:15:00.000Z",
    "isDeleted": false,
    "userIsActive": true,
    "user": {
      "firstName": "Sarah",
      "lastName": "Williams",
      "email": "sarah.williams@example.com",
      "mobile": "+91-9876543221",
      "roleId": 4,
      "roleName": "Instructor",
      "isActive": true,
      "isDeleted": false,
      "isEmailVerified": true,
      "isMobileVerified": true
    },
    "specialization": {
      "id": 2,
      "name": "Data Science",
      "category": "technology"
    },
    "secondarySpecialization": {
      "id": 3,
      "name": "Machine Learning",
      "category": "technology"
    },
    "designation": {
      "id": 2,
      "name": "Instructor"
    },
    "department": {
      "id": 1,
      "name": "Engineering"
    },
    "branch": {
      "id": 1,
      "name": "Main Campus"
    },
    "preferredTeachingLanguage": {
      "id": 1,
      "name": "English"
    },
    "approver": null
  }
}
```

#### 400 Bad request — parent user does not exist, is deleted, or is not an instructor

```json
{
  "success": false,
  "message": "Error inserting instructor profile: User id 99999 does not exist, is deleted, or does not have the instructor role.",
  "code": "BAD_REQUEST"
}
```

#### 400 Bad request — invalid specialization/designation/department/branch

```json
{
  "success": false,
  "message": "Error inserting instructor profile: Specialization id 999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

#### 409 Conflict — instructor code already exists

```json
{
  "success": false,
  "message": "Error inserting instructor profile: Instructor code INST042 already exists.",
  "code": "CONFLICT"
}
```

#### 403 Forbidden — caller lacks create permission

```json
{
  "success": false,
  "message": "Missing required permission: instructor_profile.create",
  "code": "FORBIDDEN"
}
```

---

## 1.4 `PATCH /api/v1/instructor-profiles/:id`

Partial update. `authorizeSelfOr` lets admins use this on any row and lets instructors use it on their own row (with field restrictions). Provide at least one field (empty body → `400 VALIDATION_ERROR`).

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/instructor-profiles/:id` |
| Permission | `instructor_profile.update` *or* `instructor_profile.update.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json`.

**Request body** — any subset of fields. **Admin-only fields** (403 if instructor attempts): `approvalStatus`, `approvedBy`, `approvedAt`, `rejectionReason`, `isVerified`, `isFeatured`, `badge`, `publicationsCount`, `patentsCount`, `totalCoursesCreated`, `totalCoursesPublished`, `totalStudentsTaught`, `totalReviewsReceived`, `averageRating`, `totalTeachingHours`, `totalContentMinutes`, `completionRate`. Example (instructor update of teaching prefs):

```json
{
  "teachingMode": "recorded_only",
  "preferredTimeSlots": "weekends_only",
  "maxConcurrentCourses": 2,
  "isAvailable": false,
  "availableUntil": "2026-06-30"
}
```

Example (admin update of approval and availability):

```json
{
  "approvalStatus": "approved",
  "approvedBy": 1,
  "approvedAt": "2024-03-05T10:00:00.000Z",
  "isVerified": true,
  "isFeatured": true,
  "badge": "rising",
  "isAvailable": true,
  "availableHoursPerWeek": 25
}
```

### Responses

#### 200 OK

Full updated `InstructorProfileDto` in `data`.

#### 403 Forbidden — own-scope caller on a foreign row

```json
{
  "success": false,
  "message": "Forbidden: instructor_profile.update.own only grants access to your own record",
  "code": "FORBIDDEN"
}
```

#### 403 Forbidden — instructor attempting admin-only field

```json
{
  "success": false,
  "message": "Forbidden: Field 'approvalStatus' is admin-only",
  "code": "FORBIDDEN"
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

#### 400 Bad request — foreign key validation

```json
{
  "success": false,
  "message": "Error updating instructor profile: Designation id 999 does not exist or is deleted.",
  "code": "BAD_REQUEST"
}
```

---

## 1.5 `DELETE /api/v1/instructor-profiles/:id`

Hard-delete a profile row. Does **not** touch the parent `users` row.

This endpoint is super-admin-only. Admins have `instructor_profile.update` and can clear individual fields with `PATCH /:id`, but they cannot hard-delete the row. To additionally enforce this even if a future seed accidentally granted `instructor_profile.delete` to admin, the router layers a `requireSuperAdmin` role check on top of the permission check.

| Field | Value |
|---|---|
| Method | `DELETE` |
| URL | `{{baseUrl}}/api/v1/instructor-profiles/:id` |
| Permission | `instructor_profile.delete` + role `super_admin` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

```json
{
  "success": true,
  "message": "Instructor profile deleted",
  "data": { "id": 42, "deleted": true }
}
```

#### 403 Forbidden — admin caller

```json
{
  "success": false,
  "message": "Only super admins may hard-delete instructor profiles",
  "code": "FORBIDDEN"
}
```

#### 403 Forbidden — student/instructor/employee

```json
{
  "success": false,
  "message": "Only admins and super-admins may access instructor profiles",
  "code": "FORBIDDEN"
}
```

#### 400 Bad request — unknown id

```json
{
  "success": false,
  "message": "Error deleting instructor profile: No instructor profile found with id 99999.",
  "code": "BAD_REQUEST"
}
```

---

## 1.6 `GET /api/v1/instructor-profiles/me`

Return the caller's own instructor profile. This is the self-service read path for instructors; admins can use it too but typically hit `/:id` instead.

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `{{baseUrl}}/api/v1/instructor-profiles/me` |
| Permission | `instructor_profile.read.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`.

**Request body** — none.

### Responses

#### 200 OK

Full `InstructorProfileDto` in `data`.

```json
{
  "success": true,
  "message": "OK",
  "data": { /* full InstructorProfileDto */ }
}
```

#### 404 Not Found — caller has no instructor profile yet

```json
{
  "success": false,
  "message": "You do not have an instructor profile yet. Contact your administrator.",
  "code": "NOT_FOUND"
}
```

#### 403 Forbidden — student/employee role

```json
{
  "success": false,
  "message": "Only instructors may access their own profile",
  "code": "FORBIDDEN"
}
```

---

## 1.7 `PATCH /api/v1/instructor-profiles/me`

Self-service partial update. Instructors can only update their own non-sensitive fields; approval, verification, featured, and rating fields are admin-only. Provide at least one field (empty body → `400 VALIDATION_ERROR`).

| Field | Value |
|---|---|
| Method | `PATCH` |
| URL | `{{baseUrl}}/api/v1/instructor-profiles/me` |
| Permission | `instructor_profile.update.own` |

**Headers** — `Authorization: Bearer {{accessToken}}`, `Content-Type: application/json`.

**Allowed fields for self-service:**
`instructorType`, `designationId`, `departmentId`, `branchId`, `joiningDate`, `specializationId`, `secondarySpecializationId`, `teachingExperienceYears`, `industryExperienceYears`, `totalExperienceYears`, `preferredTeachingLanguageId`, `teachingMode`, `instructorBio`, `tagline`, `demoVideoUrl`, `introVideoDurationSec`, `highestQualification`, `certificationsSummary`, `awardsAndRecognition`, `isAvailable`, `availableHoursPerWeek`, `availableFrom`, `availableUntil`, `preferredTimeSlots`, `maxConcurrentCourses`, `paymentModel`, `revenueSharePercentage`, `fixedRatePerCourse`, `hourlyRate`, `paymentCurrency`.

**Forbidden fields** (attempt triggers 403): `approvalStatus`, `approvedBy`, `approvedAt`, `rejectionReason`, `isVerified`, `isFeatured`, `badge`, `publicationsCount`, `patentsCount`, `totalCoursesCreated`, `totalCoursesPublished`, `totalStudentsTaught`, `totalReviewsReceived`, `averageRating`, `totalTeachingHours`, `totalContentMinutes`, `completionRate`.

Example:

```json
{
  "teachingMode": "hybrid",
  "instructorBio": "Updated bio with new achievements",
  "certificationsSummary": "AWS Certified Solutions Architect, GCP Professional, Kubernetes Expert",
  "isAvailable": true,
  "availableHoursPerWeek": 22,
  "maxConcurrentCourses": 4
}
```

### Responses

#### 200 OK

Full updated `InstructorProfileDto` in `data`.

#### 400 Validation error — empty body

```json
{
  "success": false,
  "message": "Validation error: At least one field is required",
  "code": "VALIDATION_ERROR"
}
```

#### 403 Forbidden — attempt to update admin-only field

```json
{
  "success": false,
  "message": "Forbidden: Field 'approvalStatus' is admin-only",
  "code": "FORBIDDEN"
}
```

#### 403 Forbidden — student/employee role

```json
{
  "success": false,
  "message": "Only instructors may update their own profile",
  "code": "FORBIDDEN"
}
```

#### 404 Not Found — caller has no instructor profile

```json
{
  "success": false,
  "message": "You do not have an instructor profile yet. Contact your administrator.",
  "code": "NOT_FOUND"
}
```

---

## Enums (CHECK constraints)

### instructorType
- `internal` — Full-time, employed instructor.
- `external` — Part-time or contract instructor.
- `guest` — Guest lecturer or visiting instructor.
- `visiting` — Visiting professor or faculty.
- `corporate` — Corporate trainer or training partner.
- `community` — Community expert or volunteer.
- `other` — Other instructor type.

### teachingMode
- `online` — Fully online/remote instruction.
- `offline` — In-person classroom instruction.
- `hybrid` — Mix of online and in-person sessions.
- `recorded_only` — Pre-recorded content delivery.

### paymentModel
- `revenue_share` — Revenue sharing arrangement.
- `fixed_per_course` — Fixed amount per course created/taught.
- `hourly` — Hourly rate compensation.
- `monthly_salary` — Monthly salary arrangement.
- `per_student` — Per-student enrollment fee.
- `hybrid` — Mix of payment models.
- `volunteer` — Volunteer (no compensation).
- `other` — Other payment arrangement.

### approvalStatus
- `pending` — Awaiting review.
- `under_review` — Currently being reviewed.
- `approved` — Approved to teach courses.
- `rejected` — Rejected and not approved to teach.
- `suspended` — Temporarily suspended.
- `blacklisted` — Permanently blacklisted.

### badge
- `new` — New instructor (< 3 months).
- `rising` — Rising star instructor (high engagement, growth potential).
- `popular` — Popular instructor (high enrollment).
- `top_rated` — Top-rated instructor (average rating >= 4.5).
- `expert` — Expert instructor (extensive experience or publications).
- `elite` — Elite instructor (exclusive or award-winning).

---

## DTO reference

`InstructorProfileDto` is the standard response envelope for instructor profiles. The full TypeScript definition lives in [`api/src/modules/instructor-profiles/instructor-profiles.service.ts`](../../../api/src/modules/instructor-profiles/instructor-profiles.service.ts). Top-level keys:

| Key | Purpose |
|---|---|
| `id`, `userId` | Primary keys — profile id and owning user id (1:1). |
| `instructorCode` | Unique instructor identifier string. |
| `instructorType` | Enum: `internal`, `external`, `guest`, `visiting`, `corporate`, `community`, `other`. |
| `designationId`, `designationName` | Designation reference and resolved name. |
| `departmentId`, `departmentName` | Department reference and resolved name. |
| `branchId`, `branchName` | Branch reference and resolved name. |
| `joiningDate` | Date when instructor joined. |
| `specializationId`, `specializationName`, `specializationCategory` | Primary specialization reference and resolved info. |
| `secondarySpecializationId`, `secondarySpecializationName`, `secondarySpecializationCategory` | Secondary specialization reference and resolved info. |
| `teachingExperienceYears` | Years of teaching experience. |
| `industryExperienceYears` | Years of industry/professional experience. |
| `totalExperienceYears` | Total combined experience in years. |
| `preferredTeachingLanguageId`, `preferredTeachingLanguageName` | Preferred teaching language reference and name. |
| `teachingMode` | Enum: `online`, `offline`, `hybrid`, `recorded_only`. |
| `instructorBio` | Professional biography or description. |
| `tagline` | Short tagline or motto. |
| `demoVideoUrl` | URL to demo or introduction video. |
| `introVideoDurationSec` | Duration of intro video in seconds. |
| `highestQualification` | Highest educational qualification (e.g., Ph.D., M.Tech). |
| `certificationsSummary` | List of relevant certifications. |
| `awardsAndRecognition` | Awards, recognitions, or honors received. |
| `isAvailable` | Boolean flag for availability status. |
| `availableHoursPerWeek` | Weekly hours available for teaching. |
| `availableFrom`, `availableUntil` | Date range for availability. |
| `preferredTimeSlots` | Preferred time slots for teaching (e.g., weekday_mornings, weekends). |
| `maxConcurrentCourses` | Maximum number of concurrent courses instructor can teach. |
| `paymentModel` | Enum: `revenue_share`, `fixed_per_course`, `hourly`, `monthly_salary`, `per_student`, `hybrid`, `volunteer`, `other`. |
| `revenueSharePercentage` | Revenue share percentage (0-100). |
| `fixedRatePerCourse` | Fixed rate per course (decimal). |
| `hourlyRate` | Hourly rate (decimal). |
| `paymentCurrency` | Currency code (e.g., INR, USD). |
| `publicationsCount` | Number of publications authored. |
| `patentsCount` | Number of patents or intellectual property. |
| `totalCoursesCreated` | Total courses authored/created. |
| `totalCoursesPublished` | Total courses published/live. |
| `totalStudentsTaught` | Total number of students taught. |
| `totalReviewsReceived` | Total review count. |
| `averageRating` | Average rating on 0-5 scale. |
| `totalTeachingHours` | Cumulative teaching hours. |
| `totalContentMinutes` | Cumulative content/course minutes created. |
| `completionRate` | Student completion rate (0-1 scale). |
| `approvalStatus` | Enum: `pending`, `under_review`, `approved`, `rejected`, `suspended`, `blacklisted`. |
| `approvedBy` | User ID of the approver. |
| `approvedAt` | Timestamp of approval. |
| `rejectionReason` | Reason for rejection if applicable. |
| `isVerified` | Boolean flag for verified instructor status. |
| `isFeatured` | Boolean flag for featured instructor status. |
| `badge` | Enum: `new`, `rising`, `popular`, `top_rated`, `expert`, `elite` (nullable). |
| `isActive` | Activity status flag (inherited from parent users row). |
| `createdBy`, `updatedBy`, `createdAt`, `updatedAt` | Audit trail. |
| `isDeleted` | Hard-delete flag. |
| `userIsActive` | Inherited active status from parent users row. |
| `user` | Nested owner summary (name, email, role, mobile, verification flags). |
| `specialization` | Nested primary specialization object (id, name, category). |
| `secondarySpecialization` | Nested secondary specialization object (id, name, category). |
| `designation` | Nested designation object (id, name). |
| `department` | Nested department object (id, name). |
| `branch` | Nested branch object (id, name). |
| `preferredTeachingLanguage` | Nested preferred teaching language object (id, name). |
| `approver` | Nested approver user summary (firstName, lastName, email) when approval has occurred. |

← [00 overview](00%20-%20overview.md) · **Next →** [02 walkthrough and index](02%20-%20walkthrough%20and%20index.md)
