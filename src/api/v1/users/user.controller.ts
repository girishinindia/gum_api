import { Request, Response } from 'express';

import { sendSuccess } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { userService } from '../../../modules/users/user.service';

// ─── Self (authenticated user) ──────────────────────────────

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const data = await userService.getProfile(userId);
  return sendSuccess(res, data, 'Current user fetched');
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const data = await userService.updateProfile(userId, req.body);
  return sendSuccess(res, data, 'Profile updated');
});

// ─── Admin CRUD ─────────────────────────────────────────────

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const query = {
    filterIsActive: req.query.isActive != null ? req.query.isActive === 'true' : undefined,
    filterIsDeleted: req.query.isDeleted != null ? req.query.isDeleted === 'true' : undefined,
    filterIsEmailVerified: req.query.isEmailVerified != null ? req.query.isEmailVerified === 'true' : undefined,
    filterIsMobileVerified: req.query.isMobileVerified != null ? req.query.isMobileVerified === 'true' : undefined,
    filterCountryId: req.query.countryId ? Number(req.query.countryId) : undefined,
    filterCountryIso2: req.query.countryIso2 as string | undefined,
    filterCountryNationality: req.query.nationality as string | undefined,
    searchTerm: req.query.search as string | undefined,
    sortColumn: req.query.sortBy as string | undefined,
    sortDirection: req.query.sortDir as string | undefined,
    pageIndex: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.limit ? Number(req.query.limit) : undefined
  };
  const data = await userService.list(query);
  return sendSuccess(res, data, 'Users fetched');
});

export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const data = await userService.getById(id);
  return sendSuccess(res, data, 'User fetched');
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const createdBy = req.user!.userId;
  const data = await userService.create({ ...req.body, createdBy });
  return sendSuccess(res, data, 'User created', 201);
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const updatedBy = req.user!.userId;
  const data = await userService.update(id, { ...req.body, updatedBy });
  return sendSuccess(res, data, 'User updated');
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const currentUserId = req.user!.userId;
  const data = await userService.delete(id, currentUserId);
  return sendSuccess(res, data, 'User deleted');
});

export const restoreUser = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const currentUserId = req.user!.userId;
  const data = await userService.restore(id, currentUserId);
  return sendSuccess(res, data, 'User restored');
});
