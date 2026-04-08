import { AppError } from '../../core/errors/app-error';
import { roleRepository } from './role.repository';
import { RoleRow, RoleResponse, RoleCreateInput, RoleUpdateInput, RoleListQuery } from './role.types';

// ─── Row → Response Mapper ──────────────────────────────────

const toRoleResponse = (row: RoleRow): RoleResponse => ({
  id: row.role_id,
  name: row.role_name,
  code: row.role_code,
  slug: row.role_slug,
  description: row.role_description,
  parentRoleId: row.role_parent_role_id,
  parentName: row.role_parent_name,
  parentCode: row.role_parent_code,
  level: row.role_level,
  isSystemRole: row.role_is_system_role,
  displayOrder: row.role_display_order,
  icon: row.role_icon,
  color: row.role_color,
  isActive: row.role_is_active,
  isDeleted: row.role_is_deleted,
  createdAt: row.role_created_at,
  updatedAt: row.role_updated_at,
  deletedAt: row.role_deleted_at
});

// ─── Role Service ───────────────────────────────────────────

class RoleService {

  async list(query: RoleListQuery) {
    const { rows, totalCount } = await roleRepository.findAll(query);
    return {
      roles: rows.map(toRoleResponse),
      pagination: {
        totalCount,
        pageIndex: query.pageIndex ?? 1,
        pageSize: query.pageSize ?? totalCount
      }
    };
  }

  async getById(id: number) {
    const row = await roleRepository.findById(id);
    if (!row) {
      throw new AppError('Role not found', 404, 'ROLE_NOT_FOUND');
    }
    return toRoleResponse(row);
  }

  async create(input: RoleCreateInput) {
    const { id } = await roleRepository.create(input);
    return this.getById(id);
  }

  async update(id: number, input: RoleUpdateInput) {
    await roleRepository.update(id, input);
    return this.getById(id);
  }

  async delete(id: number) {
    const result = await roleRepository.delete(id);
    return { message: result.message };
  }

  async restore(id: number, restorePermissions = false) {
    await roleRepository.restore(id, restorePermissions);
    return this.getById(id);
  }
}

export const roleService = new RoleService();
