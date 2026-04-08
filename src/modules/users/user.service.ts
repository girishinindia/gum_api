import { AppError } from '../../core/errors/app-error';

import { userRepository } from './user.repository';
import { PublicUser, UserRecord } from './user.types';

const toPublicUser = (user: UserRecord): PublicUser => {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
};

class UserService {
  async getPublicProfile(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }
    return toPublicUser(user);
  }

  async updateProfile(userId: string, patch: { name?: string }) {
    const user = await userRepository.update(userId, patch);
    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }
    return toPublicUser(user);
  }
}

export const userService = new UserService();
