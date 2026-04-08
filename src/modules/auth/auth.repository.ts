import { db } from '../../database/db';
import { AuthUserRow, AuthUserBasicRow } from './auth.types';

// ─── Auth Repository (PostgreSQL via UDFs — no direct table access) ──

export const authRepository = {

  // ─── Verify Credentials (login) ────────────────────────────

  /** Verify email + password via udf_verify_credentials. Returns null if invalid. */
  async verifyCredentials(email: string, password: string): Promise<AuthUserRow | null> {
    const result = await db.query<AuthUserRow>(
      `SELECT * FROM udf_verify_credentials(p_email := $1, p_password := $2)`,
      [email, password]
    );
    return result.rows[0] ?? null;
  },

  // ─── Check Email Exists ────────────────────────────────────

  async emailExists(email: string): Promise<boolean> {
    const result = await db.query<{ result: { exists: boolean } }>(
      `SELECT udf_check_email_exists(p_email := $1) AS result`,
      [email]
    );
    return result.rows[0]?.result?.exists ?? false;
  },

  // ─── Check Mobile Exists ───────────────────────────────────

  async mobileExists(mobile: string): Promise<boolean> {
    const result = await db.query<{ result: { exists: boolean } }>(
      `SELECT udf_check_mobile_exists(p_mobile := $1) AS result`,
      [mobile]
    );
    return result.rows[0]?.result?.exists ?? false;
  },

  // ─── Find User by Email + Mobile (forgot password) ────────

  async findByEmailMobile(email: string, mobile: string): Promise<AuthUserBasicRow | null> {
    const result = await db.query<AuthUserBasicRow>(
      `SELECT * FROM udf_find_user_by_email_mobile(p_email := $1, p_mobile := $2)`,
      [email, mobile]
    );
    return result.rows[0] ?? null;
  },

  // ─── Find User by ID ──────────────────────────────────────

  async findById(userId: number): Promise<AuthUserRow | null> {
    const result = await db.query<AuthUserRow>(
      `SELECT * FROM udf_find_user_by_id(p_user_id := $1)`,
      [userId]
    );
    return result.rows[0] ?? null;
  },

  // ─── Verify Current Password ──────────────────────────────

  async verifyPassword(userId: number, password: string): Promise<boolean> {
    const result = await db.query<{ result: { valid: boolean } }>(
      `SELECT udf_verify_user_password(p_user_id := $1, p_password := $2) AS result`,
      [userId, password]
    );
    return result.rows[0]?.result?.valid ?? false;
  },

  // ─── Create User ──────────────────────────────────────────

  async createUser(input: {
    firstName: string;
    lastName: string;
    email: string;
    mobile: string;
    password: string;
  }): Promise<{ id: number }> {
    const result = await db.callFunction('udf_users_insert', {
      p_first_name: input.firstName,
      p_last_name: input.lastName,
      p_password: input.password,
      p_email: input.email,
      p_mobile: input.mobile,
      p_is_email_verified: true,
      p_is_mobile_verified: true
    });
    return { id: result.id! };
  },

  // ─── Update Password ─────────────────────────────────────

  async updatePassword(userId: number, newPassword: string): Promise<void> {
    await db.callFunction('udf_users_update', {
      p_id: userId,
      p_password: newPassword
    });
  },

  // ─── Update Email ─────────────────────────────────────────

  async updateEmail(userId: number, newEmail: string): Promise<void> {
    await db.callFunction('udf_users_update', {
      p_id: userId,
      p_email: newEmail,
      p_is_email_verified: true
    });
  },

  // ─── Update Mobile ────────────────────────────────────────

  async updateMobile(userId: number, newMobile: string): Promise<void> {
    await db.callFunction('udf_users_update', {
      p_id: userId,
      p_mobile: newMobile,
      p_is_mobile_verified: true
    });
  },

  // ─── Update Last Login ────────────────────────────────────

  async updateLastLogin(userId: number): Promise<void> {
    await db.callFunction('udf_update_last_login', { p_user_id: userId });
  }
};
