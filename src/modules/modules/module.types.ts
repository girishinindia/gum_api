// ─── DB Row from udf_get_modules ────────────────────────────

export interface ModuleRow {
  module_id: number;
  module_name: string;
  module_code: string;
  module_slug: string | null;
  module_description: string | null;
  module_display_order: number;
  module_icon: string | null;
  module_color: string | null;
  module_is_active: boolean;
  module_created_at: string;
  module_updated_at: string;
  total_count: number;
}

// ─── API Response (camelCase) ───────────────────────────────

export interface ModuleResponse {
  id: number;
  name: string;
  code: string;
  slug: string | null;
  description: string | null;
  displayOrder: number;
  icon: string | null;
  color: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Service Input Types ────────────────────────────────────

export interface ModuleCreateInput {
  name: string;
  code: string;
  description?: string;
  displayOrder?: number;
  icon?: string;
  color?: string;
  isActive?: boolean;
  createdBy?: number;
}

export interface ModuleUpdateInput {
  name?: string;
  code?: string;
  description?: string;
  displayOrder?: number;
  icon?: string;
  color?: string;
  isActive?: boolean;
  updatedBy?: number;
}

export interface ModuleListQuery {
  id?: number;
  code?: string;
  isActive?: boolean;
  searchTerm?: string;
  sortColumn?: string;
  sortDirection?: string;
  pageIndex?: number;
  pageSize?: number;
}
