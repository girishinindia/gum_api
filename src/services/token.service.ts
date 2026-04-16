import jwt from 'jsonwebtoken';
import { config } from '../config';

export const generateTokens = (userId: number) => ({
  access_token: jwt.sign({ sub: userId, type: 'access' }, config.jwt.accessSecret, { expiresIn: config.jwt.accessExpiresIn }),
  refresh_token: jwt.sign({ sub: userId, type: 'refresh' }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn }),
});

export const verifyAccess = (token: string) => {
  const p = jwt.verify(token, config.jwt.accessSecret) as any;
  if (p.type !== 'access') throw new Error('Wrong token type');
  return p;
};

export const verifyRefresh = (token: string) => {
  const p = jwt.verify(token, config.jwt.refreshSecret) as any;
  if (p.type !== 'refresh') throw new Error('Wrong token type');
  return p;
};
