import { z } from "zod";
import { multipartBool } from "../../utils/zod-helpers";

export const createUserSocialMediaSchema = z.object({
  user_id: z.coerce.number().int().positive(),
  social_media_id: z.coerce.number().int().positive(),
  profile_url: z.string().min(1, 'Profile URL is required').max(1000),
  username: z.string().max(300).optional().nullable(),
  is_primary: multipartBool().optional().default(false),
  is_verified: multipartBool().optional().default(false),
});

export const updateUserSocialMediaSchema = createUserSocialMediaSchema.partial().omit({ user_id: true });
