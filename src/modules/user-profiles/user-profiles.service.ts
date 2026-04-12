// ═══════════════════════════════════════════════════════════════
// user-profiles.service — UDF wrappers for /api/v1/user-profiles.
//
// Talks to phase-04 UDFs:
//   - udf_get_user_profiles        (read / list — single + filter modes)
//   - udf_insert_user_profiles     (create, 1:1 with users)
//   - udf_update_user_profiles     (partial update, COALESCE pattern)
//   - udf_delete_user_profiles     (hard delete — profile only, parent
//                                   users row is untouched)
//
// Inheritance model:
//   user_profiles has no is_active / is_deleted columns of its own.
//   The DTO surfaces the parent user's `isActive` / `isDeleted` flags
//   as `userIsActive` / `userIsDeleted` so callers know whether the
//   owning account is still live. There is no restore() path —
//   re-create via createUserProfile after a delete.
// ═══════════════════════════════════════════════════════════════

import { db } from '../../database/db';
import type { PaginationMeta } from '../../core/types/common.types';
import { buildPaginationMeta } from '../../core/utils/api-response';

import type {
  CreateMyUserProfileBody,
  CreateUserProfileBody,
  ListUserProfilesQuery,
  UpdateMyUserProfileBody,
  UpdateUserProfileBody
} from './user-profiles.schemas';

// ─── DTO ─────────────────────────────────────────────────────────

export interface UserProfilePermanentAddressDto {
  addressLine1: string | null;
  addressLine2: string | null;
  landmark: string | null;
  countryId: number | null;
  stateId: number | null;
  cityId: number | null;
  pincode: string | null;
  countryName: string | null;
  stateName: string | null;
  cityName: string | null;
}

export interface UserProfileCurrentAddressDto {
  addressLine1: string | null;
  addressLine2: string | null;
  landmark: string | null;
  countryId: number | null;
  stateId: number | null;
  cityId: number | null;
  pincode: string | null;
  countryName: string | null;
  stateName: string | null;
  cityName: string | null;
  isSameAsPermanent: boolean;
}

export interface UserProfileContactDto {
  alternateEmail: string | null;
  alternateMobile: string | null;
  whatsappNumber: string | null;
}

export interface UserProfileEmergencyDto {
  name: string | null;
  phone: string | null;
  relation: string | null;
}

export interface UserProfileKycDto {
  aadharNumber: string | null;
  panNumber: string | null;
  passportNumber: string | null;
}

export interface UserProfileBankDto {
  name: string | null;
  accountNumber: string | null;
  ifscCode: string | null;
  branch: string | null;
  accountType: string | null;
  upiId: string | null;
  gstNumber: string | null;
}

export interface UserProfilePreferencesDto {
  preferredLanguageId: number | null;
  preferredLanguageName: string | null;
  preferredLanguageNativeName: string | null;
  timezone: string | null;
  themePreference: string | null;
  emailNotifications: boolean;
  smsNotifications: boolean;
  pushNotifications: boolean;
}

export interface UserProfileOwnerDto {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  mobile: string | null;
  roleId: number;
  roleCode: string;
  roleName: string;
  isActive: boolean;
  isDeleted: boolean;
  isEmailVerified: boolean;
  isMobileVerified: boolean;
  countryName: string | null;
  countryIso2: string | null;
  countryPhoneCode: string | null;
}

export interface UserProfileDto {
  id: number;
  userId: number;
  dateOfBirth: string | null;
  gender: string | null;
  bloodGroup: string | null;
  maritalStatus: string | null;
  nationality: string | null;
  about: string | null;
  headline: string | null;
  profilePhotoUrl: string | null;
  coverPhotoUrl: string | null;

  permanentAddress: UserProfilePermanentAddressDto;
  currentAddress: UserProfileCurrentAddressDto;

  contact: UserProfileContactDto;
  emergency: UserProfileEmergencyDto;
  kyc: UserProfileKycDto;
  bank: UserProfileBankDto;
  preferences: UserProfilePreferencesDto;

  profileCompletion: number;
  isProfileComplete: boolean;

  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string | null;
  updatedAt: string | null;

  // Inherited status (from parent users row)
  userIsActive: boolean;
  userIsDeleted: boolean;

  user: UserProfileOwnerDto;
}

// ─── Row shape returned by udf_get_user_profiles ─────────────────

