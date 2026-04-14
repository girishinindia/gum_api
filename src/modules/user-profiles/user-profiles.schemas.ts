// ═══════════════════════════════════════════════════════════════
// Zod schemas for /api/v1/user-profiles (phase 04).
//
// Mirrors:
//   • udf_get_user_profiles
//   • udf_insert_user_profiles
//   • udf_update_user_profiles
//   • udf_delete_user_profiles
//
// Two update bodies are exported on purpose:
//
//   updateUserProfileBodySchema         — admin/super-admin full-write.
//                                         Exposes every column the UDF
//                                         accepts, including KYC + bank.
//
//   updateMyUserProfileBodySchema       — self-service (PATCH /me).
//                                         Blocks KYC fields (aadhar,
//                                         pan, passport), bank details,
//                                         GST, and completion flags so
//                                         users can't self-escalate
//                                         sensitive state. If a student
//                                         needs those fields changed,
//                                         they must go through an
//                                         admin-operated PATCH /:id.
//
// Note: `user_profiles` is a 1:1 detail table. It has NO is_active /
// is_deleted columns of its own — status is inherited from the parent
// users row. That is why there's no isActive flag here and why there
// is no restore endpoint.
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

import {
  bigintIdSchema,
  emailSchema,
  paginationSchema,
  queryBooleanSchema,
  searchTermSchema
} from '../../shared/validation/common';

// ─── Atoms ───────────────────────────────────────────────────────

export const USER_PROFILE_GENDER = ['male', 'female', 'other'] as const;
const genderSchema = z.enum(USER_PROFILE_GENDER);

export const USER_PROFILE_BLOOD_GROUP = [
  'A+', 'A-',
  'B+', 'B-',
  'AB+', 'AB-',
  'O+', 'O-'
] as const;
const bloodGroupSchema = z.enum(USER_PROFILE_BLOOD_GROUP);

export const USER_PROFILE_MARITAL_STATUS = [
  'single',
  'married',
  'divorced',
  'widowed',
  'prefer_not_to_say'
] as const;
const maritalStatusSchema = z.enum(USER_PROFILE_MARITAL_STATUS);

export const USER_PROFILE_EMERGENCY_RELATION = [
  'father',
  'mother',
  'spouse',
  'sibling',
  'friend',
  'colleague',
  'guardian',
  'other'
] as const;
const emergencyRelationSchema = z.enum(USER_PROFILE_EMERGENCY_RELATION);

export const USER_PROFILE_BANK_ACCOUNT_TYPE = [
  'savings',
  'current',
  'salary',
  'nre',
  'nro',
  'other'
] as const;
const bankAccountTypeSchema = z.enum(USER_PROFILE_BANK_ACCOUNT_TYPE);

export const USER_PROFILE_THEME = ['light', 'dark', 'system'] as const;
const themeSchema = z.enum(USER_PROFILE_THEME);

// Free-text atoms (all trimmed)
const shortText = z.string().trim().min(1).max(255);
const longText = z.string().trim().min(1).max(4000);
const pincodeSchema = z
  .string()
  .trim()
  .min(3, 'pincode is too short')
  .max(16, 'pincode is too long');

const mobileLikeSchema = z
  .string()
  .trim()
  .min(8, 'phone is too short')
  .max(20, 'phone is too long')
  .regex(/^\+?[0-9 ()\-]+$/, 'must be a valid phone number');

const urlSchema = z.string().trim().url('must be a valid URL').max(1024);

// ISO date string (YYYY-MM-DD). The DB column is DATE, not TIMESTAMPTZ,
// so we keep the string shape and let pg coerce it.
const dateOfBirthSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_of_birth must be YYYY-MM-DD');

// KYC atoms (intentionally permissive — the API is an input gate, the
// UDF + downstream validators are the source of truth).
const aadharSchema = z.string().trim().min(4).max(32);
const panSchema = z
  .string()
  .trim()
  .min(10)
  .max(10)
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'pan must be 10 chars — ABCDE1234F');
const passportSchema = z.string().trim().min(5).max(32);

const bankAccountNumberSchema = z.string().trim().min(4).max(32);
const bankIfscSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'ifsc must be 11 chars — ABCD0XXXXXX');

const upiIdSchema = z.string().trim().max(64);
const gstSchema = z
  .string()
  .trim()
  .regex(
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
    'gst must be a valid 15-char GSTIN'
  );

const timezoneSchema = z.string().trim().min(3).max(64);

const completionSchema = z.coerce
  .number({ invalid_type_error: 'profile_completion must be a number' })
  .int('profile_completion must be an integer')
  .min(0, 'profile_completion must be ≥ 0')
  .max(100, 'profile_completion must be ≤ 100');

// ─── Sort allowlist ──────────────────────────────────────────────
// Must stay in sync with udf_get_user_profiles' CASE whitelist.

export const USER_PROFILE_SORT_COLUMNS = [
  'profile_id',
  'user_id',
  'date_of_birth',
  'gender',
  'nationality',
  'profile_completion',
  'created_at',
  'updated_at',
  'first_name',
  'last_name',
  'role',
  'user_is_active',
  'country_name'
] as const;

const sortColumnSchema = z.enum(USER_PROFILE_SORT_COLUMNS).default('profile_id');

const sortDirectionSchema = z
  .enum(['asc', 'desc', 'ASC', 'DESC'])
  .default('ASC')
  .transform((v) => v.toUpperCase() as 'ASC' | 'DESC');

// ─── List query ──────────────────────────────────────────────────

