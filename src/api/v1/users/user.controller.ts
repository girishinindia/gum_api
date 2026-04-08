import { Request, Response } from 'express';

import { sendSuccess } from '../../../core/utils/api-response';
import { asyncHandler } from '../../../core/utils/async-handler';
import { userService } from '../../../modules/users/user.service';

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const data = await userService.getPublicProfile(userId);
  return sendSuccess(res, data, 'Current user fetched');
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const data = await userService.updateProfile(userId, req.body);
  return sendSuccess(res, data, 'Profile updated');
});
