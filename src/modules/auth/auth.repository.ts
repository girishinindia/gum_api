import { userRepository } from '../users/user.repository';

export const authRepository = {
  createUser: userRepository.create.bind(userRepository),
  findUserByEmail: userRepository.findByEmail.bind(userRepository),
  findUserById: userRepository.findById.bind(userRepository)
};