export const listUserProfilesQuerySchema = paginationSchema.extend({
  // Profile filters
  gender: genderSchema.optional(),
  bloodGroup: bloodGroupSchema.optional(),
  maritalStatus: maritalStatusSchema.optional(),
  nationality: z.string().trim().min(2).max(64).optional(),
  isProfileComplete: queryBooleanSchema.optional(),

  // User (inherited) filters
  userRole: z.string().trim().min(2).max(64).optional(),
  userIsActive: queryBooleanSchema.optional(),

  // Permanent-address geography filters
  countryId: bigintIdSchema.optional(),
  stateId: bigintIdSchema.optional(),
  cityId: bigintIdSchema.optional(),

  // Preference filters
  preferredLanguageId: bigintIdSchema.optional(),
  themePreference: themeSchema.optional(),

  // Inheritance escape hatch — admin audit view
  includeDeletedUser: queryBooleanSchema.optional(),

  searchTerm: searchTermSchema,
  sortColumn: sortColumnSchema,
  sortDirection: sortDirectionSchema
});
export type ListUserProfilesQuery = z.infer<typeof listUserProfilesQuerySchema>;

// ─── Shared profile field map ────────────────────────────────────
// Used by both create (all optional except user_id) and update.

const profileCoreFields = {
  dateOfBirth: dateOfBirthSchema.optional(),
  gender: genderSchema.optional(),
  bloodGroup: bloodGroupSchema.optional(),
  maritalStatus: maritalStatusSchema.optional(),
  nationality: shortText.optional(),
  about: longText.optional(),
  headline: shortText.optional(),

  // Permanent address
  addressLine1: shortText.optional(),
  addressLine2: shortText.optional(),
  landmark: shortText.optional(),
  countryId: bigintIdSchema.optional(),
  stateId: bigintIdSchema.optional(),
  cityId: bigintIdSchema.optional(),
  pincode: pincodeSchema.optional(),

  // Current address
  currentAddressLine1: shortText.optional(),
  currentAddressLine2: shortText.optional(),
  currentLandmark: shortText.optional(),
  currentCountryId: bigintIdSchema.optional(),
  currentStateId: bigintIdSchema.optional(),
  currentCityId: bigintIdSchema.optional(),
  currentPincode: pincodeSchema.optional(),
  isSameAsPermanent: z.boolean().optional(),

  // Contact
  alternateEmail: emailSchema.optional(),
  alternateMobile: mobileLikeSchema.optional(),
  whatsappNumber: mobileLikeSchema.optional(),

  // Emergency
  emergencyContactName: shortText.optional(),
  emergencyContactPhone: mobileLikeSchema.optional(),
  emergencyContactRelation: emergencyRelationSchema.optional(),

  // Preferences
  preferredLanguageId: bigintIdSchema.optional(),
  timezone: timezoneSchema.optional(),
  themePreference: themeSchema.optional(),
  emailNotifications: z.boolean().optional(),
  smsNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional()
};

// Sensitive fields — admin-only on PATCH /me (student/instructor cannot
// set their own KYC, bank, or profile completion via self-service).
const profileSensitiveFields = {
  aadharNumber: aadharSchema.optional(),
  panNumber: panSchema.optional(),
  passportNumber: passportSchema.optional(),

  bankName: shortText.optional(),
  bankAccountNumber: bankAccountNumberSchema.optional(),
  bankIfscCode: bankIfscSchema.optional(),
  bankBranch: shortText.optional(),
  bankAccountType: bankAccountTypeSchema.optional(),
  upiId: upiIdSchema.optional(),
  gstNumber: gstSchema.optional(),

  profileCompletion: completionSchema.optional(),
  isProfileComplete: z.boolean().optional()
};

// ─── Create body (admin-only POST /) ─────────────────────────────
//
// `userId` is required — admin explicitly chooses which user's
// profile to create. The /me convenience route uses a separate
// wrapper that forces userId = req.user.id.

export const createUserProfileBodySchema = z.object({
  userId: bigintIdSchema,
  ...profileCoreFields,
  ...profileSensitiveFields
});
export type CreateUserProfileBody = z.infer<typeof createUserProfileBodySchema>;

// POST /me body — same shape minus userId (derived from req.user.id)
// and minus sensitive fields (no self-service KYC on create).
export const createMyUserProfileBodySchema = z.object({
  ...profileCoreFields
});
export type CreateMyUserProfileBody = z.infer<typeof createMyUserProfileBodySchema>;

// ─── Update body: admin (full) ───────────────────────────────────
//
// NOTE: The "at-least-one-field" check is intentionally NOT enforced
// here. PATCH /:id and PATCH /me accept multipart/form-data with an
// optional `profilePhoto` / `coverPhoto` file slot, so the body can
// legitimately be empty when the caller is only uploading photos.
// The route handler performs the combined check
// `hasTextChange || hasFile` and throws 400 if both are missing.

export const updateUserProfileBodySchema = z.object({
  ...profileCoreFields,
  ...profileSensitiveFields
});
export type UpdateUserProfileBody = z.infer<typeof updateUserProfileBodySchema>;

// ─── Update body: self (safe subset) ─────────────────────────────
//
// Admin-only fields (KYC, bank, GST, completion flags) are blocked
// at the schema level. If a student supplies them in the body, zod
// rejects with 400 VALIDATION_ERROR — no silent drop.
//
// See the note above `updateUserProfileBodySchema` re: the
// "at-least-one-field" refine — it lives in the route handler so
// photo-only multipart updates don't fail validation.

export const updateMyUserProfileBodySchema = z
  .object({
    ...profileCoreFields
  })
  .strict();
export type UpdateMyUserProfileBody = z.infer<typeof updateMyUserProfileBodySchema>;
