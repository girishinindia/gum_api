import { AppError } from '../../core/errors/app-error';
import { moduleRepository } from './module.repository';
import { ModuleRow, ModuleResponse, ModuleCreateInput, ModuleUpdateInput, ModuleListQuery } from './module.types';

// ─── Row → Response Mapper ──────────────────────────────────

const toModuleResponse = (row: ModuleRow): ModuleResponse => ({
  id: row.module_id,
  name: row.module_name,
  code: row.module_code,
  slug: row.module_slug,
  description: row.module_description,
  displayOrder: row.module_display_order,
  icon: row.module_icon,
  color: row.module_color,
  isActive: row.module_is_active,
  createdAt: row.module_created_at,
  updatedAt: row.module_updated_at
});

// ─── Module Service ─────────────────────────────────────────

class ModuleService {

  async list(query: ModuleListQuery) {
    const { rows, totalCount } = await moduleRepository.findAll(query);
    return {
      modules: rows.map(toModuleResponse),
      pagination: {
        totalCount,
        pageIndex: query.pageIndex ?? 1,
        pageSize: query.pageSize ?? totalCount
      }
    };
  }

  async getById(id: number) {
    const row = await moduleRepository.findById(id);
    if (!row) {
      throw new AppError('Module not found', 404, 'MODULE_NOT_FOUND');
    }
    return toModuleResponse(row);
  }

  async create(input: ModuleCreateInput) {
    const { id } = await moduleRepository.create(input);
    return this.getById(id);
  }

  async update(id: number, input: ModuleUpdateInput) {
    await moduleRepository.update(id, input);
    return this.getById(id);
  }

  async delete(id: number) {
    const result = await moduleRepository.delete(id);
    return { message: result.message };
  }

  async restore(id: number) {
    await moduleRepository.restore(id);
    return this.getById(id);
  }
}

export const moduleService = new ModuleService();
