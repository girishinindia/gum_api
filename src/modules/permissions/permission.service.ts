import { AppError } from '../../core/errors/app-error';
import { permissionRepository } from './permission.repository';
import { PermissionRow, PermissionResponse, PermissionCreateInput, PermissionUpdateInput, PermissionListQuery } from './permission.types';

// ─── Row → Response Mapper ──────────────────────────────────

const toPermissionResponse = (row: PermissionRow): PermissionResponse => ({
  id: row.perm_id,
  moduleId: row.perm_module_id,
  moduleName: row.perm_module_name,
  moduleCode: row.perm_module_code,
  name: row.perm_name,
  code: row.perm_code,
  description: row.perm_description,
  resource: row.perm_resource,
  action: row.perm_action,
  scope: row.perm_scope,
  displayOrder: row.perm_display_order,
  isActive: row.perm_is_active,
  createdAt: row.perm_created_at,
  updatedAt: row.perm_updated_at
});

// ─── Permission Service ─────────────────────────────────────

class PermissionService {

  async list(query: PermissionListQuery) {
    const { rows, totalCount } = await permissionRepository.findAll(query);
    return {
      permissions: rows.map(toPermissionResponse),
      pagination: {
        totalCount,
        pageIndex: query.pageIndex ?? 1,
        pageSize: query.pageSize ?? totalCount
      }
    };
  }

  async getById(id: number) {
    const row = await permissionRepository.findById(id);
    if (!row) {
      throw new AppError('Permission not found', 404, 'PERMISSION_NOT_FOUND');
    }
    return toPermissionResponse(row);
  }

  async create(input: PermissionCreateInput) {
    const { id } = await permissionRepository.create(input);
    return this.getById(id);
  }

  async update(id: number, input: PermissionUpdateInput) {
    await permissionRepository.update(id, input);
    return this.getById(id);
  }

  async delete(id: number) {
    const result = await permissionRepository.delete(id);
    return { message: result.message };
  }

  async restore(id: number) {
    await permissionRepository.restore(id);
    return this.getById(id);
  }
}

export const permissionService = new PermissionService();
