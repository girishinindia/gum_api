import bcrypt from 'bcryptjs';

import { env } from '../../config/env';

export const hashPassword = (plainTextPassword: string) => {
  return bcrypt.hash(plainTextPassword, env.BCRYPT_SALT_ROUNDS);
};

export const comparePassword = (plainTextPassword: string, hash: string) => {
  return bcrypt.compare(plainTextPassword, hash);
};
