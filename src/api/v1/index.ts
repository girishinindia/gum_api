import { Router } from 'express';

import { authRoutes } from './auth/auth.routes';
import { healthRoutes } from './health/health.routes';
import { menuItemRoutes } from './menu-items/menu-item.routes';
import { moduleRoutes } from './modules/module.routes';
import { permissionRoutes } from './permissions/permission.routes';
import { roleChangeLogRoutes } from './role-change-log/role-change-log.routes';
import { rolePermissionRoutes } from './role-permissions/role-permission.routes';
import { roleRoutes } from './roles/role.routes';
import { uploadRoutes } from './uploads/upload.routes';
import { userRoleAssignmentRoutes } from './user-role-assignments/user-role-assignment.routes';
import { userRoutes } from './users/user.routes';

const v1Router = Router();

// ─── Public / Auth ─────────────────────────────────────────
v1Router.use('/health', healthRoutes);
v1Router.use('/auth', authRoutes);
v1Router.use('/uploads', uploadRoutes);

// ─── RBAC Entities ─────────────────────────────────────────
v1Router.use('/users', userRoutes);
v1Router.use('/roles', roleRoutes);
v1Router.use('/modules', moduleRoutes);
v1Router.use('/permissions', permissionRoutes);
v1Router.use('/role-permissions', rolePermissionRoutes);
v1Router.use('/user-role-assignments', userRoleAssignmentRoutes);
v1Router.use('/menu-items', menuItemRoutes);
v1Router.use('/role-change-log', roleChangeLogRoutes);

export { v1Router };
