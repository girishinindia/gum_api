import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { attachPermissions, requirePermission } from '../../middleware/rbac';
import { upload } from '../../middleware/upload';
import * as ctrl from './userProfile.controller';

const r = Router();
r.use(authMiddleware, attachPermissions());

// Self — any authenticated user can view/update their own profile
r.get('/me',  ctrl.getMyProfile);
r.put('/me',  upload.fields([{ name: 'profile_image', maxCount: 1 }, { name: 'cover_image', maxCount: 1 }]), ctrl.updateMyProfile);

// Admin — manage any user's profile (uses user_profile permissions)
r.get('/',                                requirePermission('user_profile', 'read'), ctrl.list);
r.get('/user/:userId',                    requirePermission('user_profile', 'read'), ctrl.getByUserId);
r.put('/user/:userId',                    requirePermission('user_profile', 'update'), upload.fields([{ name: 'profile_image', maxCount: 1 }, { name: 'cover_image', maxCount: 1 }]), ctrl.upsert);
r.delete('/user/:userId',                 requirePermission('user_profile', 'soft_delete'), ctrl.softDelete);
r.patch('/user/:userId/restore',          requirePermission('user_profile', 'restore'), ctrl.restore);
r.delete('/user/:userId/permanent',       requirePermission('user_profile', 'delete'), ctrl.remove);

export default r;
