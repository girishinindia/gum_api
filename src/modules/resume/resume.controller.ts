import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { ok, err } from '../../utils/response';

// ── Public resume endpoint — no auth required ──

export async function getBySlug(req: Request, res: Response) {
  const { slug } = req.params;

  // 1. Find the user profile by slug
  const { data: profile, error: profileErr } = await supabase
    .from('user_profiles')
    .select(`
      user_id, bio, headline, profile_image_url, cover_image_url,
      date_of_birth, gender, marital_status,
      alternate_email, alternate_phone,
      emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, emergency_contact_email,
      permanent_address_line1, permanent_address_line2, permanent_postal_code,
      permanent_city:cities!user_profiles_permanent_city_id_fkey(id, name),
      permanent_state:states!user_profiles_permanent_state_id_fkey(id, name),
      permanent_country:countries!user_profiles_permanent_country_id_fkey(id, name),
      current_address_line1, current_address_line2, current_postal_code,
      current_city:cities!user_profiles_current_city_id_fkey(id, name),
      current_state:states!user_profiles_current_state_id_fkey(id, name),
      current_country:countries!user_profiles_current_country_id_fkey(id, name),
      user:users!user_profiles_user_id_fkey(id, full_name, email, mobile, avatar_url),
      preferred_language:languages!user_profiles_preferred_language_id_fkey(id, name)
    `)
    .eq('profile_slug', slug)
    .eq('is_profile_public', true)
    .is('deleted_at', null)
    .single();

  if (profileErr || !profile) return err(res, 'Resume not found or not public', 404);

  const userId = profile.user_id;

  // 2. Fetch all sections in parallel
  const [education, experience, skills, languages, socialMedia, projects] = await Promise.all([
    supabase
      .from('user_education')
      .select(`
        id, institution_name, field_of_study, degree_title, board_or_university,
        specialization, start_date, end_date, is_current, grade_or_percentage,
        description, achievements,
        education_level:education_levels(id, name)
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('start_date', { ascending: false }),

    supabase
      .from('user_experience')
      .select(`
        id, company_name, job_title, employment_type, department, location,
        work_mode, start_date, end_date, is_current_job, description,
        key_achievements, skills_used,
        designation:designations(id, name)
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('start_date', { ascending: false }),

    supabase
      .from('user_skills')
      .select(`
        id, proficiency_level, years_of_experience, is_primary,
        certificate_url, endorsement_count,
        skill:skills(id, name)
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('is_primary', { ascending: false }),

    supabase
      .from('user_languages')
      .select(`
        id, proficiency_level, can_read, can_write, can_speak,
        is_primary, is_native,
        language:languages(id, name)
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('is_primary', { ascending: false }),

    supabase
      .from('user_social_medias')
      .select(`
        id, profile_url, username, is_primary,
        social_media:social_medias(id, name, icon, base_url)
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('is_primary', { ascending: false }),

    supabase
      .from('user_projects')
      .select(`
        id, project_title, project_code, project_type, description,
        role_in_project, technologies_used, tools_used,
        programming_languages, frameworks, databases_used, platform,
        start_date, end_date, is_ongoing, project_status,
        key_achievements, impact_summary,
        project_url, repository_url, demo_url, documentation_url,
        thumbnail_url, is_featured, organization_name
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('is_published', true)
      .is('deleted_at', null)
      .order('display_order', { ascending: true }),
  ]);

  return ok(res, {
    profile,
    education: education.data || [],
    experience: experience.data || [],
    skills: skills.data || [],
    languages: languages.data || [],
    socialMedia: socialMedia.data || [],
    projects: projects.data || [],
  });
}
