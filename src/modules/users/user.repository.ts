import { db } from '../../database/db';
import { UserRow, UserListQuery, UserCreateInput, UserUpdateInput } from './user.types';

// ─── User Repository (PostgreSQL via UDFs) ──────────────────

export const userRepository = {

  // ─── List / Single ──────────────────────────────────────────

  async findAll(query: UserListQuery): Promise<{ rows: UserRow[]; totalCount: number }> {
    return db.callTableFunction<UserRow>('udf_get_users', {
      p_id: query.id,
      p_is_active: query.isActive,
      p_filter_is_active: query.filterIsActive,
      p_filter_is_deleted: query.filterIsDeleted,
      p_filter_is_email_verified: query.filterIsEmailVerified,
      p_filter_is_mobile_verified: query.filterIsMobileVerified,
      p_filter_country_id: query.filterCountryId,
      p_filter_country_iso2: query.filterCountryIso2,
      p_filter_country_nationality: query.filterCountryNationality,
      p_search_term: query.searchTerm,
      p_sort_column: query.sortColumn,
      p_sort_direction: query.sortDirection,
      p_page_index: query.pageIndex,
      p_page_size: query.pageSize
    });
  },

  async findById(id: number): Promise<UserRow | null> {
    const { rows } = await this.findAll({ id });
    return rows[0] ?? null;
  },

  // ─── Create ─────────────────────────────────────────────────

  async create(input: UserCreateInput): Promise<{ id: number }> {
    const result = await db.callFunction('udf_users_insert', {
      p_first_name: input.firstName,
      p_last_name: input.lastName,
      p_password: input.password,
      p_email: input.email ?? null,
      p_mobile: input.mobile ?? null,
      p_country_id: input.countryId ?? null,
      p_is_active: input.isActive ?? null,
      p_is_email_verified: input.isEmailVerified ?? null,
      p_is_mobile_verified: input.isMobileVerified ?? null,
      p_created_by: input.createdBy ?? null
    });
    return { id: result.id! };
  },

  // ─── Update ─────────────────────────────────────────────────

  async update(id: number, input: UserUpdateInput) {
    return db.callFunction('udf_users_update', {
      p_id: id,
      p_first_name: input.firstName ?? null,
      p_last_name: input.lastName ?? null,
      p_email: input.email ?? null,
      p_mobile: input.mobile ?? null,
      p_password: input.password ?? null,
      p_country_id: input.countryId ?? null,
      p_is_active: input.isActive ?? null,
      p_is_email_verified: input.isEmailVerified ?? null,
      p_is_mobile_verified: input.isMobileVerified ?? null,
      p_updated_by: input.updatedBy ?? null
    });
  },

  // ─── Delete (soft) ──────────────────────────────────────────

  async delete(id: number) {
    return db.callFunction('udf_users_delete', { p_id: id });
  },

  // ─── Restore ────────────────────────────────────────────────

  async restore(id: number) {
    return db.callFunction('udf_users_restore', { p_id: id });
  }
};