interface UserProfileRow {
  profile_id: number | string;
  profile_user_id: number | string;
  profile_date_of_birth: Date | string | null;
  profile_gender: string | null;
  profile_blood_group: string | null;
  profile_marital_status: string | null;
  profile_nationality: string | null;
  profile_about: string | null;
  profile_headline: string | null;
  profile_photo_url: string | null;
  profile_cover_photo_url: string | null;

  profile_address_line_1: string | null;
  profile_address_line_2: string | null;
  profile_landmark: string | null;
  profile_country_id: number | string | null;
  profile_state_id: number | string | null;
  profile_city_id: number | string | null;
  profile_pincode: string | null;

  profile_current_address_line_1: string | null;
  profile_current_address_line_2: string | null;
  profile_current_landmark: string | null;
  profile_current_country_id: number | string | null;
  profile_current_state_id: number | string | null;
  profile_current_city_id: number | string | null;
  profile_current_pincode: string | null;
  profile_is_same_as_permanent: boolean;

  profile_alternate_email: string | null;
  profile_alternate_mobile: string | null;
  profile_whatsapp_number: string | null;

  profile_emergency_contact_name: string | null;
  profile_emergency_contact_phone: string | null;
  profile_emergency_contact_relation: string | null;

  profile_aadhar_number: string | null;
  profile_pan_number: string | null;
  profile_passport_number: string | null;

  profile_bank_name: string | null;
  profile_bank_account_number: string | null;
  profile_bank_ifsc_code: string | null;
  profile_bank_branch: string | null;
  profile_bank_account_type: string | null;
  profile_upi_id: string | null;
  profile_gst_number: string | null;

  profile_preferred_language_id: number | string | null;
  profile_timezone: string | null;
  profile_theme_preference: string | null;
  profile_email_notifications: boolean;
  profile_sms_notifications: boolean;
  profile_push_notifications: boolean;

  profile_completion: number;
  profile_is_complete: boolean;

  profile_created_by: number | string | null;
  profile_updated_by: number | string | null;
  profile_created_at: Date | string | null;
  profile_updated_at: Date | string | null;

  user_first_name: string;
  user_last_name: string;
  user_email: string | null;
  user_mobile: string | null;
  user_role_id: number | string;
  user_role: string;
  user_role_name: string;
  user_is_active: boolean;
  user_is_deleted: boolean;
  user_is_email_verified: boolean;
  user_is_mobile_verified: boolean;

  user_country_name: string | null;
  user_country_iso2: string | null;
  user_country_phone_code: string | null;

  perm_country_name: string | null;
  perm_state_name: string | null;
  perm_city_name: string | null;

  curr_country_name: string | null;
  curr_state_name: string | null;
  curr_city_name: string | null;

  preferred_language_name: string | null;
  preferred_language_native_name: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────

const toIso = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return new Date(v).toISOString();
};

// Date-of-birth is a pg DATE, not a timestamp — normalise to
// YYYY-MM-DD so the wire contract stays date-only.
const toIsoDate = (v: Date | string | null): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  // Already date-only?
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return new Date(s).toISOString().slice(0, 10);
};

const toNumOrNull = (v: number | string | null | undefined): number | null =>
  v == null ? null : Number(v);

