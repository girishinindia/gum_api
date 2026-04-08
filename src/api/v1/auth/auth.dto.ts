import { z } from 'zod';

export const registerDto = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email(),
    password: z
      .string()
      .min(8)
      .max(128)
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, 'Password must include upper, lower, and number.')
  })
});

export const loginDto = z.object({
  body: z.object({
    email: z.string().trim().email(),
    password: z.string().min(8).max(128)
  })
});

export const refreshDto = z.object({
  body: z.object({
    refreshToken: z.string().min(20)
  })
});
