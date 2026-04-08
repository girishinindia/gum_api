import crypto from 'crypto';

import { env } from '../../config/env';

/**
 * Generate a cryptographically secure numeric OTP.
 */
export const generateOtp = (): string => {
  const digits = env.OTP_LENGTH;
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  const otp = crypto.randomInt(min, max + 1);
  return otp.toString();
};