const mapUserProfile = (row: UserProfileRow): UserProfileDto => ({
  id: Number(row.profile_id),
  userId: Number(row.profile_user_id),
  dateOfBirth: toIsoDate(row.profile_date_of_birth),
  gender: row.profile_gender,
  bloodGroup: row.profile_blood_group,
  maritalStatus: row.profile_marital_status,
  nationality: row.profile_nationality,
  about: row.profile_about,
  headline: row.profile_headline,
  profilePhotoUrl: row.profile_photo_url,
  coverPhotoUrl: row.profile_cover_photo_url,

  permanentAddress: {
    addressLine1: row.profile_address_line_1,
    addressLine2: row.profile_address_line_2,
    landmark: row.profile_landmark,
    countryId: toNumOrNull(row.profile_country_id),
    stateId: toNumOrNull(row.profile_state_id),
    cityId: toNumOrNull(row.profile_city_id),
    pincode: row.profile_pincode,
    countryName: row.perm_country_name,
    stateName: row.perm_state_name,
    cityName: row.perm_city_name
  },

  currentAddress: {
    addressLine1: row.profile_current_address_line_1,
    addressLine2: row.profile_current_address_line_2,
    landmark: row.profile_current_landmark,
    countryId: toNumOrNull(row.profile_current_country_id),
    stateId: toNumOrNull(row.profile_current_state_id),
    cityId: toNumOrNull(row.profile_current_city_id),
    pincode: row.profile_current_pincode,
    countryName: row.curr_country_name,
    stateName: row.curr_state_name,
    cityName: row.curr_city_name,
    isSameAsPermanent: row.profile_is_same_as_permanent
  },

  contact: {
    alternateEmail: row.profile_alternate_email,
    alternateMobile: row.profile_alternate_mobile,
    whatsappNumber: row.profile_whatsapp_number
  },

  emergency: {
    name: row.profile_emergency_contact_name,
    phone: row.profile_emergency_contact_phone,
    relation: row.profile_emergency_contact_relation
  },

  kyc: {
    aadharNumber: row.profile_aadhar_number,
    panNumber: row.profile_pan_number,
    passportNumber: row.profile_passport_number
  },

  bank: {
    name: row.profile_bank_name,
    accountNumber: row.profile_bank_account_number,
    ifscCode: row.profile_bank_ifsc_code,
    branch: row.profile_bank_branch,
    accountType: row.profile_bank_account_type,
    upiId: row.profile_upi_id,
    gstNumber: row.profile_gst_number
  },

  preferences: {
    preferredLanguageId: toNumOrNull(row.profile_preferred_language_id),
    preferredLanguageName: row.preferred_language_name,
    preferredLanguageNativeName: row.preferred_language_native_name,
    timezone: row.profile_timezone,
    themePreference: row.profile_theme_preference,
    emailNotifications: row.profile_email_notifications,
    smsNotifications: row.profile_sms_notifications,
    pushNotifications: row.profile_push_notifications
  },

  profileCompletion: row.profile_completion,
  isProfileComplete: row.profile_is_complete,

  createdBy: toNumOrNull(row.profile_created_by),
  updatedBy: toNumOrNull(row.profile_updated_by),
  createdAt: toIso(row.profile_created_at),
  updatedAt: toIso(row.profile_updated_at),

  userIsActive: row.user_is_active,
  userIsDeleted: row.user_is_deleted,

  user: {
    id: Number(row.profile_user_id),
    firstName: row.user_first_name,
    lastName: row.user_last_name,
    email: row.user_email,
    mobile: row.user_mobile,
    roleId: Number(row.user_role_id),
    roleCode: row.user_role,
    roleName: row.user_role_name,
    isActive: row.user_is_active,
    isDeleted: row.user_is_deleted,
    isEmailVerified: row.user_is_email_verified,
    isMobileVerified: row.user_is_mobile_verified,
    countryName: row.user_country_name,
    countryIso2: row.user_country_iso2,
    countryPhoneCode: row.user_country_phone_code
  }
});

// ─── List ────────────────────────────────────────────────────────

export interface ListUserProfilesResult {
  rows: UserProfileDto[];
  meta: PaginationMeta;
}

export const listUserProfiles = async (
  q: ListUserProfilesQuery
): Promise<ListUserProfilesResult> => {
  const { rows, totalCount } = await db.callTableFunction<UserProfileRow>(
    'udf_get_user_profiles',
    {
      p_sort_column: q.sortColumn,
      p_sort_direction: q.sortDirection,
      p_filter_gender: q.gender ?? null,
      p_filter_blood_group: q.bloodGroup ?? null,
      p_filter_marital_status: q.maritalStatus ?? null,
      p_filter_nationality: q.nationality ?? null,
      p_filter_is_profile_complete: q.isProfileComplete ?? null,
      p_filter_user_role: q.userRole ?? null,
      p_filter_user_is_active: q.userIsActive ?? null,
      p_filter_country_id: q.countryId ?? null,
      p_filter_state_id: q.stateId ?? null,
      p_filter_city_id: q.cityId ?? null,
      p_filter_preferred_language_id: q.preferredLanguageId ?? null,
      p_filter_theme_preference: q.themePreference ?? null,
      p_include_deleted_user: q.includeDeletedUser ?? null,
      p_search_term: q.searchTerm ?? null,
      p_page_index: q.pageIndex,
      p_page_size: q.pageSize
    }
  );

  return {
    rows: rows.map(mapUserProfile),
    meta: buildPaginationMeta(q.pageIndex, q.pageSize, totalCount)
  };
};

// ─── Get by profile id ───────────────────────────────────────────

