-- FINAL FIX: Remove ALL policies causing recursion and rebuild minimal safe policies
-- This script completely resets policies on user_profiles to eliminate recursion
-- Safe to re-run multiple times

-- Step 1: Replace is_admin with absolutely minimal non-recursive version
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Direct JWT check - does NOT touch any tables
  RETURN (
    SELECT (auth.jwt() ->> 'email') = ANY(ARRAY[
      'admin@example.com',
      'superadmin@dmmmsu.edu.ph'
    ])
  );
END;
$$;

-- Step 2: Create helper function to check user's own role without recursion
CREATE OR REPLACE FUNCTION public.get_user_role(uid uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
BEGIN
  -- Direct query bypassing RLS via SECURITY DEFINER
  SELECT role::text INTO user_role FROM public.user_profiles WHERE id = uid;
  RETURN user_role;
END;
$$;

-- Step 3: Drop ALL existing policies on user_profiles to start clean
DO $$ 
DECLARE
  pol record;
BEGIN
  FOR pol IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'user_profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_profiles', pol.policyname);
  END LOOP;
END $$;

-- Step 4: Create minimal safe policies on user_profiles

-- Allow admins to do everything (no table reference, just function)
CREATE POLICY "admin_full_access"
  ON public.user_profiles
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Allow users to view and update their own profile
CREATE POLICY "own_profile_access"
  ON public.user_profiles
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow teachers to view students in their advisory (safe - uses external table join)
CREATE POLICY "teacher_view_advisees"
  ON public.user_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 
      FROM public.advisory_assignments aa
      WHERE aa.teacher_id = auth.uid()
        AND aa.program_code = user_profiles.program
        AND aa.year_name = user_profiles.year  
        AND aa.section_name = user_profiles.section
        AND public.get_user_role(user_profiles.id) = 'student'
    )
  );

-- Allow captains to view classmates (safe - uses external table join)
CREATE POLICY "captain_view_classmates"
  ON public.user_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.class_captains cc
      WHERE cc.captain_user_id = auth.uid()
        AND cc.program_code = user_profiles.program
        AND cc.year_name = user_profiles.year
        AND cc.section_name = user_profiles.section
        AND public.get_user_role(user_profiles.id) = 'student'
    )
  );

-- Allow captains to disable (only) classmates' biometrics
CREATE POLICY "captain_disable_biometrics"
  ON public.user_profiles FOR UPDATE
  USING (
    user_profiles.id <> auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.class_captains cc
      WHERE cc.captain_user_id = auth.uid()
        AND cc.program_code = user_profiles.program
        AND cc.year_name = user_profiles.year
        AND cc.section_name = user_profiles.section
    )
  )
  WITH CHECK (
    biometric_enabled = false
    AND biometric_registered_at IS NULL
    AND biometric_device_id IS NULL
  );

-- Step 5: Attendance records policies
DROP POLICY IF EXISTS "teacher read advisee attendance" ON public.attendance_records;
CREATE POLICY "teacher read advisee attendance"
  ON public.attendance_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.advisory_assignments aa
      INNER JOIN public.user_profiles up ON up.id = attendance_records.user_id
      WHERE aa.teacher_id = auth.uid()
        AND aa.program_code = up.program
        AND aa.year_name = up.year
        AND aa.section_name = up.section
    )
  );

DROP POLICY IF EXISTS "captain read classmates attendance" ON public.attendance_records;
CREATE POLICY "captain read classmates attendance"
  ON public.attendance_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.class_captains cc
      INNER JOIN public.user_profiles up ON up.id = attendance_records.user_id
      WHERE cc.captain_user_id = auth.uid()
        AND cc.program_code = up.program
        AND cc.year_name = up.year
        AND cc.section_name = up.section
    )
  );

-- Step 6: Ensure basic grants exist
GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;
GRANT SELECT ON public.attendance_records TO authenticated;

-- Step 7: Verify the fix
DO $$
BEGIN
  RAISE NOTICE 'Policy reset complete. Run SELECT pg_get_functiondef(''public.is_admin''::regproc) to verify.';
END $$;
