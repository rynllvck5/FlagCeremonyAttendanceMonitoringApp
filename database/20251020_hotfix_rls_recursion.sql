-- Hotfix: resolve RLS recursion on public.user_profiles and ensure teacher/captain capabilities
-- This script is idempotent and safe to re-run.
-- Adjust ADMIN_EMAILS below to include your real admin emails before running if needed.

-- 0) Non-recursive admin check (do NOT query public.user_profiles here)
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  -- Update this list to your admin emails if different
  SELECT (auth.jwt() ->> 'email') IN (
    'admin@example.com',
    'superadmin@dmmmsu.edu.ph'
  );
$$;

-- 1) Ensure RLS is enabled on core tables
ALTER TABLE IF EXISTS public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.attendance_records ENABLE ROW LEVEL SECURITY;

-- 2) Base policies for user_profiles (drop/recreate to guarantee consistency)
DROP POLICY IF EXISTS "Users can view their own profile" ON public.user_profiles;
CREATE POLICY "Users can view their own profile"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.user_profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
CREATE POLICY "Users can insert own profile"
  ON public.user_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.user_profiles;
CREATE POLICY "Admins can update all profiles"
  ON public.user_profiles FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 3) Teacher policies: allow advisers to read advisees and their attendance
DROP POLICY IF EXISTS "teacher view advisees" ON public.user_profiles;
CREATE POLICY "teacher view advisees"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (
    user_profiles.role = 'student'::user_role AND EXISTS (
      SELECT 1 FROM public.advisory_assignments a
      WHERE a.teacher_id = auth.uid()
        AND a.program_code = user_profiles.program
        AND a.year_name = user_profiles.year
        AND a.section_name = user_profiles.section
    )
  );

DROP POLICY IF EXISTS "teacher read advisee attendance" ON public.attendance_records;
CREATE POLICY "teacher read advisee attendance"
  ON public.attendance_records FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.advisory_assignments a
        ON a.program_code = up.program
       AND a.year_name = up.year
       AND a.section_name = up.section
      WHERE up.id = attendance_records.user_id
        AND a.teacher_id = auth.uid()
    )
  );

-- 4) Captain policies: view classmates, read classmates' attendance, disable classmates' biometrics only
DROP POLICY IF EXISTS "captain view classmates" ON public.user_profiles;
CREATE POLICY "captain view classmates"
  ON public.user_profiles FOR SELECT TO authenticated
  USING (
    user_profiles.role = 'student'::user_role AND EXISTS (
      SELECT 1 FROM public.class_captains c
      WHERE c.captain_user_id = auth.uid()
        AND c.program_code = user_profiles.program
        AND c.year_name = user_profiles.year
        AND c.section_name = user_profiles.section
    )
  );

DROP POLICY IF EXISTS "captain read classmates attendance" ON public.attendance_records;
CREATE POLICY "captain read classmates attendance"
  ON public.attendance_records FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.class_captains c
        ON c.program_code = up.program
       AND c.year_name = up.year
       AND c.section_name = up.section
      WHERE up.id = attendance_records.user_id
        AND c.captain_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "captain disable classmates biometrics" ON public.user_profiles;
CREATE POLICY "captain disable classmates biometrics"
  ON public.user_profiles FOR UPDATE TO authenticated
  USING (
    user_profiles.role = 'student'::user_role
    AND user_profiles.id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.class_captains c
      WHERE c.captain_user_id = auth.uid()
        AND c.program_code = user_profiles.program
        AND c.year_name = user_profiles.year
        AND c.section_name = user_profiles.section
    )
  )
  WITH CHECK (
    biometric_enabled = false
    AND biometric_registered_at IS NULL
    AND biometric_device_id IS NULL
  );

-- 5) Grants (RLS still applies)
GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO service_role;
GRANT SELECT ON public.attendance_records TO authenticated;