export const getUserProfileById = async (
  id: number
): Promise<UserProfileDto | null> => {
  const { rows } = await db.callTableFunction<UserProfileRow>(
    'udf_get_user_profiles',
    { p_id: id }
  );
  const row = rows[0];
  return row ? mapUserProfile(row) : null;
};

// ─── Get by user id (1:1 lookup) ─────────────────────────────────

export const getUserProfileByUserId = async (
  userId: number
): Promise<UserProfileDto | null> => {
  const { rows } = await db.callTableFunction<UserProfileRow>(
    'udf_get_user_profiles',
    { p_user_id: userId }
  );
  const row = rows[0];
  return row ? mapUserProfile(row) : null;
};

// ─── Create ──────────────────────────────────────────────────────

export interface CreateUserProfileResult {
  id: number;
}

/**
 * Build the full parameter map for `udf_insert_user_profiles`.
 * The UDF uses COALESCE-style NULL handling, so passing `null` for
 * anything that's `undefined` on the body is intentional.
 */
const buildInsertParams = (
  userId: number,
  body: Partial<CreateUserProfileBody>,
  callerId: number | null
): Record<string, unknown> => ({
  p_user_id: userId,
  p_date_of_birth: body.dateOfBirth ?? null,
  p_gender: body.gender ?? null,
  p_blood_group: body.bloodGroup ?? null,
  p_marital_status: body.maritalStatus ?? null,
  p_nationality: body.nationality ?? null,
  p_about: body.about ?? null,
  p_headline: body.headline ?? null,
  p_profile_photo_url: body.profilePhotoUrl ?? null,
  p_cover_photo_url: body.coverPhotoUrl ?? null,

  p_address_line_1: body.addressLine1 ?? null,
  p_address_line_2: body.addressLine2 ?? null,
  p_landmark: body.landmark ?? null,
  p_country_id: body.countryId ?? null,
  p_state_id: body.stateId ?? null,
  p_city_id: body.cityId ?? null,
  p_pincode: body.pincode ?? null,

  p_current_address_line_1: body.currentAddressLine1 ?? null,
  p_current_address_line_2: body.currentAddressLine2 ?? null,
  p_current_landmark: body.currentLandmark ?? null,
  p_current_country_id: body.currentCountryId ?? null,
  p_current_state_id: body.currentStateId ?? null,
  p_current_city_id: body.currentCityId ?? null,
  p_current_pincode: body.currentPincode ?? null,
  p_is_same_as_permanent: body.isSameAsPermanent ?? null,

  p_alternate_email: body.alternateEmail ?? null,
  p_alternate_mobile: body.alternateMobile ?? null,
  p_whatsapp_number: body.whatsappNumber ?? null,

  p_emergency_contact_name: body.emergencyContactName ?? null,
  p_emergency_contact_phone: body.emergencyContactPhone ?? null,
  p_emergency_contact_relation: body.emergencyContactRelation ?? null,

  p_aadhar_number: body.aadharNumber ?? null,
  p_pan_number: body.panNumber ?? null,
  p_passport_number: body.passportNumber ?? null,

  p_bank_name: body.bankName ?? null,
  p_bank_account_number: body.bankAccountNumber ?? null,
  p_bank_ifsc_code: body.bankIfscCode ?? null,
  p_bank_branch: body.bankBranch ?? null,
  p_bank_account_type: body.bankAccountType ?? null,
  p_upi_id: body.upiId ?? null,
  p_gst_number: body.gstNumber ?? null,

  p_preferred_language_id: body.preferredLanguageId ?? null,
  p_timezone: body.timezone ?? null,
  p_theme_preference: body.themePreference ?? null,
  p_email_notifications: body.emailNotifications ?? null,
  p_sms_notifications: body.smsNotifications ?? null,
  p_push_notifications: body.pushNotifications ?? null,

  p_profile_completion: body.profileCompletion ?? null,
  p_is_profile_complete: body.isProfileComplete ?? null,

  p_actor_id: callerId
});

export const createUserProfile = async (
  body: CreateUserProfileBody,
  callerId: number | null
): Promise<CreateUserProfileResult> => {
  const result = await db.callFunction(
    'udf_insert_user_profiles',
    buildInsertParams(body.userId, body, callerId)
  );
  return { id: Number(result.id) };
};

/**
 * /me wrapper — self-service create. Forces `userId` = callerId and
 * rejects sensitive fields because the schema layer already stripped
 * them.
 */
