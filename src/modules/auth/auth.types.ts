// ─── JWT Token Payload ──────────────────────────────────────

export type AuthTokenPayload = {
  userId: number;
  email: string;
};

// ─── Auth Inputs ────────────────────────────────────────────

export type RegisterInitiateInput = {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  password: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type ForgotPasswordInitiateInput = {
  email: string;
  mobile: string;
};

export type ChangePasswordInitiateInput = {
  oldPassword: string;
  newPassword: string;
};

export type ChangeEmailInitiateInput = {
  newEmail: string;
};

export type ChangeMobileInitiateInput = {
  newMobile: string;
};

// ─── DB Row from UDF table-returning functions ──────────────

export interface AuthUserRow {
  user_id: number;
  user_first_name: string;
  user_last_name: string;
  user_email: string | null;
  user_mobile: string | null;
  user_is_active: boolean;
  user_is_email_verified: boolean;
  user_is_mobile_verified: boolean;
  user_last_login: string | null;
  user_created_at: string;
  user_updated_at: string;
}

/** Row from udf_find_user_by_email_mobile (subset — no login/timestamps) */
export interface AuthUserBasicRow {
  user_id: number;
  user_first_name: string;
  user_last_name: string;
  user_email: string | null;
  user_mobile: string | null;
  user_is_active: boolean;
  user_is_email_verified: boolean;
  user_is_mobile_verified: boolean;
}

// ─── API Response ───────────────────────────────────────────

export interface AuthUserPublic {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  mobile: string | null;
  isActive: boolean;
  isEmailVerified: boolean;
  isMobileVerified: boolean;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Pending Session Data (stored in Redis) ─────────────────

export interface PendingRegisterSession {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  password: string;
}

export interface PendingForgotPasswordSession {
  userId: number;
  email: string;
  mobile: string;
}

export interface PendingChangePasswordSession {
  userId: number;
  email: string;
  mobile: string;
  newPassword: string;
}

export interface PendingChangeEmailSession {
  userId: number;
  newEmail: string;
}

export interface PendingChangeMobileSession {
  userId: number;
  newMobile: string;
}
