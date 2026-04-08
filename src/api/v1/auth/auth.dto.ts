import { z } from 'zod';

// ─── Shared Validators ─────────────────────────────────────

const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
    'Password must include upper, lower, and number.'
  );

const mobileSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, 'Mobile number must be exactly 10 digits.');

const otpSchema = z.string().trim().min(4).max(8);

const sessionKeySchema = z.string().trim().min(20);

// ═══════════════════════════════════════════════════════════
// REGISTRATION (multi-step)
// ═══════════════════════════════════════════════════════════

/** POST /auth/register/initiate */
export const registerInitiateDto = z.object({
  body: z.object({
    firstName: z.string().trim().min(2).max(80),
    lastName: z.string().trim().min(1).max(80),
    email: z.string().trim().email(),
    mobile: mobileSchema,
    password: passwordSchema,
    roleCode: z.enum(['student', 'instructor']).default('student')
  })
});

/** POST /auth/register/verify-otp */
export const registerVerifyOtpDto = z.object({
  body: z.object({
    sessionKey: sessionKeySchema,
    emailOtp: otpSchema,
    mobileOtp: otpSchema
  })
});

/** POST /auth/register/resend-otp */
export const registerResendOtpDto = z.object({
  body: z.object({
    sessionKey: sessionKeySchema
  })
});

// ═══════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════

export const loginDto = z.object({
  body: z.object({
    email: z.string().trim().email(),
    password: z.string().min(8).max(128)
  })
});

// ═══════════════════════════════════════════════════════════
// REFRESH TOKEN
// ═══════════════════════════════════════════════════════════

export const refreshDto = z.object({
  body: z.object({
    refreshToken: z.string().min(20)
  })
});

// ═══════════════════════════════════════════════════════════
// FORGOT PASSWORD (multi-step)
// ═══════════════════════════════════════════════════════════

/** POST /auth/forgot-password/initiate */
export const forgotPasswordInitiateDto = z.object({
  body: z.object({
    email: z.string().trim().email(),
    mobile: mobileSchema
  })
});

/** POST /auth/forgot-password/verify-otp */
export const forgotPasswordVerifyOtpDto = z.object({
  body: z.object({
    sessionKey: sessionKeySchema,
    emailOtp: otpSchema,
    mobileOtp: otpSchema
  })
});

/** POST /auth/forgot-password/reset-password */
export const forgotPasswordResetDto = z.object({
  body: z.object({
    resetToken: sessionKeySchema,
    newPassword: passwordSchema
  })
});

/** POST /auth/forgot-password/resend-otp */
export const forgotPasswordResendOtpDto = z.object({
  body: z.object({
    sessionKey: sessionKeySchema
  })
});

// ═══════════════════════════════════════════════════════════
// CHANGE PASSWORD (authenticated, multi-step)
// ═══════════════════════════════════════════════════════════

/** POST /auth/change-password/initiate */
export const changePasswordInitiateDto = z.object({
  body: z.object({
    oldPassword: z.string().min(8).max(128),
    newPassword: passwordSchema
  })
});

/** POST /auth/change-password/verify-otp */
export const changePasswordVerifyOtpDto = z.object({
  body: z.object({
    sessionKey: sessionKeySchema,
    emailOtp: otpSchema,
    mobileOtp: otpSchema
  })
});

/** POST /auth/change-password/resend-otp */
export const changePasswordResendOtpDto = z.object({
  body: z.object({
    sessionKey: sessionKeySchema
  })
});

// ═══════════════════════════════════════════════════════════
// CHANGE EMAIL (authenticated, multi-step)
// ═══════════════════════════════════════════════════════════

/** POST /auth/change-email/initiate */
export const changeEmailInitiateDto = z.object({
  body: z.object({
    newEmail: z.string().trim().email()
  })
});

/** POST /auth/change-email/verify-otp */
export const changeEmailVerifyOtpDto = z.object({
  body: z.object({
    sessionKey: sessionKeySchema,
    emailOtp: otpSchema
  })
});

/** POST /auth/change-email/resend-otp */
export const changeEmailResendOtpDto = z.object({
  body: z.object({
    sessionKey: sessionKeySchema
  })
});

// ═══════════════════════════════════════════════════════════
// CHANGE MOBILE (authenticated, multi-step)
// ═══════════════════════════════════════════════════════════

/** POST /auth/change-mobile/initiate */
export const changeMobileInitiateDto = z.object({
  body: z.object({
    newMobile: mobileSchema
  })
});

/** POST /auth/change-mobile/verify-otp */
export const changeMobileVerifyOtpDto = z.object({
  body: z.object({
    sessionKey: sessionKeySchema,
    mobileOtp: otpSchema
  })
});

/** POST /auth/change-mobile/resend-otp */
export const changeMobileResendOtpDto = z.object({
  body: z.object({
    sessionKey: sessionKeySchema
  })
});