export const createMyUserProfile = async (
  userId: number,
  body: CreateMyUserProfileBody
): Promise<CreateUserProfileResult> => {
  const result = await db.callFunction(
    'udf_insert_user_profiles',
    buildInsertParams(userId, body, userId)
  );
  return { id: Number(result.id) };
};

// ─── Update ──────────────────────────────────────────────────────

/**
 * Build the full parameter map for `udf_update_user_profiles`. The
 * UDF uses COALESCE for every field, so passing `null` means "leave
 * as-is".
 */
const buildUpdateParams = (
  id: number,
  body: Partial<UpdateUserProfileBody>,
  callerId: number | null
): Record<string, unknown> => ({
  p_id: id,
  p_date_of_birth: body.dateOfBirth ?? null,
  p_gender: body.gender ?? null,
  p_blood_group: body.bloodGroup ?? null,
  p_marital_status: body.maritalStatus ?? null,
  p_nationality: body.nationality ?? null,
  p_about: body.about ?? null,
  p_headline: body.headline ?? null,
  p_profile_photo_url: body.profilePhotoUrl ?? null,
  p_cover_photo_url: body.coverPhotoUrl ?? null,

  p_address_line_1: body.addressLine1 ?? null,
  p_address_line_2: body.addressLine2 ?? null,
  p_landmark: body.landmark ?? null,
  p_country_id: body.countryId ?? null,
  p_state_id: body.stateId ?? null,
  p_city_id: body.cityId ?? null,
  p_pincode: body.pincode ?? null,

  p_current_address_line_1: body.currentAddressLine1 ?? null,
  p_current_address_line_2: body.currentAddressLine2 ?? null,
  p_current_landmark: body.currentLandmark ?? null,
  p_current_country_id: body.currentCountryId ?? null,
  p_current_state_id: body.currentStateId ?? null,
  p_current_city_id: body.currentCityId ?? null,
  p_current_pincode: body.currentPincode ?? null,
  p_is_same_as_permanent: body.isSameAsPermanent ?? null,

  p_alternate_email: body.alternateEmail ?? null,
  p_alternate_mobile: body.alternateMobile ?? null,
  p_whatsapp_number: body.whatsappNumber ?? null,

  p_emergency_contact_name: body.emergencyContactName ?? null,
  p_emergency_contact_phone: body.emergencyContactPhone ?? null,
  p_emergency_contact_relation: body.emergencyContactRelation ?? null,

  p_aadhar_number: body.aadharNumber ?? null,
  p_pan_number: body.panNumber ?? null,
  p_passport_number: body.passportNumber ?? null,

  p_bank_name: body.bankName ?? null,
  p_bank_account_number: body.bankAccountNumber ?? null,
  p_bank_ifsc_code: body.bankIfscCode ?? null,
  p_bank_branch: body.bankBranch ?? null,
  p_bank_account_type: body.bankAccountType ?? null,
  p_upi_id: body.upiId ?? null,
  p_gst_number: body.gstNumber ?? null,

  p_preferred_language_id: body.preferredLanguageId ?? null,
  p_timezone: body.timezone ?? null,
  p_theme_preference: body.themePreference ?? null,
  p_email_notifications: body.emailNotifications ?? null,
  p_sms_notifications: body.smsNotifications ?? null,
  p_push_notifications: body.pushNotifications ?? null,

  p_profile_completion: body.profileCompletion ?? null,
  p_is_profile_complete: body.isProfileComplete ?? null,

  p_actor_id: callerId
});

export const updateUserProfile = async (
  id: number,
  body: UpdateUserProfileBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_user_profiles', buildUpdateParams(id, body, callerId));
};

/**
 * /me update — self body is a subset of the admin body so the type
 * hierarchy lines up cleanly. Sensitive fields are already absent
 * because the schema layer uses `.strict()`.
 */
export const updateMyUserProfile = async (
  id: number,
  body: UpdateMyUserProfileBody,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_update_user_profiles', buildUpdateParams(id, body, callerId));
};

// ─── Delete (hard) ───────────────────────────────────────────────
//
// Hard delete — clears the user_profiles row only. The parent users
// row is untouched. No restore path; recreate via createUserProfile.

export const deleteUserProfile = async (
  id: number,
  callerId: number | null
): Promise<void> => {
  await db.callFunction('udf_delete_user_profiles', {
    p_id: id,
    p_actor_id: callerId
  });
};
