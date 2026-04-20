import { z } from 'zod';

export const createUserEducationSchema = z.object({
  user_id: z.coerce.number().int().positive(),
  education_level_id: z.coerce.number().int().positive(),
  institution_name: z.string().min(1, 'Institution name is required').max(500),
  board_or_university: z.string().max(500).optional().nullable(),
  field_of_study: z.string().max(500).optional().nullable(),
  specialization: z.string().max(500).optional().nullable(),
  grade_or_percentage: z.string().max(100).optional().nullable(),
  grade_type: z.enum(['percentage', 'cgpa', 'gpa', 'grade', 'pass_fail', 'other']).optional().nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  is_currently_studying: z.coerce.boolean().optional().default(false),
  is_highest_qualification: z.coerce.boolean().optional().default(false),
  description: z.string().max(2000).optional().nullable(),
});

export const updateUserEducationSchema = createUserEducationSchema.partial().omit({ user_id: true });
