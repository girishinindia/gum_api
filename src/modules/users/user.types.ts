// ─── DB Row from udf_get_users (matches view uv_users columns) ──

export interface UserRow {
  user_id: number;
  user_country_id: number;
  user_first_name: string;
  user_last_name: string;
  user_email: string | null;
  user_mobile: string | null;
  user_is_active: boolean;
  user_is_deleted: boolean;
  user_is_email_verified: boolean;
  user_is_mobile_verified: boolean;
  user_last_login: string | null;
  user_email_verified_at: string | null;
  user_mobile_verified_at: string | null;
  user_created_at: string;
  user_updated_at: string;
  user_deleted_at: string | null;
  // Country join columns
  country_name: string | null;
  country_iso2: string | null;
  country_iso3: string | null;
  country_phone_code: string | null;
  country_nationality: string | null;
  country_national_language: string | null;
  country_languages: unknown | null;
  country_currency: string | null;
  country_currency_name: string | null;
  country_currency_symbol: string | null;
  country_flag_image: string | null;
  country_is_active: boolean | null;
  country_is_deleted: boolean | null;
  // Pagination
  total_count: number;
}

// ─── API Response (camelCase) ───────────────────────────────

export interface UserResponse {
  id: number;
  countryId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  mobile: string | null;
  isActive: boolean;
  isDeleted: boolean;
  isEmailVerified: boolean;
  isMobileVerified: boolean;
  lastLogin: string | null;
  emailVerifiedAt: string | null;
  mobileVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  country: {
    name: string | null;
    iso2: string | null;
    iso3: string | null;
    phoneCode: string | null;
    nationality: string | null;
    nationalLanguage: string | null;
    languages: unknown | null;
    currency: string | null;
    currencyName: string | null;
    currencySymbol: string | null;
    flagImage: string | null;
  } | null;
}

// ─── Service Input Types ────────────────────────────────────

export interface UserCreateInput {
  firstName: string;
  lastName: string;
  email?: string;
  mobile?: string;
  password: string;
  countryId?: number;
  isActive?: boolean;
  isEmailVerified?: boolean;
  isMobileVerified?: boolean;
  createdBy?: number;
}

export interface UserUpdateInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  mobile?: string;
  password?: string;
  countryId?: number;
  isActive?: boolean;
  isEmailVerified?: boolean;
  isMobileVerified?: boolean;
  updatedBy?: number;
}

export interface UserListQuery {
  id?: number;
  isActive?: boolean;
  filterIsActive?: boolean;
  filterIsDeleted?: boolean;
  filterIsEmailVerified?: boolean;
  filterIsMobileVerified?: boolean;
  filterCountryId?: number;
  filterCountryIso2?: string;
  filterCountryNationality?: string;
  searchTerm?: string;
  sortColumn?: string;
  sortDirection?: string;
  pageIndex?: number;
  pageSize?: number;
}
