import { z } from 'zod';

export const EMPLOYMENT_TYPES = ['full_time','part_time','contract','internship','freelance','self_employed','volunteer','apprenticeship','other'] as const;
export const WORK_MODES = ['on_site','remote','hybrid'] as const;

export const createUserExperienceSchema = z.object({
  user_id: z.coerce.number().int().positive(),
  designation_id: z.coerce.number().int().positive().optional().nullable(),
  company_name: z.string().min(1, 'Company name is required').max(500),
  job_title: z.string().min(1, 'Job title is required').max(500),
  employment_type: z.enum(EMPLOYMENT_TYPES).optional().default('full_time'),
  department: z.string().max(300).optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  work_mode: z.enum(WORK_MODES).optional().default('on_site'),
  start_date: z.string().min(1, 'Start date is required'),
  end_date: z.string().optional().nullable(),
  is_current_job: z.coerce.boolean().optional().default(false),
  description: z.string().max(5000).optional().nullable(),
  key_achievements: z.string().max(5000).optional().nullable(),
  skills_used: z.string().max(2000).optional().nullable(),
  salary_range: z.string().max(100).optional().nullable(),
  reference_name: z.string().max(300).optional().nullable(),
  reference_phone: z.string().max(20).optional().nullable(),
  reference_email: z.string().email().optional().nullable(),
});

export const updateUserExperienceSchema = createUserExperienceSchema.partial().omit({ user_id: true });
