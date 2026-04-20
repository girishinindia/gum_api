import { z } from 'zod';

export const upsertUserProfileSchema = z.object({
  // Personal Information
  date_of_birth: z.string().optional().nullable(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional().nullable(),
  blood_group: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional().nullable(),
  marital_status: z.enum(['single', 'married', 'divorced', 'widowed', 'separated']).optional().nullable(),

  // Permanent Address
  permanent_address_line1: z.string().max(255).optional().nullable(),
  permanent_address_line2: z.string().max(255).optional().nullable(),
  permanent_city_id: z.coerce.number().optional().nullable(),
  permanent_state_id: z.coerce.number().optional().nullable(),
  permanent_country_id: z.coerce.number().optional().nullable(),
  permanent_postal_code: z.string().max(20).optional().nullable(),

  // Current Address
  current_address_line1: z.string().max(255).optional().nullable(),
  current_address_line2: z.string().max(255).optional().nullable(),
  current_city_id: z.coerce.number().optional().nullable(),
  current_state_id: z.coerce.number().optional().nullable(),
  current_country_id: z.coerce.number().optional().nullable(),
  current_postal_code: z.string().max(20).optional().nullable(),

  // Alternate Contact
  alternate_email: z.string().email().max(255).optional().nullable(),
  alternate_phone: z.string().max(20).optional().nullable(),

  // Emergency Contact
  emergency_contact_name: z.string().max(100).optional().nullable(),
  emergency_contact_relationship: z.string().max(50).optional().nullable(),
  emergency_contact_phone: z.string().max(20).optional().nullable(),
  emergency_contact_email: z.string().email().max(255).optional().nullable(),

  // Identity / KYC
  aadhar_number: z.string().max(12).optional().nullable(),
  pan_number: z.string().max(10).optional().nullable(),
  passport_number: z.string().max(20).optional().nullable(),
  driving_license_number: z.string().max(20).optional().nullable(),
  voter_id: z.string().max(20).optional().nullable(),

  // Bank Details
  bank_account_name: z.string().max(100).optional().nullable(),
  bank_account_number: z.string().max(30).optional().nullable(),
  bank_ifsc_code: z.string().max(11).optional().nullable(),
  bank_name: z.string().max(100).optional().nullable(),
  bank_branch: z.string().max(100).optional().nullable(),

  // UPI
  upi_id: z.string().max(100).optional().nullable(),
  upi_number: z.string().max(20).optional().nullable(),

  // Preferences
  preferred_language_id: z.coerce.number().optional().nullable(),
  notification_email: z.coerce.boolean().optional(),
  notification_sms: z.coerce.boolean().optional(),
  notification_push: z.coerce.boolean().optional(),

  // Resume / Public Profile
  bio: z.string().max(2000).optional().nullable(),
  headline: z.string().max(200).optional().nullable(),
  profile_slug: z.string().max(100).regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, 'Slug must be lowercase alphanumeric with dots, hyphens, or underscores').optional().nullable(),
  is_profile_public: z.coerce.boolean().optional(),
}).partial();
